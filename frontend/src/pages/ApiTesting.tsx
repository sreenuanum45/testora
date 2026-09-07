import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, Save, Link2 } from 'lucide-react';
import { api } from '../api/client';
import { useAppStore } from '../store/appStore';
import type { HttpMethod, Test } from '../api/types';

interface ApiResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  durationMs: number;
}

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

export default function ApiTesting(): JSX.Element {
  const projectId = useAppStore((s) => s.currentProjectId);
  const navigate = useNavigate();
  const [method, setMethod] = useState<HttpMethod>('GET');
  const [url, setUrl] = useState('https://api.github.com/zen');
  const [headersText, setHeadersText] = useState('{}');
  const [bodyText, setBodyText] = useState('');
  const [response, setResponse] = useState<ApiResponse | null>(null);
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedHeaders = (): Record<string, string> => {
    try {
      return JSON.parse(headersText || '{}');
    } catch {
      return {};
    }
  };
  const parsedBody = (): unknown => {
    if (!bodyText.trim()) return undefined;
    try {
      return JSON.parse(bodyText);
    } catch {
      return bodyText;
    }
  };

  const send = async (): Promise<void> => {
    setSending(true);
    setError(null);
    try {
      const result = await api.post<ApiResponse>('/api-testing/send', { method, url, headers: parsedHeaders(), body: parsedBody() });
      setResponse(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  const saveAsTest = async (): Promise<void> => {
    if (!projectId) return;
    const name = window.prompt('Name this API test:', 'api-request');
    if (!name?.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const test = await api.post<Test>(`/projects/${projectId}/tests`, {
        name: name.trim(),
        category: 'SMOKE',
        type: 'API',
        apiMethod: method,
        apiEndpoint: url,
        apiHeaders: parsedHeaders(),
        apiBody: parsedBody(),
      });
      navigate(`/tests/${test.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-ink">API Testing</h1>
        <p className="text-muted text-sm mt-1">Send a one-off request to try an endpoint, or save it as a reusable API Test.</p>
      </div>

      <div className="bg-panel border border-border rounded-2xl shadow-card p-5 space-y-4">
        <div className="flex gap-2">
          <select
            className="bg-surface border border-border rounded-xl px-3 py-2 text-sm font-medium"
            value={method}
            onChange={(e) => setMethod(e.target.value as HttpMethod)}
          >
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <input
            className="flex-1 bg-surface border border-border rounded-xl px-3 py-2 text-sm font-mono"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button
            className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-gradient-to-r from-brand-500 to-brand-400 text-white text-sm font-semibold disabled:opacity-50"
            onClick={send}
            disabled={sending}
          >
            <Send size={14} />
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-muted mb-1">Headers (JSON)</label>
            <textarea
              className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-xs font-mono"
              rows={4}
              value={headersText}
              onChange={(e) => setHeadersText(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">Body</label>
            <textarea
              className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-xs font-mono"
              rows={4}
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
            />
          </div>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <button
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-border text-sm font-medium text-ink disabled:opacity-50"
          onClick={saveAsTest}
          disabled={saving || !projectId}
        >
          <Save size={14} />
          {saving ? 'Saving…' : 'Save as API Test'}
        </button>
      </div>

      {response && (
        <div className="bg-panel border border-border rounded-2xl shadow-card p-5">
          <div className="flex items-center gap-3 mb-3">
            <span className={`px-2 py-0.5 rounded-full text-xs ${response.status < 400 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
              {response.status} {response.statusText}
            </span>
            <span className="flex items-center gap-1 text-xs text-muted">
              <Link2 size={12} />
              {response.durationMs}ms
            </span>
          </div>
          <pre className="bg-surface border border-border rounded-lg p-3 text-xs overflow-x-auto max-h-80">{response.body}</pre>
        </div>
      )}
    </div>
  );
}
