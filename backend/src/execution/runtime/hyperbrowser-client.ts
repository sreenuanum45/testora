// Shared by recording (hyperbrowser-recorder.ts) and test execution
// (execution.processor.ts) — both need the same thing from Hyperbrowser (a stealth,
// captcha-solving browser session), just for different reasons: recording needs a human
// to see and click through it (liveUrl), execution just needs the wsEndpoint to connect
// Playwright's own test runner to instead of launching Chromium locally. Kept as one
// client so both stay pointed at the same request/response shape and error handling.

const HYPERBROWSER_API = 'https://api.hyperbrowser.ai/api';

export interface HyperbrowserSession {
  id: string;
  liveUrl: string;
  wsEndpoint: string;
}

function apiKey(): string {
  const key = process.env.HYPERBROWSER_API_KEY;
  if (!key) throw new Error('HYPERBROWSER_API_KEY is not set');
  return key;
}

export async function createHyperbrowserSession(timeoutMinutes: number): Promise<HyperbrowserSession> {
  const res = await fetch(`${HYPERBROWSER_API}/session`, {
    method: 'POST',
    headers: { 'x-api-key': apiKey(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      // Caller picks this — a recording session needs to survive as long as someone might
      // reasonably still be clicking through it; a single test run needs only as long as
      // that run's own timeout. Either way it's a backstop against an unattended session
      // burning through the free-tier credit balance, not the primary lifecycle control.
      timeoutMinutes,
      // Most real sites run some form of bot detection on their login/signup flow —
      // exactly where a plain, undisguised Chromium gets served a block page instead of
      // the real one (see execution.processor.ts's Amazon example). solveCaptchas is a
      // paid-plan-only feature (confirmed: the free plan hard-rejects session creation
      // outright with it set, not just "won't solve captchas") — left off so session
      // creation itself keeps working; an actual captcha wall is a separate, harder
      // problem this doesn't claim to solve.
      useStealth: true,
      // Matches the viewport the local Codegen/execution path has always used, so a step
      // recorded (or a test run) in production targets the same layout as local dev does.
      screen: { width: 1440, height: 900 },
    }),
  });
  if (!res.ok) throw new Error(`Hyperbrowser session create failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { id: string; liveUrl: string; wsEndpoint: string };
  return { id: data.id, liveUrl: data.liveUrl, wsEndpoint: data.wsEndpoint };
}

export async function stopHyperbrowserSession(id: string): Promise<void> {
  try {
    // Confirmed by hand against the real API: DELETE /api/session/:id (what the docs
    // summary suggested) 404s — the actual endpoint is PUT .../stop, and it 411s without a
    // body. Getting this wrong is a silent, expensive bug: catch swallows the failure, so
    // nothing errors — the session just leaks for its full timeoutMinutes, silently eating
    // the free tier's one-concurrent-session slot until then. Found by hitting exactly
    // that: "maximum active sessions reached" from an orphaned session on the SECOND call.
    const res = await fetch(`${HYPERBROWSER_API}/session/${id}/stop`, {
      method: 'PUT',
      headers: { 'x-api-key': apiKey(), 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!res.ok) console.error(`Hyperbrowser session stop failed (${id}): ${res.status} ${await res.text()}`);
  } catch (err) {
    console.error(`Hyperbrowser session stop request failed (${id}):`, err);
  }
}
