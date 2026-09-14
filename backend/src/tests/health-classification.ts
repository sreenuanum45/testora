export type TestHealthClassification = 'NEW' | 'STABLE' | 'FLAKY' | 'BROKEN';

/**
 * Classifies a test from its own recent run statuses (newest first):
 *  - BROKEN: failing right now, and consistently (its last 3+ runs all failed) — not a
 *    blip, something is actually wrong.
 *  - FLAKY: recent runs don't agree (a mix of PASSED and FAILED) — the test itself is
 *    unreliable, distinct from "the app broke."
 *  - STABLE: every recent run passed.
 *  - NEW: no runs yet, nothing to classify.
 * Shared by TestsService.getHealthSummary (dashboard triage) and ExecutionProcessor
 * (auto-quarantine on the run that first pushes a test into FLAKY) so both agree on the
 * exact same definition of "flaky."
 */
export function classifyHealth(statusesNewestFirst: Array<'PASSED' | 'FAILED'>): TestHealthClassification {
  if (statusesNewestFirst.length === 0) return 'NEW';

  const lastThree = statusesNewestFirst.slice(0, 3);
  const allFailed = statusesNewestFirst.every((s) => s === 'FAILED');
  const consistentlyBroken = lastThree.length >= 3 && lastThree.every((s) => s === 'FAILED');
  const mixed = statusesNewestFirst.includes('PASSED') && statusesNewestFirst.includes('FAILED');

  if (consistentlyBroken || (allFailed && statusesNewestFirst.length >= 2)) return 'BROKEN';
  if (mixed) return 'FLAKY';
  return 'STABLE';
}
