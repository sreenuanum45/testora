import { useEffect, useState } from 'react';
import { Calendar, Play } from 'lucide-react';
import { api } from '../api/client';
import { useAppStore } from '../store/appStore';
import type { Suite } from '../api/types';

const PRESETS = [
  { label: 'Every 15 min', value: '*/15 * * * *' },
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Daily at 9am', value: '0 9 * * *' },
  { label: 'Weekdays at 9am', value: '0 9 * * 1-5' },
  { label: 'Weekly (Mon 9am)', value: '0 9 * * 1' },
];

export default function Schedulers(): JSX.Element {
  const projectId = useAppStore((s) => s.currentProjectId);
  const [suites, setSuites] = useState<Suite[]>([]);
  const [cronBySuite, setCronBySuite] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  const refresh = (): void => {
    if (!projectId) return;
    api.get<Suite[]>(`/projects/${projectId}/suites`).then(setSuites);
  };

  useEffect(refresh, [projectId]);

  const setSchedule = async (suiteId: string): Promise<void> => {
    if (!projectId) return;
    const cronExpression = cronBySuite[suiteId];
    if (!cronExpression) return;
    try {
      await api.post(`/projects/${projectId}/suites/${suiteId}/scheduler`, { cronExpression });
      setMessage(`Schedule saved: ${cronExpression}`);
      refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  };

  const disable = async (suiteId: string): Promise<void> => {
    if (!projectId) return;
    await api.delete(`/projects/${projectId}/suites/${suiteId}/scheduler`);
    refresh();
  };

  const runNow = async (suiteId: string): Promise<void> => {
    if (!projectId) return;
    await api.post(`/projects/${projectId}/suites/${suiteId}/run`);
    setMessage('Suite run started.');
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-ink">Schedulers</h1>
        <p className="text-muted text-sm mt-1">
          All of this project's suite schedules in one place. Set a cron expression per suite to run it
          automatically, or trigger it immediately.
        </p>
      </div>

      {message && <p className="text-sm text-brand-600">{message}</p>}

      {suites.length === 0 ? (
        <div className="bg-panel border border-border rounded-2xl p-8 text-center text-muted text-sm">
          No suites yet — create one on the Suites page first.
        </div>
      ) : (
        suites.map((suite) => (
          <div key={suite.id} className="bg-panel border border-border rounded-2xl shadow-card p-5 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Calendar size={16} className="text-brand-500" />
              <div>
                <h2 className="font-semibold text-ink">{suite.name}</h2>
                <p className="text-xs text-muted mt-0.5 font-mono">
                  {suite.scheduler?.enabled ? suite.scheduler.cronExpression : 'Not scheduled'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <select
                className="bg-surface border border-border rounded-lg px-2 py-1.5 text-xs"
                onChange={(e) => e.target.value && setCronBySuite((prev) => ({ ...prev, [suite.id]: e.target.value }))}
                defaultValue=""
              >
                <option value="" disabled>
                  Preset...
                </option>
                {PRESETS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
              <input
                className="bg-surface border border-border rounded-lg px-2 py-1.5 text-xs w-32 font-mono"
                placeholder="* * * * *"
                value={cronBySuite[suite.id] ?? ''}
                onChange={(e) => setCronBySuite((prev) => ({ ...prev, [suite.id]: e.target.value }))}
              />
              <button className="px-3 py-1.5 rounded-lg bg-ink text-white text-xs font-medium" onClick={() => setSchedule(suite.id)}>
                Save
              </button>
              {suite.scheduler?.enabled && (
                <button className="px-3 py-1.5 rounded-lg border border-border text-xs text-muted" onClick={() => disable(suite.id)}>
                  Disable
                </button>
              )}
              <button
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gradient-to-r from-brand-500 to-brand-400 text-white text-xs font-semibold"
                onClick={() => runNow(suite.id)}
              >
                <Play size={12} />
                Run now
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
