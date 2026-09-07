import { Fragment, useEffect, useMemo, useState } from 'react';
import { BarChart3, Filter, ChevronDown, ChevronRight } from 'lucide-react';
import { api } from '../api/client';
import { useAppStore } from '../store/appStore';
import type { Run, RunStatus, Test } from '../api/types';
import LiveStepLog from '../components/LiveStepLog';

interface RunWithTest extends Run {
  testName: string;
  testId: string;
}

const STATUS_FILTERS: Array<RunStatus | 'ALL'> = ['ALL', 'PASSED', 'FAILED', 'RUNNING', 'QUEUED'];

export default function Reports(): JSX.Element {
  const projectId = useAppStore((s) => s.currentProjectId);
  const [tests, setTests] = useState<Test[]>([]);
  const [runs, setRuns] = useState<RunWithTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<RunStatus | 'ALL'>('ALL');
  const [testFilter, setTestFilter] = useState('');
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    api.get<Test[]>(`/projects/${projectId}/tests`).then(async (allTests) => {
      setTests(allTests);
      const perTest = await Promise.all(
        allTests.map((t) =>
          api.get<Run[]>(`/projects/${projectId}/tests/${t.id}/runs`).then((runs) => runs.map((r) => ({ ...r, testName: t.name, testId: t.id }))),
        ),
      );
      const all = perTest.flat().sort((a, b) => b.startedAt.localeCompare(a.startedAt));
      setRuns(all);
      setLoading(false);
    });
  }, [projectId]);

  const filtered = useMemo(
    () =>
      runs.filter((r) => (statusFilter === 'ALL' || r.status === statusFilter) && (!testFilter || r.testId === testFilter)),
    [runs, statusFilter, testFilter],
  );

  const testsById = useMemo(() => Object.fromEntries(tests.map((t) => [t.id, t])), [tests]);

  const passed = filtered.filter((r) => r.status === 'PASSED').length;
  const failed = filtered.filter((r) => r.status === 'FAILED').length;
  const totalHeals = filtered.reduce((sum, r) => sum + r.healEvents.length, 0);
  const passRate = filtered.length > 0 ? Math.round((passed / filtered.length) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-ink">Reports</h1>
        <p className="text-muted text-sm mt-1">Every run across every test in this project, in one place.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Stat label="Total runs" value={filtered.length} />
        <Stat label="Passed" value={passed} color="text-emerald-600" />
        <Stat label="Failed" value={failed} color="text-red-600" />
        <Stat label="Pass rate" value={`${passRate}%`} color="text-brand-600" />
        <Stat label="Self-heals" value={totalHeals} color="text-indigo-600" />
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs text-muted">
          <Filter size={13} />
          Filter:
        </div>
        <select
          className="bg-panel border border-border rounded-lg px-3 py-1.5 text-sm shadow-card"
          value={testFilter}
          onChange={(e) => setTestFilter(e.target.value)}
        >
          <option value="">All tests</option>
          {tests.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <div className="inline-flex rounded-lg border border-border overflow-hidden text-xs bg-panel shadow-card">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              className={`px-3 py-1.5 ${statusFilter === s ? 'bg-ink text-white' : 'text-muted'}`}
              onClick={() => setStatusFilter(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-panel border border-border rounded-2xl shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted border-b border-border">
                <th className="px-4 py-3 w-6"></th>
                <th className="px-4 py-3">Test</th>
                <th className="px-4 py-3">Started</th>
                <th className="px-4 py-3">Browser</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Duration</th>
                <th className="px-4 py-3">Heals</th>
                <th className="px-4 py-3">Error</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted">
                    Loading...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted">
                    No runs match this filter.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => {
                  const expanded = expandedRunId === r.id;
                  return (
                    <Fragment key={r.id}>
                      <tr
                        className="border-b border-border last:border-0 cursor-pointer hover:bg-surface"
                        onClick={() => setExpandedRunId(expanded ? null : r.id)}
                      >
                        <td className="px-4 py-2 text-muted">{expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                        <td className="px-4 py-2 text-ink font-medium">{r.testName}</td>
                        <td className="px-4 py-2 text-muted">{new Date(r.startedAt).toLocaleString()}</td>
                        <td className="px-4 py-2 text-muted">{r.browser}</td>
                        <td className="px-4 py-2">
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs ${
                              r.status === 'PASSED'
                                ? 'bg-emerald-50 text-emerald-600'
                                : r.status === 'FAILED'
                                  ? 'bg-red-50 text-red-600'
                                  : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {r.status}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-muted">{r.durationMs ? `${(r.durationMs / 1000).toFixed(1)}s` : '—'}</td>
                        <td className="px-4 py-2 text-muted">
                          {r.healEvents.length > 0 ? (
                            <span className="px-2 py-0.5 rounded-full text-xs bg-brand-50 text-brand-600">{r.healEvents.length}</span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-4 py-2 text-red-500 truncate max-w-xs">{r.errorMessage ?? ''}</td>
                      </tr>
                      {expanded && (
                        <tr className="border-b border-border last:border-0">
                          <td colSpan={8} className="bg-surface/50 px-4 py-3">
                            <LiveStepLog runId={r.id} runStatus={r.status} steps={testsById[r.testId]?.steps ?? []} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number | string; color?: string }): JSX.Element {
  return (
    <div className="bg-panel border border-border rounded-2xl shadow-card p-4">
      <div className="flex items-center gap-1.5 text-muted mb-1">
        <BarChart3 size={13} />
        <span className="text-xs uppercase">{label}</span>
      </div>
      <div className={`text-2xl font-bold ${color ?? 'text-ink'}`}>{value}</div>
    </div>
  );
}
