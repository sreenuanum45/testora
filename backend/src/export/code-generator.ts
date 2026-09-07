import type { RecordedStep } from '../recording/step-parser';

function locatorExpr(step: RecordedStep): string {
  switch (step.selectorStrategy) {
    case 'testid':
      return `page.getByTestId(${JSON.stringify(step.selector ?? '')})`;
    case 'role':
      return `page.getByRole(${JSON.stringify(step.selector ?? 'button')}${step.roleName ? `, { name: ${JSON.stringify(step.roleName)} }` : ''})`;
    case 'label':
      return `page.getByLabel(${JSON.stringify(step.selector ?? '')})`;
    case 'placeholder':
      return `page.getByPlaceholder(${JSON.stringify(step.selector ?? '')})`;
    case 'text':
      return `page.getByText(${JSON.stringify(step.selector ?? '')})`;
    default:
      return `page.locator(${JSON.stringify(step.selector ?? '')})`;
  }
}

function stepToLine(step: RecordedStep): string {
  switch (step.action) {
    case 'goto':
      return `  await page.goto(${JSON.stringify(step.value ?? '/')});`;
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
      return `  await expect(page).toHaveURL(${urlContainsMatcher(step.value)});`;
    case 'waitForVisible':
      return `  await ${locatorExpr(step)}.waitFor({ state: 'visible' });`;
    case 'waitForHidden':
      return `  await ${locatorExpr(step)}.waitFor({ state: 'hidden' });`;
    case 'waitForEnabled':
      return `  await expect(${locatorExpr(step)}).toBeEnabled();`;
    case 'waitForUrl':
      return `  await page.waitForURL(${urlContainsMatcher(step.value)});`;
    case 'waitForResponse':
      return `  await page.waitForResponse(${urlContainsMatcher(step.value)});`;
    case 'waitForNetworkIdle':
      return `  await page.waitForLoadState('networkidle');`;
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
  const openingGoto = !startsWithGoto && targetUrl ? `  await page.goto(${JSON.stringify(targetUrl)});\n` : '';
  const body = steps.length > 0 ? steps.map(stepToLine).join('\n') : '  // No recorded steps yet.';

  const useOptions: string[] = [];
  if (browserOptions?.viewportWidth && browserOptions.viewportHeight) {
    useOptions.push(`viewport: { width: ${browserOptions.viewportWidth}, height: ${browserOptions.viewportHeight} }`);
  }
  if (browserOptions?.userAgent) useOptions.push(`userAgent: ${JSON.stringify(browserOptions.userAgent)}`);
  const useBlock = useOptions.length > 0 ? `\ntest.use({ ${useOptions.join(', ')} });\n` : '';

  return `import { test, expect } from '@playwright/test';
${useBlock}
test('${safeName}', async ({ page }) => {
${openingGoto}${body}
});
`;
}
