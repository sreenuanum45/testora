import type { RecordedStep } from '../recording/step-parser';

// Every locator/action operates against `currentPage` — a mutable binding that starts out
// as `page` and gets reassigned when a waitForPopup step hands focus to a newly-opened tab
// (see generatePlaywrightCode below) — rather than the fixed `page` fixture directly, so
// exported code keeps working against whichever tab is actually active after a click opens
// a new tab/window instead of silently continuing to act on the original one.
function locatorExpr(step: RecordedStep): string {
  switch (step.selectorStrategy) {
    case 'testid':
      return `currentPage.getByTestId(${JSON.stringify(step.selector ?? '')})`;
    case 'role':
      return `currentPage.getByRole(${JSON.stringify(step.selector ?? 'button')}${step.roleName ? `, { name: ${JSON.stringify(step.roleName)} }` : ''})`;
    case 'label':
      return `currentPage.getByLabel(${JSON.stringify(step.selector ?? '')})`;
    case 'placeholder':
      return `currentPage.getByPlaceholder(${JSON.stringify(step.selector ?? '')})`;
    case 'text':
      return `currentPage.getByText(${JSON.stringify(step.selector ?? '')})`;
    default:
      return `currentPage.locator(${JSON.stringify(step.selector ?? '')})`;
  }
}

function stepToLine(step: RecordedStep): string {
  switch (step.action) {
    case 'goto':
      return `  await currentPage.goto(${JSON.stringify(step.value ?? '/')});`;
    case 'click':
      return `  await ${locatorExpr(step)}.click();`;
    case 'fill':
      return `  await ${locatorExpr(step)}.fill(${JSON.stringify(step.value ?? '')});`;
    case 'press':
      return `  await ${locatorExpr(step)}.press(${JSON.stringify(step.value ?? 'Enter')});`;
    case 'check':
      return `  await ${locatorExpr(step)}.check();`;
    case 'select':
      return `  await ${locatorExpr(step)}.selectOption(${JSON.stringify(step.value ?? '')});`;
    case 'assertVisible':
      return `  await expect(${locatorExpr(step)}).toBeVisible();`;
    case 'assertHidden':
      return `  await expect(${locatorExpr(step)}).toBeHidden();`;
    case 'assertText':
      return `  await expect(${locatorExpr(step)}).toContainText(${JSON.stringify(step.value ?? '')});`;
    case 'assertValue':
      return `  await expect(${locatorExpr(step)}).toHaveValue(${JSON.stringify(step.value ?? '')});`;
    case 'assertCount':
      return `  await expect(${locatorExpr(step)}).toHaveCount(${Number(step.value) || 0});`;
    case 'assertAttribute': {
      const [attr, expected] = splitPair(step.value);
      return `  await expect(${locatorExpr(step)}).toHaveAttribute(${JSON.stringify(attr)}, ${JSON.stringify(expected)});`;
    }
    case 'assertCss': {
      const [prop, expected] = splitPair(step.value);
      return `  await expect(${locatorExpr(step)}).toHaveCSS(${JSON.stringify(prop)}, ${JSON.stringify(expected)});`;
    }
    case 'assertEnabled':
      return `  await expect(${locatorExpr(step)}).toBeEnabled();`;
    case 'assertDisabled':
      return `  await expect(${locatorExpr(step)}).toBeDisabled();`;
    case 'assertChecked':
      return `  await expect(${locatorExpr(step)}).toBeChecked();`;
    case 'assertUnchecked':
      return `  await expect(${locatorExpr(step)}).not.toBeChecked();`;
    case 'assertUrl':
      return `  await expect(currentPage).toHaveURL(${urlContainsMatcher(step.value)});`;
    case 'waitForVisible':
      return `  await ${locatorExpr(step)}.waitFor({ state: 'visible' });`;
    case 'waitForHidden':
      return `  await ${locatorExpr(step)}.waitFor({ state: 'hidden' });`;
    case 'waitForEnabled':
      return `  await expect(${locatorExpr(step)}).toBeEnabled();`;
    case 'waitForUrl':
      return `  await currentPage.waitForURL(${urlContainsMatcher(step.value)});`;
    case 'waitForResponse':
      return `  await currentPage.waitForResponse(${urlContainsMatcher(step.value)});`;
    case 'waitForNetworkIdle':
      return `  await currentPage.waitForLoadState('networkidle');`;
    // A click/action that opens a new tab or window is recorded as a normal step
    // immediately followed by this marker (see step-parser.ts) — the listener has to be
    // registered before the preceding line runs (see the look-ahead wrap below), and this
    // line just picks up whatever it caught and switches focus to it.
    case 'waitForPopup':
      return (
        `  const newPage = await pendingPopupPromise;\n` +
        `  await newPage.waitForLoadState().catch(() => {});\n` +
        `  currentPage = newPage;\n` +
        `  pendingPopupPromise = null;`
      );
    case 'customCode':
      return step.code ? `  ${step.code}` : '  // customCode step had no code';
    case 'component':
      return `  // component step should have been flattened before code generation`;
    default:
      return `  // unrecognized step: ${JSON.stringify(step)}`;
  }
}

