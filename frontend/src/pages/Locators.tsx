import { useEffect, useState } from 'react';
import { Search, Pencil, Trash2, X } from 'lucide-react';
import { api } from '../api/client';
import { useAppStore } from '../store/appStore';
import type { Locator, Test } from '../api/types';

const STRATEGY_OPTIONS = ['TESTID', 'ROLE', 'LABEL', 'PLACEHOLDER', 'TEXT', 'CSS'] as const;

export default function Locators(): JSX.Element {
  const projectId = useAppStore((s) => s.currentProjectId);
  const [tests, setTests] = useState<Test[]>([]);
  const [selectedTestId, setSelectedTestId] = useState('');
  const [locators, setLocators] = useState<Locator[]>([]);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ strategy: string; value: string; roleName: string }>({ strategy: 'ROLE', value: '', roleName: '' });

  useEffect(() => {
    if (!projectId) return;
    api.get<Test[]>(`/projects/${projectId}/tests`).then((data) => {
      setTests(data);
      if (data.length > 0) setSelectedTestId((prev) => prev || data[0]!.id);
    });
  }, [projectId]);

  const refresh = (): void => {
    if (!projectId || !selectedTestId) return;
    api.get<Test & { locators: Locator[] }>(`/projects/${projectId}/tests/${selectedTestId}`).then((t) => setLocators(t.locators));
  };

  useEffect(refresh, [projectId, selectedTestId]);

  const startEdit = (loc: Locator): void => {
    setEditingKey(loc.key);
    setDraft({ strategy: loc.strategy, value: loc.value, roleName: loc.roleName ?? '' });
  };

  const saveEdit = async (key: string): Promise<void> => {
    if (!projectId || !selectedTestId) return;
    await api.put(`/projects/${projectId}/tests/${selectedTestId}/locators/${key}`, {
      strategy: draft.strategy,
      value: draft.value,
      roleName: draft.roleName || undefined,
    });
    setEditingKey(null);
    refresh();
  };

  const remove = async (key: string): Promise<void> => {
    if (!projectId || !selectedTestId) return;
    await api.delete(`/projects/${projectId}/tests/${selectedTestId}/locators/${key}`);
    refresh();
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-ink">Locators</h1>
        <p className="text-muted text-sm mt-1">
          Every interactive step gets a persistent locator record. Self-healing updates these in place when the
          primary selector breaks — that's what makes healing cumulative across runs instead of repeating the
          same repair every time. Edit or delete one here to hand-tune it directly.
        </p>
      </div>

      <select
        className="bg-panel border border-border rounded-xl px-3 py-2 text-sm shadow-card"
        value={selectedTestId}
        onChange={(e) => setSelectedTestId(e.target.value)}
      >
        {tests.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>

      <div className="bg-panel border border-border rounded-2xl shadow-card p-5">
        {locators.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-muted text-sm">
            <Search size={20} className="text-slate-300" />
            No locators yet — record or run this test to capture some.
          </div>
        ) : (
          <div className="space-y-2">
            {locators.map((l) => (
              <div key={l.key} className="flex items-center gap-2 bg-surface border border-border rounded-lg px-3 py-2 text-xs font-mono">
                <span className="text-muted shrink-0 w-16">{l.key}</span>
                {editingKey === l.key ? (
                  <>
                    <select
                      className="bg-panel border border-border rounded px-1.5 py-1"
                      value={draft.strategy}
                      onChange={(e) => setDraft({ ...draft, strategy: e.target.value })}
                    >
                      {STRATEGY_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <input
                      className="flex-1 bg-panel border border-border rounded px-1.5 py-1"
                      value={draft.value}
                      onChange={(e) => setDraft({ ...draft, value: e.target.value })}
                    />
                    <input
                      className="w-28 bg-panel border border-border rounded px-1.5 py-1"
                      placeholder="role name"
                      value={draft.roleName}
                      onChange={(e) => setDraft({ ...draft, roleName: e.target.value })}
                    />
                    <button className="text-brand-600 shrink-0" onClick={() => saveEdit(l.key)}>
                      Save
                    </button>
                    <button className="text-muted shrink-0" onClick={() => setEditingKey(null)}>
                      <X size={12} />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="px-2 py-0.5 rounded-full text-xs bg-brand-50 text-brand-600 shrink-0">{l.strategy}</span>
                    <span className="flex-1 truncate text-slate-600">
                      "{l.value}"{l.roleName ? ` name="${l.roleName}"` : ''}
                    </span>
                    <span className="text-muted shrink-0">{new Date(l.discoveredAt).toLocaleDateString()}</span>
                    <button className="text-muted shrink-0" onClick={() => startEdit(l)}>
                      <Pencil size={12} />
                    </button>
                    <button className="text-red-500 shrink-0" onClick={() => remove(l.key)}>
                      <Trash2 size={12} />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
