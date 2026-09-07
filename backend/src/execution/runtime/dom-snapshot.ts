import type { Page } from '@playwright/test';

/** Compact, LLM-friendly snapshot of interactive elements — sent to the LLM instead of
 *  raw HTML so it can suggest a locator without a huge token payload. */
export async function captureInteractiveSnapshot(page: Page): Promise<unknown[]> {
  return page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('input, button, a, select, textarea, [role], [data-testid]')).slice(0, 200);
    return nodes
      .map((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return null;
        return {
          tag: el.tagName.toLowerCase(),
          id: el.id || undefined,
          testId: el.getAttribute('data-testid') || undefined,
          role: el.getAttribute('role') || undefined,
          ariaLabel: el.getAttribute('aria-label') || undefined,
          placeholder: el.getAttribute('placeholder') || undefined,
          text: el.textContent?.trim().slice(0, 60) || undefined,
        };
      })
      .filter((e) => e !== null);
  });
}
