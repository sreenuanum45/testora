// Grounds the Planner/Generator agents in the REAL page instead of LLM guesses. A
// Hyperbrowser session is created per exploration (short timeout — exploration only
// needs to last seconds), connected to over CDP exactly the way hyperbrowser-fixtures.ts
// connects execution runs, the target URL loaded, and an accessibility snapshot captured
// as the compact textual representation Playwright's own tooling uses. That snapshot is
// what the agents' prompts see, so a plan like "click Sign in" is backed by a real
// button ref on the actual page rather than a hallucinated one.
//
// Falls back to plaintext body text when ariaSnapshot() is unavailable (older bundled
// Playwright) so the agents still get *something* real to ground on.

import { chromium } from 'playwright-core';
import { createHyperbrowserSession, stopHyperbrowserSession } from '../execution/runtime/hyperbrowser-client';

export interface ExploredPage {
  url: string;
  title: string;
  /** Accessibility snapshot (roles/names/refs) or a plaintext fallback — size-capped. */
  snapshot: string;
  usedFallback: boolean;
}

/** Keeps the LLM prompt bounded: a huge page's full snapshot would eat the context
 *  window with noise before the agents ever see the elements that matter. */
const SNAPSHOT_CHAR_LIMIT = 12000;

export async function exploreSite(targetUrl: string, timeoutSeconds = 60): Promise<ExploredPage> {
  // Session timeout is a backstop (see hyperbrowser-client.ts) — the real lifecycle is
  // this function's try/finally, which stops the session as soon as exploration ends.
  const session = await createHyperbrowserSession(Math.max(2, Math.ceil(timeoutSeconds / 60) + 1));

  try {
    const browser = await chromium.connectOverCDP(session.wsEndpoint, { timeout: timeoutSeconds * 1000 });
    try {
      const context = browser.contexts()[0] ?? (await browser.newContext());
      const page = context.pages()[0] ?? (await context.newPage());

      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: timeoutSeconds * 1000 });
      // SPA-heavy sites keep mutating the DOM after domcontentloaded; a short settle
      // makes the snapshot materially more representative of what a user sees.
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});

      const title = await page.title();
      let usedFallback = false;
      let snapshot: string;

      // Every path here MUST be awaited and caught: ariaSnapshot() returns a promise, and
      // a floating one resolves/rejects after browser.close() below — an unhandled
      // rejection, which is FATAL in Node 20 (crashed the deployed service as a 502 on
      // every agents call before this fix). Locator-scoped snapshot is tried first
      // (verified working against real Hyperbrowser sessions); page-level is the second
      // attempt, and plaintext innerText is the final fallback so grounding never hard-
      // fails the whole agent call just because one snapshot API misbehaved.
      const body = page.locator('body');
      const bodySnapFn = body.ariaSnapshot as unknown as ((options?: { timeout?: number }) => Promise<string>) | undefined;
      const pageSnapFn = page.ariaSnapshot as unknown as ((options?: { timeout?: number }) => Promise<string>) | undefined;
      try {
        if (typeof bodySnapFn === 'function') {
          snapshot = await bodySnapFn.call(body, { timeout: 15000 });
        } else if (typeof pageSnapFn === 'function') {
          snapshot = await pageSnapFn.call(page, { timeout: 15000 });
        } else {
          throw new Error('no ariaSnapshot API available');
        }
      } catch {
        usedFallback = true;
        snapshot = await page
          .evaluate(() => document.body?.innerText ?? '')
          .catch(() => '');
      }

      if (snapshot.length > SNAPSHOT_CHAR_LIMIT) {
        // Cut at a line boundary so the tail isn't a half-written element ref.
        const cut = snapshot.slice(0, SNAPSHOT_CHAR_LIMIT);
        const lastNewline = cut.lastIndexOf('\n');
        snapshot = (lastNewline > 0 ? cut.slice(0, lastNewline) : cut) + '\n… (truncated)';
      }

      return { url: page.url(), title, snapshot, usedFallback };
    } finally {
      await browser.close().catch(() => {});
    }
  } finally {
    await stopHyperbrowserSession(session.id);
  }
}