function urlContainsMatcher(value?: string): string {
  const escaped = (value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return `new RegExp(${JSON.stringify(escaped)})`;
}

function splitPair(value?: string): [string, string] {
  const idx = (value ?? '').indexOf('=');
  if (idx === -1) return [(value ?? '').trim(), ''];
  return [value!.slice(0, idx).trim(), value!.slice(idx + 1).trim()];
}

export interface BrowserOptions {
  viewportWidth?: number | null;
  viewportHeight?: number | null;
  userAgent?: string | null;
}

/**
 * Generates production-ready Playwright TypeScript from a test's stored step-list,
 * using page.locator()/getBy* + expect() per Playwright's own best-practice guidance —
 * this is the "Export as Playwright Code" feature.
 */
export function generatePlaywrightCode(testName: string, steps: RecordedStep[], browserOptions?: BrowserOptions, targetUrl?: string): string {
  const safeName = testName.replace(/'/g, "\\'");
  // If the stored steps don't already open with their own goto (e.g. a step-list built
  // purely from NLP/manual assertions, with navigation implied by the test's targetUrl
  // rather than recorded as a step), emit it here so the exported file is actually
  // runnable standalone instead of silently starting on a blank page.
  const startsWithGoto = steps[0]?.action === 'goto';
  const openingGoto = !startsWithGoto && targetUrl ? `  await currentPage.goto(${JSON.stringify(targetUrl)});\n` : '';

  const usesPopup = steps.some((s) => s.action === 'waitForPopup');
  const body =
    steps.length > 0
      ? steps
          .map((step, index) => {
            // The listener for a new tab/window has to be registered BEFORE the action that
            // triggers it runs — a page-open event can fire and be missed if we only start
            // listening after the click that caused it.
            const opensPopup = steps[index + 1]?.action === 'waitForPopup';
            const popupSetup = opensPopup ? `  pendingPopupPromise = currentPage.context().waitForEvent('page');\n` : '';
            return `${popupSetup}${stepToLine(step)}`;
          })
          .join('\n')
      : '  // No recorded steps yet.';

  const useOptions: string[] = [];
  if (browserOptions?.viewportWidth && browserOptions.viewportHeight) {
    useOptions.push(`viewport: { width: ${browserOptions.viewportWidth}, height: ${browserOptions.viewportHeight} }`);
  }
  if (browserOptions?.userAgent) useOptions.push(`userAgent: ${JSON.stringify(browserOptions.userAgent)}`);
  const useBlock = useOptions.length > 0 ? `\ntest.use({ ${useOptions.join(', ')} });\n` : '';

  const stateDecls = usesPopup
    ? `  let currentPage = page;\n  let pendingPopupPromise: Promise<Page> | null = null;\n`
    : `  const currentPage = page;\n`;

  return `import { test, expect, type Page } from '@playwright/test';
${useBlock}
test('${safeName}', async ({ page }) => {
${stateDecls}${openingGoto}${body}
});
`;
}
