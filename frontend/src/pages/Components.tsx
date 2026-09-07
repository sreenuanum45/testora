import { useEffect, useState } from 'react';
import { Box, Trash2, Plus } from 'lucide-react';
import { api } from '../api/client';
import { useAppStore } from '../store/appStore';
import type { Component, Step } from '../api/types';
import StepBuilder from '../components/StepBuilder';

export default function Components(): JSX.Element {
  const projectId = useAppStore((s) => s.currentProjectId);
  const [components, setComponents] = useState<Component[]>([]);
  const [name, setName] = useState('');
  const [steps, setSteps] = useState<Step[]>([]);
  const [creating, setCreating] = useState(false);

  const refresh = (): void => {
    if (!projectId) return;
    api.get<Component[]>(`/projects/${projectId}/components`).then(setComponents);
  };

  useEffect(refresh, [projectId]);

  const create = async (): Promise<void> => {
    if (!projectId || !name.trim() || steps.length === 0) return;
    await api.post(`/projects/${projectId}/components`, { name: name.trim(), steps });
    setName('');
    setSteps([]);
    setCreating(false);
    refresh();
  };

  const remove = async (id: string): Promise<void> => {
    if (!projectId) return;
    await api.delete(`/projects/${projectId}/components/${id}`);
    refresh();
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-ink">Components</h1>
          <p className="text-muted text-sm mt-1">
            A named, reusable step-list (e.g. "Login") any test can insert via a <code>component</code> step,
            instead of re-recording the same flow every time.
          </p>
        </div>
        <button
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-brand-500 to-brand-400 text-white text-sm font-semibold shadow-card"
          onClick={() => setCreating((v) => !v)}
        >
          <Plus size={16} />
          New Component
        </button>
      </div>

      {creating && (
        <div className="bg-panel border border-border rounded-2xl shadow-card p-6 space-y-4">
          <input
            className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-sm"
            placeholder="Component name (e.g. Login)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <StepBuilder steps={steps} onChange={setSteps} />
          <button className="px-5 py-2.5 rounded-xl bg-ink text-white text-sm font-semibold" onClick={create}>
            Save Component
          </button>
        </div>
      )}

      <div className="space-y-3">
        {components.length === 0 ? (
          <div className="bg-panel border border-border rounded-2xl p-8 text-center text-muted text-sm">No components yet.</div>
        ) : (
          components.map((c) => (
            <div key={c.id} className="bg-panel border border-border rounded-2xl shadow-card p-5">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 font-semibold text-ink">
                  <Box size={16} className="text-brand-500" />
                  {c.name}
                  <span className="text-xs font-normal text-muted">({c.steps.length} steps)</span>
                </div>
                <button className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-red-500 hover:bg-red-50" onClick={() => remove(c.id)}>
                  <Trash2 size={14} />
                </button>
              </div>
              <pre className="bg-surface border border-border rounded-lg p-3 text-xs overflow-x-auto">
                {JSON.stringify(c.steps, null, 2)}
              </pre>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
