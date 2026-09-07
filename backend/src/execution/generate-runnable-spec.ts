import type { RecordedStep } from '../recording/step-parser';

interface LocatorRow {
  key: string;
  strategy: string; // Prisma enum value: TESTID | ROLE | LABEL | PLACEHOLDER | TEXT | CSS
  value: string;
  roleName: string | null;
}

/**
 * Generates a FULLY self-contained Playwright spec file — the healing runtime logic is
 * inlined as source text rather than imported from a sibling module. A generated file
 * gets run by a separate `npx playwright test` child process, and that process's module
 * resolution for a relative import depends on whether the backend is running via
 * ts-node (dev) or compiled dist/ (prod) — two different directory layouts. Inlining
 * sidesteps that entire class of path bug rather than trying to get it right for both.
 */
export interface BrowserOptions {
  viewportWidth?: number | null;
  viewportHeight?: number | null;
  userAgent?: string | null;
}

export function generateRunnableSpec(
  testName: string,
  steps: RecordedStep[],
  locators: LocatorRow[],
  healEventsOutputPath: string,
  browserOptions?: BrowserOptions,
  targetUrl?: string,
): string {
  const locatorsByKey = new Map(locators.map((l) => [l.key, l]));
  const safeName = testName.replace(/'/g, "\\'");

  // Locator keys are materialized (by materializeLocators, at save/NLP/recording time)
  // using the RAW stored steps array's own indices — "step-0" is steps[0], "step-1" is
  // steps[1], etc. If we synthesized an extra goto step here and prepended it, every
  // subsequent step's index would shift by one relative to what was materialized, so
  // every locator lookup below would silently miss ("no locator recorded, skipped") and
  // the step would just never run — no error, no heal, the test just quietly does less
  // than it looks like it does. So the initial navigation is emitted as a fixed line
  // OUTSIDE the indexed step loop instead of injected into the array.
  const startsWithGoto = steps[0]?.action === 'goto';
  const openingGoto = !startsWithGoto && targetUrl ? `  await page.goto(${JSON.stringify(targetUrl)});\n` : '';

  // Every step is wrapped in emitStep() (defined in the runtime prelude) so the parent
  // process can tail this child's stdout for structured __TESTORA_EVENT__ lines and show
  // (and persist) a live, step-by-step progress log while the run is still executing —
  // instead of only learning pass/fail once the whole spec file finishes.
  const stepLines = steps
    .map((step, index) => {
      const emit = (body: string): string =>
        `  await emitStep(${index}, ${JSON.stringify(step.action)}, async () => {\n${body}\n  });`;

      if (step.action === 'goto') return emit(`    await page.goto(${JSON.stringify(step.value ?? '/')});`);

      // These act on the page itself, not an element — no locator to resolve.
      if (step.action === 'customCode') return emit(step.code ? `    ${step.code}` : '    // customCode step had no code');
      if (step.action === 'assertUrl') return emit(`    await expect(page).toHaveURL(${urlContainsMatcher(step.value)});`);
      if (step.action === 'waitForUrl') return emit(`    await page.waitForURL(${urlContainsMatcher(step.value)});`);
      if (step.action === 'waitForResponse') return emit(`    await page.waitForResponse(${urlContainsMatcher(step.value)});`);
      if (step.action === 'waitForNetworkIdle') return emit(`    await page.waitForLoadState('networkidle');`);

      const row = locatorsByKey.get(`step-${index}`);
      if (!row) return `  // step ${index}: no locator recorded, skipped`;
      const descriptorVar = `d${index}`;
      const descriptorLiteral = JSON.stringify({
        key: row.key,
        strategy: row.strategy.toLowerCase(),
        value: row.value,
        roleName: row.roleName ?? undefined,
      });
      const actionCall = actionToCall(step, descriptorVar);
      return emit(`    const ${descriptorVar} = ${descriptorLiteral};\n    ${actionCall}`);
    })
    .join('\n');

  const useOptions: string[] = [];
  if (browserOptions?.viewportWidth && browserOptions.viewportHeight) {
    useOptions.push(`viewport: { width: ${browserOptions.viewportWidth}, height: ${browserOptions.viewportHeight} }`);
  }
  if (browserOptions?.userAgent) useOptions.push(`userAgent: ${JSON.stringify(browserOptions.userAgent)}`);
  const useBlock = useOptions.length > 0 ? `\ntest.use({ ${useOptions.join(', ')} });\n` : '';

  return `${RUNTIME_PRELUDE}
${useBlock}
test('${safeName}', async ({ page }) => {
${openingGoto}${stepLines}
});

test.afterAll(async () => {
  const fs = await import('node:fs');
  fs.writeFileSync(${JSON.stringify(healEventsOutputPath)}, JSON.stringify(healEvents, null, 2), 'utf-8');
});
`;
}

function valueMatcher(value?: string): string {
  return JSON.stringify(value ?? '');
}

/** assertAttribute/assertCss steps pack "name=expectedValue" into one field so the Step
 *  shape doesn't need a third free-text column just for these two actions. */
function splitPair(value?: string): [string, string] {
  const idx = (value ?? '').indexOf('=');
  if (idx === -1) return [(value ?? '').trim(), ''];
  return [value!.slice(0, idx).trim(), value!.slice(idx + 1).trim()];
}

/** URL assertions/waits from plain English ("wait for the URL to contain X") mean
 *  substring containment, not exact match — toHaveURL/waitForURL treat a plain string as
 *  an EXACT match, so emit a RegExp built from an escaped substring instead. */
function urlContainsMatcher(value?: string): string {
  const escaped = (value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return `new RegExp(${JSON.stringify(escaped)})`;
}

function actionToCall(step: RecordedStep, descriptorVar: string): string {
  switch (step.action) {
    case 'click':
      return `await (await healingLocate(page, ${descriptorVar})).click();`;
    case 'fill':
      return `await (await healingLocate(page, ${descriptorVar})).fill(${JSON.stringify(step.value ?? '')});`;
    case 'press':
      return `await (await healingLocate(page, ${descriptorVar})).press(${JSON.stringify(step.value ?? 'Enter')});`;
    case 'check':
      return `await (await healingLocate(page, ${descriptorVar})).check();`;
    case 'select':
      return `await (await healingLocate(page, ${descriptorVar})).selectOption(${JSON.stringify(step.value ?? '')});`;
    // Advanced Assertions
    case 'assertVisible':
      return `await expect(await healingLocate(page, ${descriptorVar})).toBeVisible();`;
    // Hidden checks must NOT go through healingLocate: that helper's job is to find a
    // VISIBLE match and heal when it can't, so on a correctly-hidden element it would
    // treat "not visible" as a broken locator and try to heal to some other visible
    // element on the page — exactly backwards for an assertion that WANTS not-visible.
    case 'assertHidden':
      return `await expect(resolveDescriptor(page, ${descriptorVar})).toBeHidden();`;
    case 'assertText':
      return `await expect(await healingLocate(page, ${descriptorVar})).toContainText(${valueMatcher(step.value)});`;
    case 'assertValue':
      return `await expect(await healingLocate(page, ${descriptorVar})).toHaveValue(${valueMatcher(step.value)});`;
    case 'assertCount':
      return `await expect(resolveDescriptor(page, ${descriptorVar})).toHaveCount(${Number(step.value) || 0});`;
    case 'assertAttribute': {
      const [attr, expected] = splitPair(step.value);
      return `await expect(await healingLocate(page, ${descriptorVar})).toHaveAttribute(${JSON.stringify(attr)}, ${JSON.stringify(expected)});`;
    }
    case 'assertCss': {
      const [prop, expected] = splitPair(step.value);
      return `await expect(await healingLocate(page, ${descriptorVar})).toHaveCSS(${JSON.stringify(prop)}, ${JSON.stringify(expected)});`;
    }
    case 'assertEnabled':
      return `await expect(await healingLocate(page, ${descriptorVar})).toBeEnabled();`;
    case 'assertDisabled':
      return `await expect(await healingLocate(page, ${descriptorVar})).toBeDisabled();`;
    case 'assertChecked':
      return `await expect(await healingLocate(page, ${descriptorVar})).toBeChecked();`;
    case 'assertUnchecked':
      return `await expect(await healingLocate(page, ${descriptorVar})).not.toBeChecked();`;
    // Advanced Waits (waitForUrl/waitForResponse/waitForNetworkIdle are handled earlier — no locator involved)
    case 'waitForVisible':
      return `await (await healingLocate(page, ${descriptorVar})).waitFor({ state: 'visible' });`;
    case 'waitForHidden':
      return `await resolveDescriptor(page, ${descriptorVar}).waitFor({ state: 'hidden' });`;
    case 'waitForEnabled':
      return `await expect(await healingLocate(page, ${descriptorVar})).toBeEnabled();`;
    default:
      return `// unsupported action: ${step.action}`;
  }
}

/** Inlined healing runtime: same Observe -> Diagnose (heuristic) -> Diagnose (LLM) ->
 *  Verify -> Persist loop as self-healing/SelfHealingEngine.ts in the sibling QA
 *  platform, condensed for inline embedding. */
const RUNTIME_PRELUDE = `import { test, expect } from '@playwright/test';

const healEvents = [];

function emitEvent(index, action, status, message) {
  console.log('__TESTORA_EVENT__' + JSON.stringify({ index, action, status, message }));
}

async function emitStep(index, action, fn) {
  emitEvent(index, action, 'running');
  try {
    await fn();
    emitEvent(index, action, 'passed');
  } catch (e) {
    emitEvent(index, action, 'failed', String((e && e.message) || e));
    throw e;
  }
}

function resolveDescriptor(page, d) {
  switch (d.strategy) {
    case 'testid': return page.getByTestId(d.value);
    case 'role': return page.getByRole(d.value, d.roleName ? { name: d.roleName } : undefined);
    case 'label': return page.getByLabel(d.value);
    case 'placeholder': return page.getByPlaceholder(d.value);
    case 'text': return page.getByText(d.value, { exact: false });
    default: return page.locator(d.value);
  }
}

async function resolveVisible(page, d) {
  try {
    const locator = resolveDescriptor(page, d);
    const count = await locator.count();
    for (let i = 0; i < count; i++) {
      const nth = locator.nth(i);
      if (await nth.isVisible().catch(() => false)) return nth;
    }
  } catch {}
  return null;
}

async function attemptHeuristicRepair(page, original) {
  const seed = original.roleName ?? original.value;
  const candidates = [];
  if (original.strategy === 'role' && original.roleName) {
    candidates.push({ key: original.key, strategy: 'role', value: original.value, roleName: original.roleName });
  }
  candidates.push(
    { key: original.key, strategy: 'label', value: seed },
    { key: original.key, strategy: 'placeholder', value: seed },
    { key: original.key, strategy: 'text', value: seed },
  );
  for (const candidate of candidates) {
    const locator = await resolveVisible(page, candidate);
    if (locator) return { descriptor: candidate, locator };
  }
  return null;
}

async function captureInteractiveSnapshot(page) {
  return page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('input, button, a, select, textarea, [role], [data-testid]')).slice(0, 200);
    return nodes.map((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      return {
        tag: el.tagName.toLowerCase(),
        id: el.id || undefined,
        testId: el.getAttribute('data-testid') || undefined,
        role: el.getAttribute('role') || undefined,
        ariaLabel: el.getAttribute('aria-label') || undefined,
        placeholder: el.getAttribute('placeholder') || undefined,
        text: (el.textContent || '').trim().slice(0, 60) || undefined,
      };
    }).filter((e) => e !== null);
  });
}

async function callLlm(systemPrompt, userPrompt) {
  const attempts = [
    async () => {
      const key = process.env.GROQ_API_KEY;
      if (!key) throw new Error('unconfigured');
      const model = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
        body: JSON.stringify({ model, temperature: 0, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }] }),
      });
      if (!res.ok) throw new Error('Groq ' + res.status);
      const data = await res.json();
      return { provider: 'groq', model, raw: data.choices[0]?.message.content || '' };
    },
    async () => {
      const key = process.env.GEMINI_API_KEY;
      if (!key) throw new Error('unconfigured');
      const model = process.env.GEMINI_MODEL || 'gemini-flash-latest';
      const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-goog-api-key': key },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: systemPrompt }] }, contents: [{ parts: [{ text: userPrompt }] }], generationConfig: { temperature: 0 } }),
      });
      if (!res.ok) throw new Error('Gemini ' + res.status);
      const data = await res.json();
      return { provider: 'gemini', model, raw: (data.candidates[0]?.content.parts || []).map((p) => p.text).join('') };
    },
    async () => {
      const key = process.env.OPENROUTER_API_KEY;
      if (!key) throw new Error('unconfigured');
      const model = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
        body: JSON.stringify({ model, temperature: 0, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }] }),
      });
      if (!res.ok) throw new Error('OpenRouter ' + res.status);
      const data = await res.json();
      return { provider: 'openrouter', model, raw: data.choices[0]?.message.content || '' };
    },
    async () => {
      const key = process.env.OPENAI_API_KEY;
      if (!key) throw new Error('unconfigured');
      const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
        body: JSON.stringify({ model, temperature: 0, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }] }),
      });
      if (!res.ok) throw new Error('OpenAI ' + res.status);
      const data = await res.json();
      return { provider: 'openai', model, raw: data.choices[0]?.message.content || '' };
    },
  ];
  const errors = [];
  for (const attempt of attempts) {
    try { return await attempt(); } catch (e) { errors.push(String(e && e.message || e)); }
  }
  throw new Error('All LLM providers failed or are unconfigured: ' + errors.join('; '));
}

async function suggestHealedDescriptor(key, original, domSnapshot) {
  const systemPrompt = "You are a Playwright locator-repair assistant. Given a failing selector description and a JSON snapshot of the page's current interactive elements, suggest ONE replacement selector. Never suggest XPath. Respond with ONLY a JSON object, no markdown fences, no prose, matching: { \\"strategy\\": \\"testid\\"|\\"role\\"|\\"label\\"|\\"placeholder\\"|\\"text\\"|\\"css\\", \\"value\\": string, \\"roleName\\"?: string }";
  const userPrompt = JSON.stringify({ failingSelector: original, pageInteractiveElements: domSnapshot }, null, 2);
  const result = await callLlm(systemPrompt, userPrompt);
  const cleaned = result.raw.trim().replace(/^\`\`\`(json)?/i, '').replace(/\`\`\`$/, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (!parsed.strategy || !parsed.value) return null;
    return { descriptor: { key, ...parsed }, provider: result.provider, model: result.model };
  } catch { return null; }
}

async function healingLocate(page, descriptor) {
  const stepIndex = Number((String(descriptor.key).match(/step-(\\d+)/) || [])[1]);

  const direct = await resolveVisible(page, descriptor);
  if (direct) return direct;

  emitEvent(stepIndex, 'heal', 'healing', 'Locator "' + descriptor.value + '" (' + descriptor.strategy + ') not found — attempting self-healing...');

  const heuristic = await attemptHeuristicRepair(page, descriptor);
  if (heuristic) {
    healEvents.push({ locatorKey: descriptor.key, failedStrategy: descriptor.strategy, healedStrategy: heuristic.descriptor.strategy, method: 'HEURISTIC', oldValue: descriptor.value, newValue: heuristic.descriptor.value, verified: true });
    emitEvent(stepIndex, 'heal', 'healed', 'Healed via heuristic: ' + heuristic.descriptor.strategy + '="' + heuristic.descriptor.value + '"');
    return heuristic.locator;
  }

  const snapshot = await captureInteractiveSnapshot(page);
  const suggestion = await suggestHealedDescriptor(descriptor.key, descriptor, snapshot).catch(() => null);
  if (suggestion) {
    const locator = await resolveVisible(page, suggestion.descriptor);
    if (locator) {
      healEvents.push({ locatorKey: descriptor.key, failedStrategy: descriptor.strategy, healedStrategy: suggestion.descriptor.strategy, method: 'LLM', provider: suggestion.provider, model: suggestion.model, oldValue: descriptor.value, newValue: suggestion.descriptor.value, verified: true });
      emitEvent(stepIndex, 'heal', 'healed', 'Healed via LLM (' + suggestion.provider + '): ' + suggestion.descriptor.strategy + '="' + suggestion.descriptor.value + '"');
      return locator;
    }
  }

  emitEvent(stepIndex, 'heal', 'failed', 'Unable to heal locator "' + descriptor.key + '"');
  throw new Error('Unable to resolve or heal locator "' + descriptor.key + '" (' + descriptor.strategy + ': ' + descriptor.value + ')');
}`;
