export type StepAction =
  | 'goto'
  | 'click'
  | 'fill'
  | 'press'
  | 'check'
  | 'select'
  // Advanced Assertions
  | 'assertVisible'
  | 'assertHidden'
  | 'assertText'
  | 'assertValue'
  | 'assertUrl'
  | 'assertCount'
  | 'assertAttribute'
  | 'assertCss'
  | 'assertEnabled'
  | 'assertDisabled'
  | 'assertChecked'
  | 'assertUnchecked'
  // Advanced Waits
  | 'waitForVisible'
  | 'waitForUrl'
  | 'waitForResponse'
  | 'waitForHidden'
  | 'waitForEnabled'
  | 'waitForNetworkIdle'
  // Escape hatches / composition
  | 'customCode'
  | 'component';

export interface RecordedStep {
  action: StepAction;
  selector?: string;
  selectorStrategy?: 'testid' | 'role' | 'label' | 'placeholder' | 'text' | 'css';
  roleName?: string;
  value?: string;
  /** customCode: raw Playwright TypeScript executed verbatim (the "Custom Coding" escape
   *  hatch) — has `page`, `expect`, and `data` (the current data-driven row, if any) in
   *  scope. component: id of a Component whose own steps are spliced in at this point. */
  code?: string;
  componentId?: string;
}

const LOCATOR_PATTERNS: Array<{ re: RegExp; strategy: RecordedStep['selectorStrategy'] }> = [
  { re: /getByTestId\(\s*['"`](.*?)['"`]\s*\)/, strategy: 'testid' },
  { re: /getByRole\(\s*['"`](.*?)['"`]\s*(?:,\s*\{\s*name:\s*['"`](.*?)['"`].*?\})?\s*\)/, strategy: 'role' },
  { re: /getByLabel\(\s*['"`](.*?)['"`]\s*\)/, strategy: 'label' },
  { re: /getByPlaceholder\(\s*['"`](.*?)['"`]\s*\)/, strategy: 'placeholder' },
  { re: /getByText\(\s*['"`](.*?)['"`]\s*\)/, strategy: 'text' },
  { re: /locator\(\s*['"`](.*?)['"`]\s*\)/, strategy: 'css' },
];

function extractLocator(line: string): { selector?: string; strategy?: RecordedStep['selectorStrategy']; roleName?: string } {
  for (const { re, strategy } of LOCATOR_PATTERNS) {
    const match = line.match(re);
    if (match) {
      return { selector: match[1], strategy, roleName: match[2] };
    }
  }
  return {};
}

/**
 * Converts raw Playwright Codegen TypeScript output into the structured JSON step-list
 * the spec calls for (e.g. { action: 'click', selector: '#login-btn' }), so steps can be
 * stored, edited, and later re-exported rather than kept as an opaque source file.
 */
export function parseCodegenToSteps(code: string): RecordedStep[] {
  const steps: RecordedStep[] = [];
  const lines = code.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('await page.')) continue;

    const gotoMatch = trimmed.match(/page\.goto\(\s*['"`](.*?)['"`]\s*\)/);
    if (gotoMatch) {
      steps.push({ action: 'goto', value: gotoMatch[1] });
      continue;
    }

    const { selector, strategy, roleName } = extractLocator(trimmed);

    if (/\.click\(\)/.test(trimmed)) {
      steps.push({ action: 'click', selector, selectorStrategy: strategy, roleName });
    } else if (/\.fill\(\s*['"`](.*?)['"`]\s*\)/.test(trimmed)) {
      const valueMatch = trimmed.match(/\.fill\(\s*['"`](.*?)['"`]\s*\)/);
      steps.push({ action: 'fill', selector, selectorStrategy: strategy, roleName, value: valueMatch?.[1] });
    } else if (/\.press\(\s*['"`](.*?)['"`]\s*\)/.test(trimmed)) {
      const keyMatch = trimmed.match(/\.press\(\s*['"`](.*?)['"`]\s*\)/);
      steps.push({ action: 'press', selector, selectorStrategy: strategy, roleName, value: keyMatch?.[1] });
    } else if (/\.check\(\)/.test(trimmed)) {
      steps.push({ action: 'check', selector, selectorStrategy: strategy, roleName });
    } else if (/\.selectOption\(\s*['"`](.*?)['"`]\s*\)/.test(trimmed)) {
      const optMatch = trimmed.match(/\.selectOption\(\s*['"`](.*?)['"`]\s*\)/);
      steps.push({ action: 'select', selector, selectorStrategy: strategy, roleName, value: optMatch?.[1] });
    }
  }

  return steps;
}
