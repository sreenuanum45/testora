import { useEffect, useState } from 'react';
import { User, Sparkles, Globe, Bell } from 'lucide-react';
import { api } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { useAppStore } from '../store/appStore';
import type { Project } from '../api/types';

interface LlmStatus {
  active: string | null;
  configuredCount: number;
  chain: string[];
}

export default function Settings(): JSX.Element {
  const user = useAuthStore((s) => s.user);
  const projectId = useAppStore((s) => s.currentProjectId);
  const [llm, setLlm] = useState<LlmStatus | null>(null);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [savingWebhook, setSavingWebhook] = useState(false);
  const [webhookMessage, setWebhookMessage] = useState<string | null>(null);

  useEffect(() => {
    api.get<LlmStatus>('/llm-status').then(setLlm);
  }, []);

  useEffect(() => {
    if (!projectId) return;
    api.get<Project>(`/projects/${projectId}`).then((p) => setWebhookUrl(p.webhookUrl ?? ''));
  }, [projectId]);

  const saveWebhook = async (): Promise<void> => {
    if (!projectId) return;
    setSavingWebhook(true);
    setWebhookMessage(null);
    try {
      const updated = await api.put<Project>(`/projects/${projectId}`, { webhookUrl });
      setWebhookUrl(updated.webhookUrl ?? '');
      setWebhookMessage(updated.webhookUrl ? 'Saved.' : 'Webhook removed.');
    } catch (err) {
      setWebhookMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingWebhook(false);
    }
  };

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
          Browser execution
        </div>
        <p className="text-sm text-muted">
          Tests run on Chromium. Firefox and WebKit were dropped from the deployed image to keep it lightweight
          (~300MB vs. ~2.4GB for all three engines).
        </p>
      </div>

      <div className="bg-panel border border-border rounded-2xl shadow-card p-5">
        <div className="flex items-center gap-2 text-xs uppercase text-muted mb-3">
          <Bell size={13} />
          Notifications
        </div>
        {projectId ? (
          <>
            <p className="text-xs text-muted mb-3">
              A Slack-compatible webhook URL — posted to whenever a standalone run or a suite (for this project)
              finishes FAILED. Leave blank and save to remove it.
            </p>
            <div className="flex items-center gap-2">
              <input
                className="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-sm"
                placeholder="https://hooks.slack.com/services/…"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
              />
              <button
                className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium disabled:opacity-50"
                onClick={saveWebhook}
                disabled={savingWebhook}
              >
                {savingWebhook ? 'Saving…' : 'Save'}
              </button>
            </div>
            {webhookMessage && <p className="text-xs text-brand-600 mt-2">{webhookMessage}</p>}
          </>
        ) : (
          <p className="text-sm text-muted">Select a project to configure its failure notifications.</p>
        )}
      </div>
    </div>
  );
}
