import { defineConfig } from '@playwright/test';

/**
 * Config used only for executing generated test specs (tmp/execution/<runId>/spec.ts) —
 * separate from any config a user's own project might have. Trace and video are kept
 * only for failing runs — a passing suite was silently accumulating ~12MB of trace.zip
 * per run (nothing ever pruned tmp/execution), which is untenable on a small/free host.
 * Failing runs are exactly where self-healing/debugging visibility is actually needed,
 * so retain-on-failure keeps that without the unbounded growth on green runs.
 * Screenshot stays on for every run (pass or fail) — it's cheap (~120KB) and visual
 * regression diffing (ExecutionProcessor.diffAgainstVisualBaseline) needs an image to
 * compare against a test's baseline even on a run that otherwise passed.
 */
export default defineConfig({
  testDir: './tmp/execution',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'on',
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },
  // Chromium only — see backend/Dockerfile for why (Firefox/WebKit dropped to keep the
  // deployed image lightweight; re-add both here and in the Dockerfile if that changes).
  projects: [{ name: 'chromium' }],
});
