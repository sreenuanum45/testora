import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

export default function Login(): JSX.Element {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { login, register } = useAuthStore();
  const navigate = useNavigate();

  const submit = async (): Promise<void> => {
    setError(null);
    setBusy(true);
    try {
      if (mode === 'login') await login(email, password);
      else await register(email, password, name);
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-sm bg-panel border border-border rounded-xl p-8">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-fuchsia-500 flex items-center justify-center font-bold">T</div>
          <span className="text-lg font-semibold">Testora</span>
        </div>
        <h1 className="text-xl font-semibold mb-4">{mode === 'login' ? 'Sign in' : 'Create an account'}</h1>

        {mode === 'register' && (
          <input
            className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm mb-3"
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        )}
        <input
          className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm mb-3"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm mb-4"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
        <button
          className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-medium disabled:opacity-50"
          onClick={submit}
          disabled={busy}
        >
          {mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
        <button
          className="w-full mt-3 text-xs text-slate-400"
          onClick={() => setMode((m) => (m === 'login' ? 'register' : 'login'))}
        >
          {mode === 'login' ? "Don't have an account? Register" : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  );
}
