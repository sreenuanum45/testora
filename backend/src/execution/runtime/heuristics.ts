import type { Page, Locator } from '@playwright/test';
import type { LocatorDescriptor } from './types';
import { resolveVisible } from './resolve';

/** Derives alternate candidate descriptors from whatever information the ORIGINAL
 *  (now-failing) descriptor still carries, and probes each against the live DOM. This is
 *  free and near-instant, so it always runs before the LLM is invoked. Ported from the
 *  proven implementation in the sibling QA platform (self-healing/heuristics.ts). */
export async function attemptHeuristicRepair(
  page: Page,
  original: LocatorDescriptor,
): Promise<{ descriptor: LocatorDescriptor; locator: Locator } | null> {
  const candidates: LocatorDescriptor[] = [];

  if (original.strategy === 'role' && original.roleName) {
    candidates.push({ key: original.key, strategy: 'role', value: original.value, roleName: original.roleName });
  }
  // For a role descriptor with no accessible name, `value` is just the role KEYWORD
  // ("link", "button", ...) — never a real label/placeholder/text on the page, so probing
  // those would only waste time on guaranteed misses. Every other strategy's `value` (or a
  // role's roleName) is at least plausible page content, worth trying as a seed.
  const seed = original.roleName ?? (original.strategy === 'role' ? null : original.value);
  if (seed) {
    candidates.push(
      { key: original.key, strategy: 'label', value: seed },
      { key: original.key, strategy: 'placeholder', value: seed },
      { key: original.key, strategy: 'text', value: seed },
    );
  }
  if (original.strategy === 'testid') {
    const kebab = original.value.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
    const camel = original.value.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
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
