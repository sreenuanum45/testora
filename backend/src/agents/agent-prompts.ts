// Shared by all three agents. Every prompt enforces the same contract the rest of the
// app already speaks — RecordedStep JSON (see recording/step-parser.ts) — so agent output
// drops straight into the existing execution/export/UI pipeline without any translation
// layer. Parsing/validation (parseAgentSteps) lives here too so each agent gets identical
// hardening against malformed LLM output.

import type { RecordedStep, StepAction } from '../recording/step-parser';

const KNOWN_ACTIONS: StepAction[] = [
  'goto',
  'click',
  'fill',
  'press',
  'check',
  'select',
  'assertVisible',
  'assertHidden',
  'assertText',
  'assertValue',
  'assertUrl',
  'assertCount',
  'assertAttribute',
  'assertCss',
  'assertEnabled',
  'assertDisabled',
  'assertChecked',
  'assertUnchecked',
  'waitForVisible',
  'waitForUrl',
  'waitForResponse',
  'waitForHidden',
  'waitForEnabled',
  'waitForNetworkIdle',
  'waitForPopup',
];

const KNOWN_STRATEGIES = ['testid', 'role', 'label', 'placeholder', 'text', 'css'] as const;

/** Strips markdown fences (LLMs love adding them despite "no fences" instructions),
 *  extracts the first JSON array from the text, and validates every entry down to the
 *  action whitelist. Invalid entries are DROPPED, not kept-as-is — a step with a
 *  hallucinated action name would blow up at execution time, far away from the cause. */
export function parseAgentSteps(raw: string): RecordedStep[] {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();

  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Agent response contained no JSON array.\n\nRaw: ${cleaned.slice(0, 300)}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned.slice(start, end + 1));
  } catch (err) {
    throw new Error(`Agent response was not valid JSON: ${err instanceof Error ? err.message : String(err)}\n\nRaw: ${cleaned.slice(0, 300)}`);
  }
  if (!Array.isArray(parsed)) throw new Error('Agent response JSON was not an array');

  const steps: RecordedStep[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const action = e.action as StepAction;
    if (!KNOWN_ACTIONS.includes(action)) continue;

    const step: RecordedStep = { action };
    if (typeof e.selector === 'string' && e.selector.trim()) step.selector = e.selector.trim();
    if (typeof e.roleName === 'string' && e.roleName.trim()) step.roleName = e.roleName.trim();
    if (typeof e.value === 'string' && e.value.trim()) step.value = e.value.trim();
    if (typeof e.selectorStrategy === 'string' && (KNOWN_STRATEGIES as readonly string[]).includes(e.selectorStrategy)) {
      step.selectorStrategy = e.selectorStrategy as RecordedStep['selectorStrategy'];
    }
    // A role strategy with an empty role can never resolve — drop the strategy rather
    // than the whole step (nlp.service.ts drops the whole suggestion; here the locator
    // materializer can still work with selector alone).
    if (step.selectorStrategy === 'role' && !step.selector) delete step.selectorStrategy;

    steps.push(step);
  }

  if (steps.length === 0) {
    throw new Error('Agent response contained no usable steps (all entries invalid or unknown actions).');
  }
  return steps;
}

export const SHARED_STEP_CONTRACT = `Respond with ONLY a JSON array (no markdown fences, no prose) of step objects matching this shape:
{
  "action": "goto"|"click"|"fill"|"press"|"check"|"select"|"assertVisible"|"assertHidden"|"assertText"|"assertValue"|"assertUrl"|"assertCount"|"assertAttribute"|"assertCss"|"assertEnabled"|"assertDisabled"|"assertChecked"|"assertUnchecked"|"waitForVisible"|"waitForUrl"|"waitForResponse"|"waitForHidden"|"waitForEnabled"|"waitForNetworkIdle"|"waitForPopup",
  "selector"?: string,
  "selectorStrategy"?: "testid"|"role"|"label"|"placeholder"|"text"|"css",
  "roleName"?: string,
  "value"?: string
}
Field semantics:
- "selector": for role strategy the ARIA role ("button", "textbox", "link", "checkbox"...); for label/placeholder/text the visible text; for css the CSS selector.
- "roleName": the accessible name of the element when strategy is "role".
- "value": text to type, URL substring for goto/assertUrl/waitForUrl, key to press, option to select, expected text for assertText/assertValue.
Rules:
- Prefer role/label/placeholder/testid strategies over css whenever the page snapshot offers an accessible name or test id — they survive layout churn far better.
- Every action sequence should end with at least one assertion so the test verifies an outcome, not just that clicks didn't throw.
- Never invent selectors that do not appear in the provided page snapshot.`;

export const PLANNER_SYSTEM_PROMPT = `You are a senior QA engineer planning an end-to-end browser test for a website. You are given the site's URL and a text accessibility snapshot of its CURRENT page (roles, names, and refs of the real elements actually present) — plus optional notes from the user about what matters.

Your job is to produce a test PLAN: a short ordered list of steps a human could follow to exercise the site's core flow(s), expressed in the JSON step format below. Think like a planner, not a codifier: choose which elements to interact with, which outcomes to verify, and in what order. When the snapshot shows a login form, plan the happy path plus (if asked) a validation check; when it shows a search box, plan a search-and-verify; and so on.

${SHARED_STEP_CONTRACT}
- Anchor every selector on elements that actually appear in the provided snapshot.`;

export const GENERATOR_SYSTEM_PROMPT = `You are a Playwright test author. You are given an ordered list of planned test steps (plain descriptions or partial JSON steps) and a text accessibility snapshot of the target page's CURRENT state (roles, names, and refs of the real elements actually present).

Your job is to turn the plan into a COMPLETE, executable step list in the JSON format below — resolving every vague instruction ("log in", "submit the form") into concrete actions against real elements from the snapshot. Do not skip planned steps; do not add steps the plan doesn't call for except where the snapshot makes the intent unambiguous (e.g. adding the initial goto).

${SHARED_STEP_CONTRACT}
- Anchor every selector on elements that actually appear in the provided snapshot.`;

export const HEALER_SYSTEM_PROMPT = `You are a test-repair agent. A browser test failed, and you are given:
1. The test's current step list (JSON, same format you must output).
2. The failed run's error message and per-step pass/fail log.
3. A text accessibility snapshot of the page AS IT LOOKS NOW (roles, names, refs of the real elements actually present).

Your job is to repair the step list so it passes against the page as it exists today. Typical repairs: replace a selector that no longer matches with the closest still-present element from the snapshot (same role, similar name), fix a changed URL/value, remove a step for an element that genuinely no longer exists (keeping the test's intent intact), or add a missing wait before a flaky assertion. Preserve the test's original INTENT wherever possible — repair, don't rewrite.

${SHARED_STEP_CONTRACT}
- Return the FULL repaired step list (every step, changed or not), in the original order unless reordering is itself the repair.`;
