import { useEffect, useState } from 'react';
import { Braces, Plus, Trash2, Eye, EyeOff } from 'lucide-react';
import { api } from '../api/client';
import { useAppStore } from '../store/appStore';
import type { Environment } from '../api/types';

export default function Variables(): JSX.Element {
  const projectId = useAppStore((s) => s.currentProjectId);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [newEnvName, setNewEnvName] = useState('');
  const [rows, setRows] = useState<Record<string, { key: string; value: string; isSecret: boolean }>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  const refresh = (): void => {
    if (!projectId) return;
    api.get<Environment[]>(`/projects/${projectId}/environments`).then(setEnvironments);
  };

  useEffect(refresh, [projectId]);

  const createEnv = async (): Promise<void> => {
    if (!projectId || !newEnvName.trim()) return;
    await api.post(`/projects/${projectId}/environments`, { name: newEnvName.trim() });
    setNewEnvName('');
    refresh();
  };

  const removeEnv = async (envId: string): Promise<void> => {
    if (!projectId) return;
    await api.delete(`/projects/${projectId}/environments/${envId}`);
    refresh();
  };

  const saveVariable = async (envId: string): Promise<void> => {
    if (!projectId) return;
    const row = rows[envId];
    if (!row?.key) return;
    await api.post(`/projects/${projectId}/environments/${envId}/variables`, row);
    setRows((prev) => ({ ...prev, [envId]: { key: '', value: '', isSecret: false } }));
    refresh();
  };

  const editVariable = (envId: string, key: string, value: string, isSecret: boolean): void => {
    setRows((prev) => ({ ...prev, [envId]: { key, value, isSecret } }));
  };

  const removeVariable = async (envId: string, key: string): Promise<void> => {
    if (!projectId) return;
    await api.delete(`/projects/${projectId}/environments/${envId}/variables/${encodeURIComponent(key)}`);
    refresh();
  };

  const toggleReveal = (id: string): void => setRevealed((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-ink">Variables</h1>
        <p className="text-muted text-sm mt-1">
          Environment-scoped key/value pairs. Attach an Environment to a test in its Advanced options, then
          reference a value anywhere in its steps or API config with <code>{'{{env.KEY}}'}</code>.
        </p>
      </div>

      <div className="bg-panel border border-border rounded-2xl shadow-card p-5 flex gap-2">
        <input
          className="flex-1 bg-surface border border-border rounded-xl px-3 py-2 text-sm"
          placeholder="New environment name (e.g. Staging)"
          value={newEnvName}
          onChange={(e) => setNewEnvName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && createEnv()}
        />
        <button
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-brand-500 to-brand-400 text-white text-sm font-semibold"
          onClick={createEnv}
        >
          <Plus size={15} />
          Create Environment
        </button>
      </div>

      {environments.length === 0 ? (
        <div className="bg-panel border border-border rounded-2xl p-8 text-center text-muted text-sm">No environments yet.</div>
      ) : (
        environments.map((env) => (
          <div key={env.id} className="bg-panel border border-border rounded-2xl shadow-card p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 font-semibold text-ink">
                <Braces size={16} className="text-brand-500" />
                {env.name}
                <span className="text-xs font-normal text-muted">({env.variables.length} variables)</span>
              </div>
              <button className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-red-500 hover:bg-red-50" onClick={() => removeEnv(env.id)}>
                <Trash2 size={14} />
              </button>
            </div>

            <div className="space-y-1.5 mb-3">
              {env.variables.map((v) => (
                <div key={v.id} className="flex items-center gap-2 bg-surface border border-border rounded-lg px-3 py-2 text-xs font-mono">
                  <span className="font-semibold text-ink shrink-0">{v.key}</span>
                  <span className="flex-1 truncate text-slate-600">{v.isSecret && !revealed[v.id] ? '••••••••' : v.value}</span>
                  {v.isSecret && (
                    <button className="text-muted shrink-0" onClick={() => toggleReveal(v.id)} title={revealed[v.id] ? 'Hide' : 'Reveal'}>
                      {revealed[v.id] ? <EyeOff size={12} /> : <Eye size={12} />}
                    </button>
                  )}
                  <button className="text-brand-600 shrink-0 font-sans" onClick={() => editVariable(env.id, v.key, v.value, v.isSecret)}>
                    Edit
                  </button>
                  <button className="text-red-500 shrink-0" onClick={() => removeVariable(env.id, v.key)}>
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
              {env.variables.length === 0 && <p className="text-xs text-muted">No variables yet.</p>}
            </div>

            <div className="flex gap-2 items-center">
              <input
                className="bg-surface border border-border rounded-lg px-2 py-1.5 text-xs w-32 font-mono"
                placeholder="KEY"
                value={rows[env.id]?.key ?? ''}
                onChange={(e) => setRows((prev) => ({ ...prev, [env.id]: { ...prev[env.id], key: e.target.value, value: prev[env.id]?.value ?? '', isSecret: prev[env.id]?.isSecret ?? false } }))}
              />
              <input
                className="bg-surface border border-border rounded-lg px-2 py-1.5 text-xs flex-1"
                placeholder="value"
                value={rows[env.id]?.value ?? ''}
                onChange={(e) => setRows((prev) => ({ ...prev, [env.id]: { ...prev[env.id], key: prev[env.id]?.key ?? '', value: e.target.value, isSecret: prev[env.id]?.isSecret ?? false } }))}
              />
              <label className="flex items-center gap-1 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={rows[env.id]?.isSecret ?? false}
                  onChange={(e) => setRows((prev) => ({ ...prev, [env.id]: { ...prev[env.id], key: prev[env.id]?.key ?? '', value: prev[env.id]?.value ?? '', isSecret: e.target.checked } }))}
                />
                Secret
              </label>
              <button
                className="px-3 py-1.5 rounded-lg bg-ink text-white text-xs font-medium"
                onClick={() => saveVariable(env.id)}
              >
                {env.variables.some((v) => v.key === rows[env.id]?.key) ? 'Save' : 'Add'}
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
