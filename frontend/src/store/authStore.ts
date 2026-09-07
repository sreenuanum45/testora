import { create } from 'zustand';
import { api } from '../api/client';
import type { User } from '../api/types';

interface AuthState {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: JSON.parse(localStorage.getItem('testora_user') ?? 'null'),
  token: localStorage.getItem('testora_token'),

  login: async (email, password) => {
    const result = await api.post<{ token: string; user: User }>('/auth/login', { email, password });
    localStorage.setItem('testora_token', result.token);
    localStorage.setItem('testora_user', JSON.stringify(result.user));
    set({ token: result.token, user: result.user });
  },

  register: async (email, password, name) => {
    const result = await api.post<{ token: string; user: User }>('/auth/register', { email, password, name });
    localStorage.setItem('testora_token', result.token);
    localStorage.setItem('testora_user', JSON.stringify(result.user));
    set({ token: result.token, user: result.user });
  },

  logout: () => {
    localStorage.removeItem('testora_token');
    localStorage.removeItem('testora_user');
    set({ token: null, user: null });
  },
}));
