import type { Page, Locator } from '@playwright/test';
import type { LocatorDescriptor } from './types';

export function resolveDescriptor(page: Page, d: LocatorDescriptor): Locator {
  switch (d.strategy) {
    case 'testid':
      return page.getByTestId(d.value);
    case 'role':
      return page.getByRole(d.value as Parameters<Page['getByRole']>[0], d.roleName ? { name: d.roleName } : undefined);
    case 'label':
      return page.getByLabel(d.value);
    case 'placeholder':
      return page.getByPlaceholder(d.value);
    case 'text':
      return page.getByText(d.value, { exact: false });
    case 'css':
      return page.locator(d.value);
  }
}

/** Scans every match of a descriptor for the first one that's actually visible — some
 *  real pages render duplicate nodes for different breakpoints (desktop/mobile nav etc.)
 *  where only one copy is genuinely interactable.
 *
 *  Polls for up to timeoutMs rather than checking once — a single instantaneous check can
 *  catch a real, heavy page (ads/trackers/layout shift) mid-render and wrongly conclude a
 *  perfectly fine locator is "broken", burning a heal attempt on what was really just a
 *  timing race. Cheap when the element is already there (returns on the first pass). */
export async function resolveVisible(page: Page, d: LocatorDescriptor, timeoutMs = 300): Promise<Locator | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const locator = resolveDescriptor(page, d);
      const count = await locator.count();
      for (let i = 0; i < count; i += 1) {
        const nth = locator.nth(i);
        if (await nth.isVisible().catch(() => false)) return nth;
      }
    } catch {
      // fall through to the deadline check below
    }
    if (Date.now() >= deadline) return null;
    await page.waitForTimeout(200);
  }
}
