import { chromium, type Browser, type Page } from 'playwright-core';
import type { LlmProviderService } from '../llm/llm-provider.service';
import type { RecordedStep } from './step-parser';

const HYPERBROWSER_API = 'https://api.hyperbrowser.ai/api';

interface HyperbrowserSession {
  id: string;
  liveUrl: string;
  wsEndpoint: string;
}

/** Raw shape sent back by the in-page recorder script via exposeFunction — one per
 *  click/fill/check/select, plus a synthetic 'goto' for the initial page load. `html` is
 *  only kept for events whose heuristic selector fell back to a raw CSS path, as context
 *  for the LLM upgrade pass in `upgradeWeakSelectors` — dropped before steps are persisted. */
interface RawEvent {
  type: 'goto' | 'click' | 'fill' | 'check' | 'select';
  strategy?: RecordedStep['selectorStrategy'];
  selector?: string;
  roleName?: string;
  value?: string;
  html?: string;
}

function apiKey(): string {
  const key = process.env.HYPERBROWSER_API_KEY;
  if (!key) throw new Error('HYPERBROWSER_API_KEY is not set');
  return key;
}

async function createSession(): Promise<HyperbrowserSession> {
  const res = await fetch(`${HYPERBROWSER_API}/session`, {
    method: 'POST',
    headers: { 'x-api-key': apiKey(), 'Content-Type': 'application/json' },
    // Auto-expire well past any realistic recording session — a stopped-but-not-closed
    // tab shouldn't be able to burn the whole free-tier credit balance unattended.
    body: JSON.stringify({ timeoutMinutes: 20 }),
  });
  if (!res.ok) throw new Error(`Hyperbrowser session create failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { id: string; liveUrl: string; wsEndpoint: string };
  return { id: data.id, liveUrl: data.liveUrl, wsEndpoint: data.wsEndpoint };
}

async function stopSession(id: string): Promise<void> {
  try {
    await fetch(`${HYPERBROWSER_API}/session/${id}`, { method: 'DELETE', headers: { 'x-api-key': apiKey() } });
  } catch {
    // best-effort — Hyperbrowser's own timeoutMinutes cap is the real backstop
  }
}

/** Runs in the page itself (stringified via addInitScript, not bundled/typechecked with
 *  the rest of the backend) — attaches capture listeners and reports each interaction back
 *  through the `__testoraRecord` binding exposed on the Node side below. Selector priority
 *  mirrors the strategy order already used everywhere else in this app (testid > role >
 *  label > placeholder > text > css — see LocatorStrategy in schema.prisma), so recorded
 *  steps materialize into Locator rows the exact same way Codegen-parsed ones always have. */
function inPageRecorderScript(): void {
  function implicitRole(el: Element): string | null {
    const tag = el.tagName.toLowerCase();
    if (tag === 'button') return 'button';
    if (tag === 'a' && el.hasAttribute('href')) return 'link';
    if (tag === 'select') return 'combobox';
    if (tag === 'textarea') return 'textbox';
    if (tag === 'input') {
      const type = (el.getAttribute('type') || 'text').toLowerCase();
      if (type === 'button' || type === 'submit') return 'button';
      if (type === 'checkbox') return 'checkbox';
      if (type === 'radio') return 'radio';
      return 'textbox';
    }
    return null;
  }
  function accessibleName(el: Element): string | null {
    const aria = el.getAttribute('aria-label');
    if (aria) return aria.trim();
    const text = (el as HTMLElement).innerText?.trim();
    if (text && text.length <= 80) return text;
    const title = el.getAttribute('title');
    return title ? title.trim() : null;
  }
  function labelText(el: Element): string | null {
    const withLabels = el as HTMLInputElement;
    if (withLabels.labels && withLabels.labels.length > 0) return withLabels.labels[0]!.innerText.trim();
    const id = el.getAttribute('id');
    if (id) {
      const lbl = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (lbl) return (lbl as HTMLElement).innerText.trim();
    }
    return null;
  }
  function cssPath(el: Element): string {
    if (el.id) return `#${CSS.escape(el.id)}`;
    const parts: string[] = [];
    let node: Element | null = el;
    while (node && node.nodeType === 1 && parts.length < 6) {
      let sel = node.tagName.toLowerCase();
      if (node.parentElement) {
        const siblings = Array.from(node.parentElement.children).filter((c) => c.tagName === node!.tagName);
        if (siblings.length > 1) sel += `:nth-of-type(${siblings.indexOf(node) + 1})`;
      }
      parts.unshift(sel);
      node = node.parentElement;
    }
    return parts.join(' > ');
  }
  function describe(el: Element): { strategy: string; selector: string; roleName?: string; html?: string } {
    const testId = el.getAttribute('data-testid') || el.getAttribute('data-test-id') || el.getAttribute('data-test');
    if (testId) return { strategy: 'testid', selector: testId };
    const role = el.getAttribute('role') || implicitRole(el);
    const name = role ? accessibleName(el) : null;
    if (role && name) return { strategy: 'role', selector: role, roleName: name };
    const label = labelText(el);
    if (label) return { strategy: 'label', selector: label };
    const placeholder = el.getAttribute('placeholder');
    if (placeholder) return { strategy: 'placeholder', selector: placeholder };
    const text = (el as HTMLElement).innerText?.trim();
    if (text && text.length > 0 && text.length <= 60 && (el.tagName === 'A' || el.tagName === 'BUTTON')) {
      return { strategy: 'text', selector: text };
    }
    return { strategy: 'css', selector: cssPath(el), html: el.outerHTML.slice(0, 500) };
  }

  document.addEventListener(
    'click',
    (e) => {
      const raw = e.target as Element;
      if (!raw || raw.nodeType !== 1) return;
      // The click's real target is often an icon/span/svg *inside* a button or link, not
      // the interactive element itself — describing that raw target produces a brittle
      // nth-of-type CSS path even though the actual button has a perfectly good label
      // right above it. Walk up to the nearest interactive ancestor first, same as
      // Codegen's own click handling does.
      const el =
        raw.closest('button, a, [role], input, select, textarea, [data-testid], [data-test-id], [data-test]') ?? raw;
      // @ts-expect-error injected global, defined by exposeFunction before this script runs
      window.__testoraRecord({ type: 'click', ...describe(el) });
    },
    true,
  );

  document.addEventListener(
    'change',
    (e) => {
      const el = e.target as HTMLInputElement;
      if (!el || el.nodeType !== 1) return;
      const info = describe(el);
      if (el.tagName === 'SELECT') {
        // @ts-expect-error injected global
        window.__testoraRecord({ type: 'select', ...info, value: el.value });
      } else if (el.type === 'checkbox' || el.type === 'radio') {
        // @ts-expect-error injected global
        window.__testoraRecord({ type: 'check', ...info });
      } else {
        const isPassword = el.type === 'password' || /password/i.test(el.name || '') || /password/i.test(el.id || '');
        // @ts-expect-error injected global
        window.__testoraRecord({ type: 'fill', ...info, value: isPassword ? '__REDACTED__' : el.value });
      }
    },
    true,
  );
}

