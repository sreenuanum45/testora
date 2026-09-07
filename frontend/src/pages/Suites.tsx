import { useEffect, useState } from 'react';
import { Play, Plus, Clock, History, ChevronDown, ChevronRight } from 'lucide-react';
import { api } from '../api/client';
import { useAppStore } from '../store/appStore';
import type { Suite, SuiteRun, Test } from '../api/types';

const CRON_PRESETS: Array<{ label: string; value: string }> = [
  { label: 'Every 15 minutes', value: '*/15 * * * *' },
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Daily at 9am', value: '0 9 * * *' },
  { label: 'Every weekday at 9am', value: '0 9 * * 1-5' },
  { label: 'Weekly (Monday 9am)', value: '0 9 * * 1' },
];

function StatusBadge({ status }: { status: string }): JSX.Element {
  const colors: Record<string, string> = {
    PASSED: 'bg-emerald-50 text-emerald-600',
    FAILED: 'bg-red-50 text-red-600',
    RUNNING: 'bg-amber-50 text-amber-600',
    QUEUED: 'bg-slate-100 text-slate-600',
  };
  return <span className={`px-2 py-0.5 rounded-full text-xs ${colors[status] ?? colors.QUEUED}`}>{status}</span>;
}

export default function Suites(): JSX.Element {
  const projectId = useAppStore((s) => s.currentProjectId);
  const [suites, setSuites] = useState<Suite[]>([]);
  const [tests, setTests] = useState<Test[]>([]);
  const [name, setName] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [cronDrafts, setCronDrafts] = useState<Record<string, string>>({});
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null);
  const [suiteRuns, setSuiteRuns] = useState<Record<string, SuiteRun[]>>({});

  const refresh = (): void => {
    if (!projectId) return;
    api.get<Suite[]>(`/projects/${projectId}/suites`).then(setSuites);
    api.get<Test[]>(`/projects/${projectId}/tests`).then(setTests);
  };

  useEffect(refresh, [projectId]);

  const createSuite = async (): Promise<void> => {
    if (!projectId || !name.trim()) return;
    await api.post(`/projects/${projectId}/suites`, { name: name.trim() });
    setName('');
    refresh();
  };

  const addTest = async (suiteId: string, testId: string): Promise<void> => {
    if (!projectId || !testId) return;
    await api.post(`/projects/${projectId}/suites/${suiteId}/tests`, { testId });
    refresh();
  };

  const runSuite = async (suiteId: string): Promise<void> => {
    if (!projectId) return;
    await api.post(`/projects/${projectId}/suites/${suiteId}/run`);
    setMessage('Suite run started.');
    if (expandedHistory === suiteId) loadHistory(suiteId);
  };

  const setCron = async (suiteId: string): Promise<void> => {
    if (!projectId) return;
    const cronExpression = cronDrafts[suiteId]?.trim();
    if (!cronExpression) return;
    try {
      await api.post(`/projects/${projectId}/suites/${suiteId}/scheduler`, { cronExpression });
      setMessage('Schedule saved.');
      refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  };

  const disableCron = async (suiteId: string): Promise<void> => {
    if (!projectId) return;
    await api.delete(`/projects/${projectId}/suites/${suiteId}/scheduler`);
    refresh();
  };

  const loadHistory = (suiteId: string): void => {
    if (!projectId) return;
    api.get<SuiteRun[]>(`/projects/${projectId}/suites/${suiteId}/runs`).then((runs) =>
      setSuiteRuns((prev) => ({ ...prev, [suiteId]: runs })),
    );
  };

  const toggleHistory = (suiteId: string): void => {
    if (expandedHistory === suiteId) {
      setExpandedHistory(null);
      return;
    }
    setExpandedHistory(suiteId);
    loadHistory(suiteId);
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-ink">Suites</h1>
        <p className="text-muted text-sm mt-1">Group tests into a suite, run them together, and schedule them on a cron.</p>
      </div>

      <div className="bg-panel border border-border rounded-2xl shadow-card p-5 flex gap-2">
        <input
          className="flex-1 bg-surface border border-border rounded-xl px-3 py-2 text-sm"
          placeholder="New suite name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && createSuite()}
        />
        <button
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-brand-500 to-brand-400 text-white text-sm font-semibold"
          onClick={createSuite}
        >
          <Plus size={15} />
          Create Suite
        </button>
      </div>

      {message && <p className="text-sm text-brand-600">{message}</p>}

      {suites.map((suite) => (
        <div key={suite.id} className="bg-panel border border-border rounded-2xl shadow-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-ink">{suite.name}</h2>
            <div className="flex items-center gap-2">
              <button
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-muted"
                onClick={() => toggleHistory(suite.id)}
              >
                <History size={13} />
                Run history
                {expandedHistory === suite.id ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </button>
              <button
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-brand-500 to-brand-400 text-white text-xs font-semibold"
                onClick={() => runSuite(suite.id)}
              >
                <Play size={13} />
                Run Suite
              </button>
            </div>
          </div>

          <ul className="text-sm text-slate-600 mb-3 space-y-0.5">
            {suite.tests.map((t) => (
              <li key={t.testId}>• {t.test.name}</li>
            ))}
            {suite.tests.length === 0 && <li className="text-muted">No tests added yet.</li>}
          </ul>

          <select
            className="bg-surface border border-border rounded-lg px-3 py-1.5 text-sm mb-4"
            onChange={(e) => e.target.value && addTest(suite.id, e.target.value)}
            value=""
          >
            <option value="">+ Add test to suite</option>
            {tests.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          <div className="border-t border-border pt-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-ink mb-2">
              <Clock size={13} />
              Schedule (cron)
            </div>
            {suite.scheduler?.enabled ? (
              <div className="flex items-center justify-between bg-surface border border-border rounded-lg px-3 py-2">
                <span className="text-xs font-mono text-slate-600">{suite.scheduler.cronExpression}</span>
                <button className="text-xs text-red-500 font-medium" onClick={() => disableCron(suite.id)}>
                  Disable
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {CRON_PRESETS.map((preset) => (
                    <button
                      key={preset.value}
                      className="px-2.5 py-1 rounded-full border border-border text-xs text-slate-600 hover:bg-surface"
                      onClick={() => setCronDrafts((prev) => ({ ...prev, [suite.id]: preset.value }))}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    className="flex-1 bg-surface border border-border rounded-lg px-3 py-1.5 text-xs font-mono"
                    placeholder="Cron expression, e.g. 0 9 * * *"
                    value={cronDrafts[suite.id] ?? ''}
                    onChange={(e) => setCronDrafts((prev) => ({ ...prev, [suite.id]: e.target.value }))}
                  />
                  <button
                    className="px-3 py-1.5 rounded-lg bg-ink text-white text-xs font-semibold"
                    onClick={() => setCron(suite.id)}
                  >
                    Enable
                  </button>
                </div>
              </div>
            )}
          </div>

          {expandedHistory === suite.id && (
            <div className="border-t border-border pt-3 mt-3">
              <div className="text-xs font-semibold text-ink mb-2">Recent runs</div>
              {(suiteRuns[suite.id] ?? []).length === 0 ? (
                <p className="text-xs text-muted">No suite runs yet.</p>
              ) : (
                <div className="space-y-2">
                  {suiteRuns[suite.id]!.map((run) => (
                    <div key={run.id} className="bg-surface border border-border rounded-lg px-3 py-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-muted">{new Date(run.startedAt).toLocaleString()}</span>
                        <StatusBadge status={run.status} />
                      </div>
                      <div className="text-xs text-slate-600">
                        {run.runs.filter((r) => r.status === 'PASSED').length}/{run.runs.length} passed
                        {run.runs.some((r) => r.healEvents.length > 0) && (
                          <span className="ml-2 px-1.5 py-0.5 rounded-full bg-brand-50 text-brand-600">
                            {run.runs.reduce((sum, r) => sum + r.healEvents.length, 0)} healed
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
