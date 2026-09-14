import { useState } from 'react';
import { Newspaper, Loader2, Sparkles, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { api } from '../api/client';
import type { WeeklyDigest } from '../api/types';

function TrendIcon({ thisWeek, lastWeek }: { thisWeek: number | null; lastWeek: number | null }): JSX.Element | null {
  if (thisWeek === null || lastWeek === null) return null;
  if (thisWeek > lastWeek) return <TrendingUp size={14} className="text-emerald-500" />;
  if (thisWeek < lastWeek) return <TrendingDown size={14} className="text-red-500" />;
  return <Minus size={14} className="text-muted" />;
}

/** One-click natural-language "standup update" for the project — composes the health and
 *  heal-insights data already computed server-side into a short written summary instead of
 *  making someone read three separate panels to piece the same story together. Generated
 *  on demand (costs an LLM call) rather than eagerly on every dashboard load. */
export default function WeeklyDigestPanel({ projectId }: { projectId: string | null }): JSX.Element | null {
  const [digest, setDigest] = useState<WeeklyDigest | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = (): void => {
    if (!projectId || busy) return;
    setBusy(true);
    setError(null);
    api
      .post<WeeklyDigest>(`/projects/${projectId}/digest`)
      .then(setDigest)
      .catch((err: Error) => setError(err.message))
      .finally(() => setBusy(false));
  };

  if (!projectId) return null;

  return (
    <div className="bg-panel border border-border rounded-2xl shadow-card overflow-hidden">
      <div className="flex items-center justify-between p-5 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center">
            <Newspaper size={18} className="text-brand-500" />
          </div>
          <div>
            <div className="font-semibold text-ink">Weekly Digest</div>
            <div className="text-xs text-muted">An AI-written standup update for the last 7 days</div>
          </div>
        </div>
        <button
          onClick={generate}
          disabled={busy}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-brand-500 to-brand-400 text-white text-sm font-semibold disabled:opacity-60"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {busy ? 'Writing…' : digest ? 'Regenerate' : 'Generate'}
        </button>
      </div>

      {error && <p className="text-sm text-red-600 px-5 py-4">{error}</p>}

      {digest && (
        <div className="p-5 space-y-4">
          <p className="text-sm text-ink leading-relaxed">{digest.digest}</p>

          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface border border-border text-xs text-ink">
              <TrendIcon thisWeek={digest.summary.passRateThisWeek} lastWeek={digest.summary.passRateLastWeek} />
              Pass rate: {digest.summary.passRateThisWeek ?? '—'}%
              {digest.summary.passRateLastWeek !== null && (
                <span className="text-muted">(was {digest.summary.passRateLastWeek}%)</span>
              )}
            </span>
            <span className="px-2.5 py-1 rounded-full bg-surface border border-border text-xs text-ink">
              {digest.summary.totalRuns} run{digest.summary.totalRuns === 1 ? '' : 's'}
            </span>
            {digest.summary.brokenTests.length > 0 && (
              <span className="px-2.5 py-1 rounded-full bg-red-50 border border-red-200 text-xs text-red-600">
                {digest.summary.brokenTests.length} broken
              </span>
            )}
            {digest.summary.flakyTests.length > 0 && (
              <span className="px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-xs text-amber-600">
                {digest.summary.flakyTests.length} flaky
              </span>
            )}
            {digest.summary.locatorsHealedThisWeek > 0 && (
              <span className="px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-xs text-emerald-600">
                {digest.summary.locatorsHealedThisWeek} healed
              </span>
            )}
          </div>

          {digest.provider && <p className="text-[10px] text-muted">via {digest.provider}</p>}
        </div>
      )}

      {!digest && !error && !busy && (
        <p className="text-sm text-muted text-center py-8">Click Generate to get this week's summary.</p>
      )}
    </div>
  );
}