/** Asks the LLM chain to suggest a better locator for events whose heuristic fell all the
 *  way through to a raw CSS path — mirrors self-healing's "heuristic first, LLM only when
 *  heuristics aren't confident" split. Best-effort: any failure (no provider configured,
 *  bad response, timeout) just leaves the CSS fallback in place rather than blocking or
 *  discarding the recording. */
async function upgradeWeakSelectors(events: RawEvent[], llm: LlmProviderService): Promise<void> {
  const weak = events.filter((e) => e.strategy === 'css' && e.html);
  await Promise.all(
    weak.map(async (event) => {
      try {
        const raw = await llm.completeWithFallback(
          'You are picking a robust Playwright locator for an element in a recorded browser test. ' +
            'Reply with ONLY a JSON object, no prose: {"strategy":"testid"|"role"|"label"|"placeholder"|"text"|"css","selector":"...","roleName"?:"..."}. ' +
            'Prefer testid > role+name > label > placeholder > text over css — only use "css" if truly nothing better exists.',
          `Element HTML:\n${event.html}`,
        );
        const parsed = JSON.parse(raw.raw.trim().replace(/^```json\s*|\s*```$/g, '')) as {
          strategy?: RecordedStep['selectorStrategy'];
          selector?: string;
          roleName?: string;
        };
        if (parsed.strategy && parsed.selector) {
          event.strategy = parsed.strategy;
          event.selector = parsed.selector;
          event.roleName = parsed.roleName;
        }
      } catch {
        // keep the css fallback
      }
    }),
  );
}

export class HyperbrowserRecording {
  private events: RawEvent[] = [];
  private browser: Browser | null = null;
  private page: Page | null = null;
  session: HyperbrowserSession | null = null;

  async start(targetUrl: string): Promise<{ liveUrl: string }> {
    this.session = await createSession();
    this.browser = await chromium.connectOverCDP(this.session.wsEndpoint);
    const context = this.browser.contexts()[0] ?? (await this.browser.newContext());
    this.page = context.pages()[0] ?? (await context.newPage());

    await this.page.exposeFunction('__testoraRecord', (event: RawEvent) => {
      this.events.push(event);
    });
    await this.page.addInitScript(inPageRecorderScript);
    await this.page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
    this.events.push({ type: 'goto', value: targetUrl });

    return { liveUrl: this.session.liveUrl };
  }

  /** Ends the session and returns the finished, LLM-upgraded step list. Safe to call even
   *  if start() partially failed (e.g. session created but CDP connect failed) — always
   *  tears down whatever was actually opened. */
  async stop(llm: LlmProviderService): Promise<RecordedStep[]> {
    try {
      await upgradeWeakSelectors(this.events, llm);
    } catch {
      // upgradeWeakSelectors already swallows its own per-event errors; this is just an
      // extra backstop so a totally unexpected failure here still lets stop() finish.
    }
    try {
      await this.browser?.close();
    } catch {
      // remote side may already be gone
    }
    if (this.session) await stopSession(this.session.id);

    return this.events.map(
      (e): RecordedStep =>
        e.type === 'goto'
          ? { action: 'goto', value: e.value }
          : {
              action: e.type,
              selector: e.selector,
              selectorStrategy: e.strategy,
              roleName: e.roleName,
              value: e.value,
            },
    );
  }
}
