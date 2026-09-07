import { Injectable } from '@nestjs/common';
import { LlmProviderService } from '../llm/llm-provider.service';
import { PrismaService } from '../prisma/prisma.service';
import { TestsService } from '../tests/tests.service';
import { materializeLocators } from '../tests/locator-materializer';
import { flattenComponentSteps } from '../tests/step-flattener';
import type { RecordedStep } from '../recording/step-parser';

const SYSTEM_PROMPT = `You translate plain-English QA test steps into a structured JSON step list \
for a browser automation tool. Given a numbered or line-separated list of instructions like:
"Click the Submit button"
"Type 'alice@example.com' into the email field"
"Assert that the welcome message is visible"
"Wait until the URL contains /dashboard"

Respond with ONLY a JSON array (no markdown fences, no prose) of objects matching this shape:
{
  "action": "goto"|"click"|"fill"|"press"|"check"|"select"|"assertVisible"|"assertHidden"|"assertText"|"assertValue"|"assertUrl"|"assertCount"|"waitForVisible"|"waitForUrl",
  "selector"?: string,          // for role: the ARIA role (e.g. "button", "textbox", "link", "checkbox")
  "selectorStrategy"?: "role"|"label"|"placeholder"|"text",  // ALWAYS prefer "role" when you can infer one
  "roleName"?: string,          // for role strategy: the accessible name (visible label/text) of the element
  "value"?: string              // text to type, URL to assert/wait for, key to press, etc.
}
Rules:
- Never use "css" or "testid" strategy — you cannot see the real page, so only role/label/placeholder/text
  (all resolvable purely from the described visible text) are safe guesses.
- "Click the X button" -> { action: "click", selectorStrategy: "role", selector: "button", roleName: "X" }
- "Type 'V' into the Y field" -> { action: "fill", selectorStrategy: "label", roleName: undefined, selector: "Y", value: "V" }
  (for fill/select targeting a labeled input, put the label text in "selector" when strategy is "label" or "placeholder")
- "Assert/verify/check that X is visible" -> assertVisible with a role or text guess for X
- "Assert the page shows 'X'" -> { action: "assertText", selectorStrategy: "text", selector: "X" } is NOT needed —
  for whole-page text assertions with no specific element described, use assertText with selectorStrategy "text"
  and selector set to "body".
- "Wait for the URL to contain X" / "Wait until redirected to X" -> { action: "waitForUrl", value: "X" }
- One JSON object per instruction line, in the same order.`;

@Injectable()
export class NlpService {
  constructor(
    private readonly llm: LlmProviderService,
    private readonly prisma: PrismaService,
    private readonly tests: TestsService,
  ) {}

  async generateSteps(userId: string, projectId: string, testId: string, text: string, mode: 'append' | 'replace') {
    const test = await this.tests.findOne(userId, projectId, testId);
    const result = await this.llm.completeWithFallback(SYSTEM_PROMPT, text);
    const cleaned = result.raw
      .trim()
      .replace(/^```(json)?/i, '')
      .replace(/```$/, '')
      .trim();

    let newSteps: RecordedStep[];
    try {
      newSteps = JSON.parse(cleaned) as RecordedStep[];
      if (!Array.isArray(newSteps)) throw new Error('not an array');
    } catch (err) {
      throw new Error(`The AI response was not valid step JSON: ${err instanceof Error ? err.message : String(err)}\n\nRaw: ${cleaned.slice(0, 300)}`);
    }

    const existing = (test.steps as unknown as RecordedStep[]) ?? [];
    const finalSteps = mode === 'append' ? [...existing, ...newSteps] : newSteps;

    await this.prisma.test.update({ where: { id: testId }, data: { steps: finalSteps as object[] } });
    // See TestsService.updateSteps: materialize against the flattened list so "step-N"
    // keys line up with what execution (which also flattens) will look up.
    const flattened = await flattenComponentSteps(this.prisma, finalSteps);
    await materializeLocators(this.prisma, testId, flattened);

    return { steps: finalSteps, addedCount: newSteps.length, provider: result.provider, model: result.model };
  }
}
