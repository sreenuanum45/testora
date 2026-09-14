import type { Page, Locator } from '@playwright/test';
import type { HealEventPayload, LocatorDescriptor } from './types';
import { resolveVisible } from './resolve';
import { attemptHeuristicRepair } from './heuristics';
import { captureInteractiveSnapshot } from './dom-snapshot';
import { suggestHealedDescriptor } from './llm-heal';

/** Accumulates every heal that happens during this test run so the execution service
 *  can persist them to Postgres afterward (this runs in a spawned child process with no
 *  direct DB access — see execution.service.ts). */
export const healEvents: HealEventPayload[] = [];

/**
 * The full Observe -> Diagnose -> Act -> Verify -> Persist loop:
 *  1. OBSERVE: the primary descriptor fails to resolve to a visible element.
 *  2. DIAGNOSE (cheap): heuristic candidates derived from the descriptor's own fields.
 *  3. DIAGNOSE (LLM): a DOM snapshot is sent to Groq and Gemini in parallel (first valid
 *     response wins, falling back to OpenRouter -> OpenAI if both fail), which suggests a
 *     replacement descriptor.
 *  4. VERIFY: the suggestion must resolve to a real visible element or it's rejected.
 *  5. ACT/PERSIST: the heal is recorded in `healEvents` for later database persistence.
 */
export async function healingLocate(page: Page, descriptor: LocatorDescriptor): Promise<Locator> {
  // The original locator gets a real grace window (matches typical real-world page-load
  // variance) before being treated as broken — candidates probed below stay on the short
  // default timeout since those are speculative guesses, not the expected-to-work path.
  const direct = await resolveVisible(page, descriptor, 6000);
  if (direct) return direct;

  const heuristic = await attemptHeuristicRepair(page, descriptor);
  if (heuristic) {
    healEvents.push({
      locatorKey: descriptor.key,
      failedStrategy: descriptor.strategy,
      healedStrategy: heuristic.descriptor.strategy,
      method: 'HEURISTIC',
      oldValue: descriptor.value,
      newValue: heuristic.descriptor.value,
      verified: true,
    });
    return heuristic.locator;
  }

  const snapshot = await captureInteractiveSnapshot(page);
  const suggestion = await suggestHealedDescriptor(descriptor.key, descriptor, snapshot).catch(() => null);
  if (suggestion) {
    const locator = await resolveVisible(page, suggestion.descriptor);
    if (locator) {
      healEvents.push({
        locatorKey: descriptor.key,
        failedStrategy: descriptor.strategy,
        healedStrategy: suggestion.descriptor.strategy,
        method: 'LLM',
        provider: suggestion.provider,
        model: suggestion.model,
        oldValue: descriptor.value,
        newValue: suggestion.descriptor.value,
        verified: true,
      });
      return locator;
    }
  }

  throw new Error(`Unable to resolve or heal locator "${descriptor.key}" (${descriptor.strategy}: ${descriptor.value})`);
}
