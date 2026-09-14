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

const ASSERTION_COACH_PROMPT = `You are a QA test-quality coach. You are given a JSON array of a \
browser test's current steps, each shaped { index, action, selector, selectorStrategy, roleName, value }. \
Find steps that perform an ACTION (click, fill, press, check, select) with NO verification step \
(an assert*/waitFor* action) between them and either the next action or the end of the list — an \
unverified action means the test could silently do nothing and still pass. For each such gap, propose \
ONE assertion to insert right after it that would catch that action having no effect.

Respond with ONLY a JSON array (no markdown fences, no prose) of objects matching this shape:
{
  "afterIndex": number,   // insert the suggested step immediately after this step index in the CURRENT array
  "reason": string,       // one short sentence: what's unverified and why it matters
  "step": {
    "action": "assertVisible"|"assertHidden"|"assertText"|"assertValue"|"assertUrl"|"assertEnabled"|"assertChecked",
    "selector"?: string,
    "selectorStrategy"?: "role"|"label"|"placeholder"|"text",
    "roleName"?: string,
    "value"?: string
  }
}
Rules:
- Only flag genuine gaps — an action immediately followed by an assertion is already covered, skip it.
- Never use "css" or "testid" strategy — you cannot see the real page, only role/label/placeholder/text
  (resolvable purely from the step's own existing selector/value/roleName) are safe guesses. When the
  flagged action step already has a selector/roleName, reuse or adapt it for the suggested assertion
  rather than inventing an unrelated one.
- When selectorStrategy is "role", "selector" MUST be a non-empty ARIA role string (e.g. "button",
  "textbox", "link") — copy it from the flagged step's own "selector" field when it already has one.
  Never emit selectorStrategy "role" with an empty or missing "selector"; a role assertion with no role
  cannot resolve to anything.
- A "fill" step is often best verified with assertValue on the same field; a "click" that navigates is
  often best verified with assertUrl or assertVisible on something that only appears after navigation.
- Suggest at most 5 gaps, most important first (a fill with no follow-up check outranks a minor click).
- If every action is already adequately verified, respond with an empty array [].`;

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

  /**
   * Reviews the test's CURRENT step list (unchanged — this only suggests, insertion is a
   * separate explicit action the user takes per-suggestion) and flags actions with no
   * follow-up verification. Reuses the same LLM chain self-healing depends on, applied to
   * test-quality review instead of locator repair.
   */
  async suggestAssertions(userId: string, projectId: string, testId: string) {
    const test = await this.tests.findOne(userId, projectId, testId);
    const steps = ((test.steps as unknown as RecordedStep[]) ?? []).map((s, index) => ({ index, ...s }));
    if (steps.length === 0) return { suggestions: [], provider: null, model: null };

    const result = await this.llm.completeWithFallback(ASSERTION_COACH_PROMPT, JSON.stringify(steps, null, 2));
    const cleaned = result.raw
      .trim()
      .replace(/^```(json)?/i, '')
      .replace(/```$/, '')
      .trim();

    let suggestions: Array<{ afterIndex: number; reason: string; step: RecordedStep }>;
    try {
      suggestions = JSON.parse(cleaned) as Array<{ afterIndex: number; reason: string; step: RecordedStep }>;
      if (!Array.isArray(suggestions)) throw new Error('not an array');
    } catch (err) {
      throw new Error(
        `The AI response was not valid suggestion JSON: ${err instanceof Error ? err.message : String(err)}\n\nRaw: ${cleaned.slice(0, 300)}`,
      );
    }

    // Defensive clamp — an out-of-range afterIndex (hallucinated or off-by-one) would
    // silently insert in the wrong place client-side; better to drop it than misplace it.
    suggestions = suggestions.filter((s) => {
      if (!Number.isInteger(s.afterIndex) || s.afterIndex < -1 || s.afterIndex >= steps.length || !s.step?.action) return false;
      // A "role" strategy with no role string can't resolve to anything at execution
      // time — despite the prompt's instruction, still worth guarding against server-side
      // rather than letting a broken suggestion reach the UI.
      if (s.step.selectorStrategy === 'role' && !s.step.selector) return false;
      return true;
    });

    return { suggestions, provider: result.provider, model: result.model };
  }
}
