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
  const openingGoto = !startsWithGoto && targetUrl ? `  await currentPage.goto(${JSON.stringify(targetUrl)});\n` : '';

  // Every step is wrapped in emitStep() (defined in the runtime prelude) so the parent
  // process can tail this child's stdout for structured __TESTORA_EVENT__ lines and show
  // (and persist) a live, step-by-step progress log while the run is still executing —
  // instead of only learning pass/fail once the whole spec file finishes.
  const stepLines = steps
    .map((step, index) => {
      const emit = (body: string): string =>
        `  await emitStep(${index}, ${JSON.stringify(step.action)}, async () => {\n${body}\n  });`;

      // A waitForPopup step means THIS step's action is what triggers a new tab/window to
      // open. The listener has to be registered BEFORE the triggering action runs (a new
      // page's open event can fire and be missed if we only start listening afterward), so
      // every action prepends this when the step right after it is the popup handoff.
      const opensPopup = steps[index + 1]?.action === 'waitForPopup';
      const popupSetup = opensPopup ? `    pendingPopupPromise = currentPage.context().waitForEvent('page');\n` : '';

      if (step.action === 'waitForPopup') {
        return emit(
          `    const newPage = await pendingPopupPromise;\n` +
            `    await newPage.waitForLoadState().catch(() => {});\n` +
            `    currentPage = newPage;\n` +
            `    pendingPopupPromise = null;`,
        );
      }

      if (step.action === 'goto') return emit(`${popupSetup}    await currentPage.goto(${JSON.stringify(step.value ?? '/')});`);

      // These act on the page itself, not an element — no locator to resolve.
      if (step.action === 'customCode') return emit(`${popupSetup}${step.code ? `    ${step.code}` : '    // customCode step had no code'}`);
      if (step.action === 'assertUrl') return emit(`${popupSetup}    await expect(currentPage).toHaveURL(${urlContainsMatcher(step.value)});`);
      if (step.action === 'waitForUrl') return emit(`${popupSetup}    await currentPage.waitForURL(${urlContainsMatcher(step.value)});`);
      if (step.action === 'waitForResponse') return emit(`${popupSetup}    await currentPage.waitForResponse(${urlContainsMatcher(step.value)});`);
      if (step.action === 'waitForNetworkIdle') return emit(`${popupSetup}    await currentPage.waitForLoadState('networkidle');`);

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
      return emit(`${popupSetup}    const ${descriptorVar} = ${descriptorLiteral};\n    ${actionCall}`);
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
  let currentPage = page;
  let pendingPopupPromise = null;
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

// Operates against `currentPage` — a mutable binding declared in the generated test body
// that starts out as `page` and gets reassigned when a waitForPopup step hands focus to a
// newly-opened tab (see the stepLines loop below) — rather than the fixed `page` fixture
// directly, so every action after a tab switch keeps working against whichever tab is
// actually active instead of silently continuing to act on the original one.
function actionToCall(step: RecordedStep, descriptorVar: string): string {
  switch (step.action) {
    // Pointer/input actions go through healingAct, not just healingLocate — a locator that
    // resolves fine but whose click times out because a cookie/age/promo overlay is sitting
    // on top of it is a DIFFERENT failure mode than "not found", and needs its own recovery
    // (dismiss the blocker, retry) rather than silently timing out the whole test. See
    // healingAct in the runtime prelude.
    case 'click':
      return `await healingAct(currentPage, ${descriptorVar}, (l) => l.click());`;
    case 'fill':
      return `await healingAct(currentPage, ${descriptorVar}, (l) => l.fill(${JSON.stringify(step.value ?? '')}));`;
    case 'press':
      return `await healingAct(currentPage, ${descriptorVar}, (l) => l.press(${JSON.stringify(step.value ?? 'Enter')}));`;
    case 'check':
      return `await healingAct(currentPage, ${descriptorVar}, (l) => l.check());`;
    case 'select':
      return `await healingAct(currentPage, ${descriptorVar}, (l) => l.selectOption(${JSON.stringify(step.value ?? '')}));`;
    // Advanced Assertions
    case 'assertVisible':
      return `await expect(await healingLocate(currentPage, ${descriptorVar})).toBeVisible();`;
    // Hidden checks must NOT go through healingLocate: that helper's job is to find a
    // VISIBLE match and heal when it can't, so on a correctly-hidden element it would
    // treat "not visible" as a broken locator and try to heal to some other visible
    // element on the page — exactly backwards for an assertion that WANTS not-visible.
    case 'assertHidden':
      return `await expect(resolveDescriptor(currentPage, ${descriptorVar})).toBeHidden();`;
    case 'assertText':
      return `await expect(await healingLocate(currentPage, ${descriptorVar})).toContainText(${valueMatcher(step.value)});`;
    case 'assertValue':
      return `await expect(await healingLocate(currentPage, ${descriptorVar})).toHaveValue(${valueMatcher(step.value)});`;
    case 'assertCount':
      return `await expect(resolveDescriptor(currentPage, ${descriptorVar})).toHaveCount(${Number(step.value) || 0});`;
    case 'assertAttribute': {
      const [attr, expected] = splitPair(step.value);
      return `await expect(await healingLocate(currentPage, ${descriptorVar})).toHaveAttribute(${JSON.stringify(attr)}, ${JSON.stringify(expected)});`;
    }
    case 'assertCss': {
      const [prop, expected] = splitPair(step.value);
      return `await expect(await healingLocate(currentPage, ${descriptorVar})).toHaveCSS(${JSON.stringify(prop)}, ${JSON.stringify(expected)});`;
    }
    case 'assertEnabled':
      return `await expect(await healingLocate(currentPage, ${descriptorVar})).toBeEnabled();`;
    case 'assertDisabled':
      return `await expect(await healingLocate(currentPage, ${descriptorVar})).toBeDisabled();`;
    case 'assertChecked':
      return `await expect(await healingLocate(currentPage, ${descriptorVar})).toBeChecked();`;
    case 'assertUnchecked':
      return `await expect(await healingLocate(currentPage, ${descriptorVar})).not.toBeChecked();`;
    // Advanced Waits (waitForUrl/waitForResponse/waitForNetworkIdle are handled earlier — no locator involved)
    case 'waitForVisible':
      return `await (await healingLocate(currentPage, ${descriptorVar})).waitFor({ state: 'visible' });`;
    case 'waitForHidden':
      return `await resolveDescriptor(currentPage, ${descriptorVar}).waitFor({ state: 'hidden' });`;
    case 'waitForEnabled':
      return `await expect(await healingLocate(currentPage, ${descriptorVar})).toBeEnabled();`;
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

// A single instantaneous DOM check can catch a real page mid-render (ads/trackers/layout
// shift on a heavy real-world site) and wrongly conclude a perfectly-fine locator is
// "broken", burning a heal attempt on what was really just a timing race. Poll for up to
// timeoutMs instead of checking once — cheap when the element is already there (returns on
// the first pass), and gives slow-loading pages a real chance before healing kicks in.
async function resolveVisible(page, d, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 300);
  while (true) {
    try {
      const locator = resolveDescriptor(page, d);
      const count = await locator.count();
      for (let i = 0; i < count; i++) {
        const nth = locator.nth(i);
        if (await nth.isVisible().catch(() => false)) return nth;
      }
    } catch {}
    if (Date.now() >= deadline) return null;
    await page.waitForTimeout(200);
  }
}

async function attemptHeuristicRepair(page, original) {
  const candidates = [];
  if (original.strategy === 'role' && original.roleName) {
    candidates.push({ key: original.key, strategy: 'role', value: original.value, roleName: original.roleName });
  }
  // A nameless role's "value" is just the role KEYWORD ("link", "button", ...) — never
  // real page content, so probing label/placeholder/text with it would only waste time on
  // guaranteed misses.
  // A nameless role's "value" is just the role keyword, and a css strategy's "value" is a
  // raw selector string — neither is ever real page content, so probing
  // label/placeholder/text with either would only waste time on guaranteed misses.
  const seed = original.roleName ?? (original.strategy === 'role' || original.strategy === 'css' ? null : original.value);
  if (seed) {
    candidates.push(
      { key: original.key, strategy: 'label', value: seed },
      { key: original.key, strategy: 'placeholder', value: seed },
      { key: original.key, strategy: 'text', value: seed },
    );
  }
  if (original.strategy === 'testid') {
    const kebab = original.value.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
    const camel = original.value.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    for (const variant of new Set([kebab, camel])) {
      if (variant !== original.value) candidates.push({ key: original.key, strategy: 'testid', value: variant });
    }
  }
  for (const candidate of candidates) {
    const locator = await resolveVisible(page, candidate);
    if (locator) return { descriptor: candidate, locator };
  }
  return null;
}

async function captureInteractiveSnapshot(page) {
  return page.evaluate(() => {
    var MAX_NODES = 300;
    var MAX_PER_SIGNATURE = 3;
    // [aria-label] is included on top of the semantic tags below because a modal's close
    // control is very often an icon with no visible text — aria-label is the one place a
    // dismiss target like that reliably self-describes ("Close", "Dismiss") even when
    // nothing else about the element hints at its purpose. svg/img/[onclick]/[tabindex]
    // catch icon-only clickables (a <div>/<span> wrapping a bare <svg>, no role, no
    // data-testid, no text, no aria-label — e.g. a wishlist/cart icon) that were
    // previously invisible to this snapshot entirely: a broken locator on one of those
    // had zero candidates to heal from and could never succeed.
    const nodes = Array.from(document.querySelectorAll('input, button, a, select, textarea, svg, img, [role], [data-testid], [aria-label], [onclick], [tabindex]'));

    function nearestLabeledAncestor(el) {
      let node = el.parentElement;
      for (let depth = 0; node && depth < 3; depth++, node = node.parentElement) {
        const testId = node.getAttribute('data-testid');
        const role = node.getAttribute('role');
        const ariaLabel = node.getAttribute('aria-label');
        if (testId || role || ariaLabel) {
          return { tag: node.tagName.toLowerCase(), testId: testId || undefined, role: role || undefined, ariaLabel: ariaLabel || undefined };
        }
      }
      return undefined;
    }

    const seenSignatures = {};
    const out = [];

    for (let i = 0; i < nodes.length; i++) {
      if (out.length >= MAX_NODES) break;
      const el = nodes[i];
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;

      const className = (el.getAttribute('class') || '').trim();
      const signature = el.tagName + '|' + className;
      const seenCount = seenSignatures[signature] || 0;
      // A grid page (product listings etc.) can repeat the same decorative element
      // dozens of times (star ratings, per-card buttons) — capping duplicates per
      // (tag, class) signature keeps the snapshot diverse instead of the node cap being
      // eaten by the first N nearly-identical nodes in DOM order.
      if (seenCount >= MAX_PER_SIGNATURE) continue;
      seenSignatures[signature] = seenCount + 1;

      // Icon-sprite pattern (<svg><use href="#icon-name"/></svg>) is an extremely
      // stable identifier — far more durable than any hashed wrapper class — worth
      // specifically surfacing when present.
      const useEl = el.tagName.toLowerCase() === 'svg' ? el.querySelector('use') : null;
      const rawHref = useEl ? (useEl.getAttribute('href') || useEl.getAttribute('xlink:href') || '') : '';
      const iconRef = rawHref.replace(/^#/, '') || undefined;

      const dataAttrs = {};
      const attrs = el.attributes;
      for (let a = 0; a < attrs.length; a++) {
        const attr = attrs[a];
        if (attr.name.indexOf('data-') === 0 && attr.name !== 'data-testid') dataAttrs[attr.name] = attr.value;
      }

      out.push({
        tag: el.tagName.toLowerCase(),
        id: el.id || undefined,
        className: className || undefined,
        testId: el.getAttribute('data-testid') || undefined,
        role: el.getAttribute('role') || undefined,
        ariaLabel: el.getAttribute('aria-label') || undefined,
        placeholder: el.getAttribute('placeholder') || undefined,
        title: el.getAttribute('title') || undefined,
        alt: el.getAttribute('alt') || undefined,
        text: (el.textContent || '').trim().slice(0, 60) || undefined,
        iconRef: iconRef,
        dataAttrs: Object.keys(dataAttrs).length > 0 ? dataAttrs : undefined,
        nearestLabeledAncestor: nearestLabeledAncestor(el),
      });
    }

    return out;
  });
}

async function callLlm(systemPrompt, userPrompt) {
  async function groqAttempt() {
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
    const content = data.choices[0] && data.choices[0].message.content;
    if (!content) throw new Error('Groq returned an empty response');
    return { provider: 'groq', model, raw: content };
  }
  async function geminiAttempt() {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error('unconfigured');
    const model = process.env.GEMINI_MODEL || 'gemini-flash-latest';
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-goog-api-key': key },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: systemPrompt }] }, contents: [{ parts: [{ text: userPrompt }] }], generationConfig: { temperature: 0, maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } } }),
    });
    if (!res.ok) throw new Error('Gemini ' + res.status);
    const data = await res.json();
    const text = ((data.candidates[0] && data.candidates[0].content.parts) || []).map((p) => p.text).join('');
    if (!text) throw new Error('Gemini returned an empty response');
    return { provider: 'gemini', model, raw: text };
  }
  async function openRouterAttempt() {
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
    const content = data.choices[0] && data.choices[0].message.content;
    if (!content) throw new Error('OpenRouter returned an empty response');
    return { provider: 'openrouter', model, raw: content };
  }
  async function openaiAttempt() {
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
    const content = data.choices[0] && data.choices[0].message.content;
    if (!content) throw new Error('OpenAI returned an empty response');
    return { provider: 'openai', model, raw: content };
  }

  const errors = [];
  // Groq and Gemini are raced (first valid response wins) rather than tried one after
  // another — self-healing sits on the critical path of a running test, so a slow/down
  // provider shouldn't add its full timeout before the other gets a chance.
  try {
    return await Promise.any([groqAttempt(), geminiAttempt()]);
  } catch (e) {
    if (e && e.errors) { for (const inner of e.errors) errors.push(String((inner && inner.message) || inner)); }
    else errors.push(String((e && e.message) || e));
  }
  for (const attempt of [openRouterAttempt, openaiAttempt]) {
    try { return await attempt(); } catch (e) { errors.push(String((e && e.message) || e)); }
  }
  throw new Error('All LLM providers failed or are unconfigured: ' + errors.join('; '));
}

async function suggestHealedDescriptor(key, original, domSnapshot) {
  const systemPrompt = "You are a Playwright locator-repair assistant. Given a failing selector description and a JSON snapshot of the page's current interactive elements, suggest ONE replacement selector. Never suggest XPath. Prefer, in this order: testid > role+name > label/placeholder/text > a stable data-* attribute > css. Some candidates are icon-only elements with no visible text: use their \\"iconRef\\" (an SVG <use> sprite reference, e.g. \\"icon-wishlist\\" -- far more stable than any hashed class name) or their \\"nearestLabeledAncestor\\" (the closest parent that DOES carry a role/testid/aria-label) when present, in preference to \\"className\\", which may be machine-generated and change on every deploy. If you must fall back to a css selector for an icon element, prefer targeting via iconRef (e.g. svg:has(use[href=\\"#<iconRef>\\"])) over any hashed/auto-generated class. Respond with ONLY a JSON object, no markdown fences, no prose, matching: { \\"strategy\\": \\"testid\\"|\\"role\\"|\\"label\\"|\\"placeholder\\"|\\"text\\"|\\"css\\", \\"value\\": string, \\"roleName\\"?: string }";
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

  // Give the ORIGINAL locator a real grace window (matches typical real-world page-load
  // variance) before treating it as broken — candidates probed below stay on the short
  // default timeout since those are speculative guesses, not the expected-to-work path.
  const direct = await resolveVisible(page, descriptor, 6000);
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
}

async function suggestDismissTarget(domSnapshot) {
  const systemPrompt = "A Playwright click/fill was blocked because another element (a cookie/age/consent/login/promo overlay) intercepts pointer events on top of the intended target. Given a JSON snapshot of the page's current interactive elements, suggest ONE element to click that would most likely DISMISS the blocking overlay (e.g. a close/accept/agree/got-it/no-thanks control) so the original action can be retried. Respond with ONLY a JSON object, no markdown fences, no prose, matching: { \\"strategy\\": \\"testid\\"|\\"role\\"|\\"label\\"|\\"placeholder\\"|\\"text\\"|\\"css\\", \\"value\\": string, \\"roleName\\"?: string }. If nothing in the snapshot looks like a dismissible overlay control, respond with exactly: null";
  const userPrompt = JSON.stringify({ pageInteractiveElements: domSnapshot }, null, 2);
  const result = await callLlm(systemPrompt, userPrompt);
  const cleaned = result.raw.trim().replace(/^\`\`\`(json)?/i, '').replace(/\`\`\`$/, '').trim();
  if (cleaned === 'null') return null;
  try {
    const parsed = JSON.parse(cleaned);
    if (!parsed.strategy || !parsed.value) return null;
    return { descriptor: { key: 'dismiss-overlay', ...parsed }, provider: result.provider, model: result.model };
  } catch { return null; }
}

/**
 * Wraps a pointer/input action (click, fill, press, check, selectOption) with recovery for
 * a failure mode healingLocate alone can't see: the locator resolves and is genuinely
 * VISIBLE, but the action itself times out because something else (a cookie/age/login/promo
 * overlay — extremely common on real e-commerce sites) is sitting on top of it and
 * intercepting pointer events. That's a different problem than "not found", so it needs its
 * own recovery: try to identify and dismiss the blocker, then retry the SAME action against
 * the SAME (already-correct) locator, before falling back to re-healing the locator itself.
 */
async function healingAct(page, descriptor, performFn) {
  const stepIndex = Number((String(descriptor.key).match(/step-(\\d+)/) || [])[1]);
  const locator = await healingLocate(page, descriptor);

  try {
    await performFn(locator);
    return;
  } catch (err) {
    const message = String((err && err.message) || err);

    // "element is outside of the viewport" is a scroll problem, not an overlay or a
    // stale-locator problem — the locator already resolved to the CORRECT element
    // (that's how we got here), it's just not currently scrolled into a clickable
    // position (sticky headers, lazy layout shifts, etc). Try the cheap, instant fix
    // first: scroll it into view and retry the SAME action on the SAME (already-correct)
    // locator, before paying for an LLM round-trip that can't fix a scroll position.
    try {
      await locator.scrollIntoViewIfNeeded({ timeout: 3000 });
      await performFn(locator);
      healEvents.push({ locatorKey: descriptor.key, failedStrategy: descriptor.strategy, healedStrategy: descriptor.strategy, method: 'HEURISTIC', oldValue: 'not scrolled into view', newValue: 'scrolled into view', verified: true });
      emitEvent(stepIndex, 'heal', 'healed', 'Scrolled element into view and retried successfully');
      return;
    } catch {
      // scrolling into view didn't fix it either — keep going.
    }

    emitEvent(stepIndex, 'heal', 'healing', 'Action on "' + descriptor.value + '" failed (likely blocked by an overlay) — attempting to dismiss and retry...');

    // Escape is the cheapest possible recovery — free, instant, and closes a large fraction
    // of real-world modal/popup patterns (cookie banners, login prompts, promo interstitials)
    // outright, with no LLM round-trip needed. Confirmed directly against a real blocker:
    // Flipkart's login popup closes on Escape. Only fall through to the LLM-driven dismiss
    // search if this alone didn't clear the way.
    await page.keyboard.press('Escape').catch(() => {});
    try {
      await performFn(locator);
      healEvents.push({ locatorKey: descriptor.key, failedStrategy: descriptor.strategy, healedStrategy: descriptor.strategy, method: 'HEURISTIC', oldValue: 'blocked by overlay', newValue: 'dismissed via Escape key', verified: true });
      emitEvent(stepIndex, 'heal', 'healed', 'Dismissed blocking overlay with Escape and retried successfully');
      return;
    } catch {
      // Escape alone didn't clear it — keep going.
    }

    const snapshot = await captureInteractiveSnapshot(page);
    const dismiss = await suggestDismissTarget(snapshot).catch(() => null);
    if (dismiss) {
      const dismissLocator = await resolveVisible(page, dismiss.descriptor, 1000);
      if (dismissLocator) {
        await dismissLocator.click({ timeout: 2000 }).catch(() => {});
        try {
          await performFn(locator);
          healEvents.push({ locatorKey: descriptor.key, failedStrategy: descriptor.strategy, healedStrategy: dismiss.descriptor.strategy, method: 'LLM', provider: dismiss.provider, model: dismiss.model, oldValue: 'blocked by overlay', newValue: 'dismissed ' + dismiss.descriptor.strategy + '="' + dismiss.descriptor.value + '"', verified: true });
          emitEvent(stepIndex, 'heal', 'healed', 'Dismissed blocking overlay (' + dismiss.descriptor.strategy + '="' + dismiss.descriptor.value + '") and retried successfully');
          return;
        } catch {
          // dismissing that element didn't actually clear the way — fall through below
        }
      }
    }

    // Either nothing looked like a dismissible overlay, or dismissing it didn't help —
    // last resort: maybe the ORIGINAL locator itself has genuinely gone stale since we
    // first resolved it a moment ago, so give the normal not-found heal path one more shot
    // on a fresh snapshot rather than giving up immediately.
    emitEvent(stepIndex, 'heal', 'healing', 'Retrying self-healing for "' + descriptor.key + '" after a blocked action...');
    const heuristic = await attemptHeuristicRepair(page, descriptor);
    if (heuristic) {
      await performFn(heuristic.locator);
      healEvents.push({ locatorKey: descriptor.key, failedStrategy: descriptor.strategy, healedStrategy: heuristic.descriptor.strategy, method: 'HEURISTIC', oldValue: descriptor.value, newValue: heuristic.descriptor.value, verified: true });
      emitEvent(stepIndex, 'heal', 'healed', 'Healed via heuristic: ' + heuristic.descriptor.strategy + '="' + heuristic.descriptor.value + '"');
      return;
    }
    const suggestion = await suggestHealedDescriptor(descriptor.key, descriptor, snapshot).catch(() => null);
    if (suggestion) {
      const healedLocator = await resolveVisible(page, suggestion.descriptor);
      if (healedLocator) {
        await performFn(healedLocator);
        healEvents.push({ locatorKey: descriptor.key, failedStrategy: descriptor.strategy, healedStrategy: suggestion.descriptor.strategy, method: 'LLM', provider: suggestion.provider, model: suggestion.model, oldValue: descriptor.value, newValue: suggestion.descriptor.value, verified: true });
        emitEvent(stepIndex, 'heal', 'healed', 'Healed via LLM (' + suggestion.provider + '): ' + suggestion.descriptor.strategy + '="' + suggestion.descriptor.value + '"');
        return;
      }
    }

    emitEvent(stepIndex, 'heal', 'failed', 'Unable to recover action on "' + descriptor.key + '"');
    throw err;
  }
}`;
