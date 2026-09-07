import { useEffect, useState } from 'react';
import { User, Sparkles, Globe } from 'lucide-react';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';

interface LlmStatus {
  active: string | null;
  configuredCount: number;
  chain: string[];
}

export default function Settings(): JSX.Element {
  const user = useAuthStore((s) => s.user);
  const [llm, setLlm] = useState<LlmStatus | null>(null);

  useEffect(() => {
    api.get<LlmStatus>('/llm-status').then(setLlm);
  }, []);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-ink">Settings</h1>
        <p className="text-muted text-sm mt-1">Account and platform configuration.</p>
      </div>

      <div className="bg-panel border border-border rounded-2xl shadow-card p-5">
        <div className="flex items-center gap-2 text-xs uppercase text-muted mb-3">
          <User size={13} />
          Account
        </div>
        <p className="text-sm font-medium text-ink">{user?.name}</p>
        <p className="text-sm text-muted">{user?.email}</p>
      </div>

      <div className="bg-panel border border-border rounded-2xl shadow-card p-5">
        <div className="flex items-center gap-2 text-xs uppercase text-muted mb-3">
          <Sparkles size={13} />
          LLM provider (self-healing &amp; NLP)
        </div>
        {llm ? (
          <>
            <p className="text-sm mb-2">
              Active provider: <span className="font-semibold text-brand-600">{llm.active ?? 'None configured'}</span>
            </p>
            <p className="text-xs text-muted mb-3">
              Fallback order: {llm.chain.join(' → ')} ({llm.configuredCount}/{llm.chain.length} configured)
            </p>
            <p className="text-xs text-muted">
              Configure API keys via the backend's environment variables (GROQ_API_KEY, GEMINI_API_KEY,
              OPENROUTER_API_KEY, OPENAI_API_KEY) — see .env.example.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted">Loading...</p>
        )}
      </div>

      <div className="bg-panel border border-border rounded-2xl shadow-card p-5">
        <div className="flex items-center gap-2 text-xs uppercase text-muted mb-3">
          <Globe size={13} />
          Cross-browser execution
        </div>
        <p className="text-sm text-muted">
          Chromium, Firefox, and WebKit are all available — select one when running a test, or a suite will run
          each of its tests on whichever browser they were queued with.
        </p>
      </div>
    </div>
  );
}
