import { useEffect, useState } from 'react';
import { Sparkles, Zap, Bot, Flame } from 'lucide-react';
import { api } from '../api/client';
import type { HealInsights } from '../api/types';

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/**
 * Project-wide view of what self-healing has actually been doing — the engine's value is
 * otherwise invisible, buried inside individual run logs one at a time. Shows how much of
 * the healing is free (heuristic) vs LLM-assisted, which provider is doing the LLM work, and
 * — the most actionable part — which locators heal over and over, since a locator that keeps
 * healing (even though every run still passes) is a real fragility signal worth fixing at
 * the source rather than continuing to auto-repair indefinitely.
 */
export default function HealInsightsPanel({ projectId }: { projectId: string | null }): JSX.Element | null {
  const [data, setData] = useState<HealInsights | null>(null);

  useEffect(() => {
    if (!projectId) return;
    api.get<HealInsights>(`/projects/${projectId}/heal-insights`).then(setData);
  }, [projectId]);

  if (!data) return null;

  const heuristic = data.byMethod.HEURISTIC ?? 0;
  const llm = data.byMethod.LLM ?? 0;
  const methodTotal = heuristic + llm;
  const heuristicPct = methodTotal > 0 ? Math.round((heuristic / methodTotal) * 100) : 0;

  const providerEntries = Object.entries(data.byProvider).sort((a, b) => b[1] - a[1]);
  const maxProviderCount = Math.max(1, ...providerEntries.map(([, c]) => c));

  return (
    <div className="bg-panel border border-border rounded-2xl shadow-card overflow-hidden">
      <div className="flex items-center gap-3 p-5 border-b border-border">
        <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center">
          <Sparkles size={18} className="text-brand-500" />
        </div>
        <div>
          <div className="font-semibold text-ink">Self-Healing Intelligence</div>
          <div className="text-xs text-muted">What the healing engine has repaired across this project</div>
        </div>
      </div>

      {data.totalHeals === 0 ? (
        <p className="text-sm text-muted text-center py-10">No locators have needed healing yet.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-border">
          {/* Method split: free heuristic repair vs LLM-assisted */}
          <div className="p-5">
            <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">Heals by method</div>
            <div className="text-3xl font-bold text-ink mb-1">{data.totalHeals}</div>
            <div className="text-xs text-muted mb-4">total locators healed</div>

            <div className="flex h-2.5 rounded-full overflow-hidden bg-surface mb-2" role="img" aria-label={`${heuristicPct}% healed for free via heuristic, ${100 - heuristicPct}% via LLM`}>
              {heuristic > 0 && <div className="bg-emerald-400" style={{ width: `${heuristicPct}%` }} />}
              {heuristic > 0 && llm > 0 && <div className="w-0.5 bg-panel" />}
              {llm > 0 && <div className="bg-brand-400" style={{ width: `${100 - heuristicPct}%` }} />}
            </div>
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 text-emerald-600">
                <Zap size={12} />
                <span className="font-medium">{heuristic} free (heuristic)</span>
              </div>
              <div className="flex items-center gap-1.5 text-brand-600">
                <Bot size={12} />
                <span className="font-medium">{llm} via LLM</span>
              </div>
            </div>
          </div>

          {/* Provider breakdown */}
          <div className="p-5">
            <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">LLM provider usage</div>
            {providerEntries.length === 0 ? (
              <p className="text-sm text-muted">No LLM-assisted heals yet.</p>
            ) : (
              <div className="space-y-2.5">
                {providerEntries.map(([provider, count]) => (
                  <div key={provider} className="flex items-center gap-2.5">
                    <span className="text-xs text-ink w-20 shrink-0 truncate">{provider}</span>
                    <div className="flex-1 h-2 rounded-full bg-surface overflow-hidden">
                      <div
                        className="h-full rounded-full bg-brand-400"
                        style={{ width: `${(count / maxProviderCount) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted w-6 text-right shrink-0">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Most-fragile locators */}
          <div className="p-5">
            <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <Flame size={12} className="text-orange-500" />
              Most fragile locators
            </div>
            {data.topLocators.length === 0 ? (
              <p className="text-sm text-muted">Nothing has healed more than once.</p>
            ) : (
              <div className="space-y-2">
                {data.topLocators.slice(0, 5).map((l) => (
                  <div key={`${l.testId}:${l.locatorKey}`} className="flex items-center justify-between gap-2 text-xs">
                    <div className="min-w-0">
                      <div className="text-ink font-medium truncate">{l.testName}</div>
                      <div className="text-muted truncate">{l.locatorKey}</div>
                    </div>
                    <span className="shrink-0 px-2 py-0.5 rounded-full bg-orange-50 text-orange-600 font-semibold">
                      {l.count}×
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {data.recent.length > 0 && (
        <div className="border-t border-border p-5">
          <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">Recent heals</div>
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {data.recent.slice(0, 8).map((h) => (
              <div key={h.id} className="flex items-center gap-2 text-xs bg-surface border border-border rounded-lg px-3 py-2">
                {h.method === 'HEURISTIC' ? (
                  <Zap size={12} className="text-emerald-500 shrink-0" />
                ) : (
                  <Bot size={12} className="text-brand-500 shrink-0" />
                )}
                <span className="text-ink font-medium truncate">{h.testName}</span>
                <span className="text-muted truncate flex-1">
                  {h.oldValue} → {h.newValue}
                </span>
                <span className="text-muted shrink-0">{timeAgo(h.createdAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
