import { useEffect, useRef } from 'react';
import { Bell, ChevronDown, FolderOpen, Layers3, Search } from 'lucide-react';
import { api } from '../api/client';
import { useAppStore } from '../store/appStore';
import { useAuthStore } from '../store/authStore';
import type { Environment, Project } from '../api/types';

export default function Topbar(): JSX.Element {
  const { projects, currentProjectId, environments, currentEnvironmentId, setProjects, setCurrentProject, setEnvironments, setCurrentEnvironment } =
    useAppStore();
  const user = useAuthStore((s) => s.user);
  const initial = user?.name?.trim()?.[0]?.toUpperCase() ?? '?';

  // React.StrictMode double-invokes effects in dev, which fired this bootstrap logic
  // twice back-to-back — both saw an empty project list (the first request hadn't
  // resolved yet) and both tried to create "New_project", so the second POST hit the
  // (ownerId, name) unique constraint and surfaced as a 500. A ref-guard makes this
  // one-time bootstrap actually run once, which StrictMode's double-invoke doesn't
  // change (refs persist across the double call).
  const bootstrappingProject = useRef(false);
  const bootstrappingEnv = useRef<string | null>(null);

  useEffect(() => {
    if (bootstrappingProject.current) return;
    bootstrappingProject.current = true;
    api.get<Project[]>('/projects').then(async (data) => {
      // Matches the spec's stated defaults ("Projects" dropdown default: New_project) —
      // a brand-new account gets one created automatically rather than showing an
      // unusable dropdown with nothing in it and no way to add one.
      if (data.length === 0) {
        const created = await api.post<Project>('/projects', { name: 'New_project' });
        data = [created];
      }
      setProjects(data);
      // currentProjectId can be a stale id left over in localStorage (deleted project,
      // or a different account on this browser) — fall back to the first real project
      // rather than keep pointing at an id the backend will 404 on.
      const stillValid = currentProjectId && data.some((p) => p.id === currentProjectId);
      if (!stillValid && data.length > 0) setCurrentProject(data[0].id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!currentProjectId || bootstrappingEnv.current === currentProjectId) return;
    bootstrappingEnv.current = currentProjectId;
    api.get<Environment[]>(`/projects/${currentProjectId}/environments`).then(async (data) => {
      if (data.length === 0) {
        const created = await api.post<Environment>(`/projects/${currentProjectId}/environments`, { name: 'QA' });
        data = [created];
      }
      setEnvironments(data);
      const stillValid = currentEnvironmentId && data.some((e) => e.id === currentEnvironmentId);
      if (!stillValid && data.length > 0) setCurrentEnvironment(data[0].id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProjectId]);

  return (
    <header className="h-16 border-b border-border bg-panel flex items-center justify-between px-6 gap-4">
      <div className="flex items-center gap-3">
        <div className="relative">
          <FolderOpen size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <select
            className="appearance-none bg-surface border border-border rounded-xl pl-9 pr-8 py-2 text-sm font-medium text-ink cursor-pointer"
            value={currentProjectId ?? ''}
            onChange={(e) => setCurrentProject(e.target.value)}
          >
            {projects.length === 0 && <option value="">New_project</option>}
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
        </div>

        <div className="relative">
          <Layers3 size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <select
            className="appearance-none bg-surface border border-border rounded-xl pl-9 pr-8 py-2 text-sm font-medium text-ink cursor-pointer"
            value={currentEnvironmentId ?? ''}
            onChange={(e) => setCurrentEnvironment(e.target.value)}
          >
            {environments.length === 0 && <option value="">QA</option>}
            {environments.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
        </div>
      </div>

      <div className="flex items-center gap-3 flex-1 max-w-md">
        <div className="relative w-full">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input
            readOnly
            placeholder="Search tests, suites, components..."
            onClick={() => window.dispatchEvent(new CustomEvent('open-command-palette'))}
            className="w-full bg-surface border border-border rounded-xl pl-10 pr-16 py-2 text-sm text-ink placeholder:text-muted cursor-pointer"
          />
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted border border-border rounded px-1.5 py-0.5 pointer-events-none">
            Ctrl K
          </kbd>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button className="relative w-9 h-9 rounded-full bg-surface border border-border flex items-center justify-center text-muted hover:text-ink">
          <Bell size={16} />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-red-500" />
        </button>
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-500 to-brand-400 flex items-center justify-center text-white text-sm font-semibold">
          {initial}
        </div>
      </div>
    </header>
  );
}
