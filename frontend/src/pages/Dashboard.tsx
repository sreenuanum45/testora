import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, FileText, Globe, Cloud, Box, Plus, Search, SlidersHorizontal, Play, Pencil, MoreHorizontal, ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react';
import { api } from '../api/client';
import { useAppStore } from '../store/appStore';
import type { Test } from '../api/types';

const PAGE_SIZE = 10;

export default function Dashboard(): JSX.Element {
  const projectId = useAppStore((s) => s.currentProjectId);
  const [tests, setTests] = useState<Test[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!projectId) return;
    api.get<Test[]>(`/projects/${projectId}/tests`).then(setTests);
  }, [projectId]);

  const today = new Date();
  const dateLabel = today.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const dayLabel = today.toLocaleDateString('en-US', { weekday: 'long' });

  const filtered = tests.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()));
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-ink">Dashboard</h1>
          <p className="text-muted text-sm mt-1">Overview of your test automation workspace</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-panel border border-border rounded-xl px-4 py-2.5 shadow-card">
            <CalendarDays size={16} className="text-brand-500" />
            <div className="leading-tight">
              <div className="text-sm font-semibold text-ink">{dateLabel}</div>
              <div className="text-xs text-muted">{dayLabel}</div>
            </div>
          </div>
          <Link
            to="/new-test"
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-brand-500 to-brand-400 text-white text-sm font-semibold shadow-card"
          >
            <Plus size={16} />
            New Test
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Tests" value={tests.length} icon={FileText} from="#8b5cf6" to="#6d28d9" tint="#f1edff" />
        <StatCard label="Web Tests" value={tests.filter((t) => t.type === 'WEB').length} icon={Globe} from="#10b981" to="#059669" tint="#e7fbf3" />
        <StatCard label="API Tests" value={tests.filter((t) => t.type === 'API').length} icon={Cloud} from="#f97316" to="#ea580c" tint="#fff1e6" />
        <StatCard label="Modules" value={new Set(tests.map((t) => t.moduleId).filter(Boolean)).size} icon={Box} from="#ec4899" to="#db2777" tint="#ffeef6" />
      </div>

      <div className="bg-panel border border-border rounded-2xl shadow-card overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center">
              <FileText size={18} className="text-brand-500" />
            </div>
            <div>
              <div className="font-semibold text-ink">Tests</div>
              <div className="text-xs text-muted">Manage and view all your tests</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              <input
                placeholder="Search tests..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="bg-surface border border-border rounded-xl pl-9 pr-3 py-2 text-sm w-56"
              />
            </div>
            <button className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-sm text-muted">
              <SlidersHorizontal size={14} />
              Filter
            </button>
          </div>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted uppercase border-b border-border">
              <th className="px-5 py-3 w-8">
                <input type="checkbox" className="rounded" />
              </th>
              <th className="px-2 py-3">Name</th>
              <th className="px-2 py-3">Module</th>
              <th className="px-2 py-3">Category</th>
              <th className="px-2 py-3">Type</th>
              <th className="px-2 py-3">Target</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-muted">
                  No tests yet — create your first one.
                </td>
              </tr>
            ) : (
              paged.map((t) => (
                <tr key={t.id} className="border-b border-border last:border-0 hover:bg-surface">
                  <td className="px-5 py-3">
                    <input type="checkbox" className="rounded" />
                  </td>
                  <td className="px-2 py-3">
                    <Link to={`/tests/${t.id}`} className="text-brand-600 font-medium hover:underline">
                      {t.name}
                    </Link>
                  </td>
                  <td className="px-2 py-3 text-muted">{t.module?.name ?? '—'}</td>
                  <td className="px-2 py-3">
                    <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-surface border border-border text-ink">{t.category}</span>
                  </td>
                  <td className="px-2 py-3">
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-medium ${t.type === 'WEB' ? 'bg-brand-50 text-brand-600' : 'bg-orange-50 text-orange-600'}`}
                    >
                      {t.type}
                    </span>
                  </td>
                  <td className="px-2 py-3 text-muted truncate max-w-xs">{t.targetUrl ?? t.apiEndpoint ?? '—'}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <button className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-emerald-600 hover:bg-emerald-50">
                        <Play size={14} />
                      </button>
                      <Link
                        to={`/tests/${t.id}`}
                        className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-brand-600 hover:bg-brand-50"
                      >
                        <Pencil size={14} />
                      </Link>
                      <button className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted hover:bg-surface">
                        <MoreHorizontal size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="flex items-center justify-between px-5 py-4 border-t border-border">
          <span className="text-xs text-muted">
            Showing {filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} tests
          </span>
          <div className="flex items-center gap-1.5">
            <button
              className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted disabled:opacity-40"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft size={14} />
            </button>
            <span className="w-8 h-8 rounded-lg bg-brand-500 text-white text-sm font-medium flex items-center justify-center">{page}</span>
            <button
              className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted disabled:opacity-40"
              disabled={page >= pageCount}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: number;
  icon: LucideIcon;
  from: string;
  to: string;
  tint: string;
}

function StatCard({ label, value, icon: Icon, from, to, tint }: StatCardProps): JSX.Element {
  const gradientId = `wave-${label.replace(/\s+/g, '-')}`;
  return (
    <div className="relative rounded-2xl border border-border overflow-hidden shadow-card" style={{ backgroundColor: tint }}>
      <div className="p-5 pb-8 relative z-10">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center mb-3 shadow-sm"
          style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
        >
          <Icon size={20} className="text-white" />
        </div>
        <div className="text-sm font-medium text-ink/70">{label}</div>
        <div className="text-3xl font-bold text-ink mt-0.5">{value}</div>
      </div>
      <svg className="absolute bottom-0 left-0 w-full h-10" viewBox="0 0 300 40" preserveAspectRatio="none">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={from} />
            <stop offset="100%" stopColor={to} />
          </linearGradient>
        </defs>
        <path d="M0,25 C60,5 120,35 180,18 C220,6 260,22 300,10 L300,40 L0,40 Z" fill={`url(#${gradientId})`} opacity="0.18" />
      </svg>
    </div>
  );
}
