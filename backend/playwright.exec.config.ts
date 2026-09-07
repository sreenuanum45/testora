import { defineConfig } from '@playwright/test';

/**
 * Config used only for executing generated test specs (tmp/execution/<runId>/spec.ts) —
 * separate from any config a user's own project might have. Trace and video are always
 * on so self-healing has full visibility and every run (pass or fail) is replayable.
 */
export default defineConfig({
  testDir: './tmp/execution',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    trace: 'on',
    video: 'on',
    screenshot: 'only-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },
  projects: [{ name: 'chromium' }, { name: 'firefox' }, { name: 'webkit' }],
});
