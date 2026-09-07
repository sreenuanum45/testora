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
 *  where only one copy is genuinely interactable. */
export async function resolveVisible(page: Page, d: LocatorDescriptor): Promise<Locator | null> {
  const locator = resolveDescriptor(page, d);
  try {
    const count = await locator.count();
    for (let i = 0; i < count; i += 1) {
      const nth = locator.nth(i);
      if (await nth.isVisible().catch(() => false)) return nth;
    }
  } catch {
    return null;
  }
  return null;
}
