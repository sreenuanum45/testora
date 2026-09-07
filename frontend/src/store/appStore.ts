import { create } from 'zustand';
import type { Project, Environment } from '../api/types';

interface AppState {
  projects: Project[];
  currentProjectId: string | null;
  environments: Environment[];
  currentEnvironmentId: string | null;
  setProjects: (projects: Project[]) => void;
  setCurrentProject: (id: string) => void;
  setEnvironments: (environments: Environment[]) => void;
  setCurrentEnvironment: (id: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  projects: [],
  currentProjectId: localStorage.getItem('testora_project_id'),
  environments: [],
  currentEnvironmentId: localStorage.getItem('testora_env_id'),

  setProjects: (projects) => set({ projects }),
  setCurrentProject: (id) => {
    localStorage.setItem('testora_project_id', id);
    set({ currentProjectId: id });
  },
  setEnvironments: (environments) => set({ environments }),
  setCurrentEnvironment: (id) => {
    localStorage.setItem('testora_env_id', id);
    set({ currentEnvironmentId: id });
  },
}));
