// playwright.exec.config.ts's `use.connectOptions.wsEndpoint` was the first thing tried
// here — it hung indefinitely (confirmed live: `pw:api => browserType.connect started`
// and then nothing, forever). Reason: connectOptions speaks Playwright's own native
// browser-server protocol via browserType.connect(), but Hyperbrowser's wsEndpoint is a
// raw CDP endpoint (its path literally contains /cdp/devtools/browser/...) — the two are
// different protocols entirely. connectOverCDP is the one that actually speaks CDP, so
// this overrides the `page` fixture directly rather than relying on config.
import { test as base, expect } from '@playwright/test';
import { chromium } from 'playwright-core';

export const test = base.extend({
  page: async ({ page }, use) => {
    const wsEndpoint = process.env.HYPERBROWSER_WS_ENDPOINT;
    if (!wsEndpoint) {
      // No Hyperbrowser session for this run — use Playwright's own default `page`
      // unchanged, so all normal launch options (headed/headless, channel, etc. — see
      // execution.processor.ts's spawnPlaywright) keep working exactly as before.
      await use(page);
      return;
    }

    const remoteBrowser = await chromium.connectOverCDP(wsEndpoint);
    try {
      const context = remoteBrowser.contexts()[0] ?? (await remoteBrowser.newContext());
      const remotePage = context.pages()[0] ?? (await context.newPage());
      await use(remotePage);
    } finally {
      await remoteBrowser.close();
    }
  },
});

export { expect };
