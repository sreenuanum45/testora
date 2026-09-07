import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { api } from '../api/client';
import { useAppStore } from '../store/appStore';
import type { DataSet, Environment, HttpMethod, Test, TestCategory, TestModule, TestType } from '../api/types';

const CATEGORIES: TestCategory[] = ['SMOKE', 'REGRESSION', 'SANITY', 'E2E'];
const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

export default function NewTest(): JSX.Element {
  const projectId = useAppStore((s) => s.currentProjectId);
  const navigate = useNavigate();

  const [modules, setModules] = useState<TestModule[]>([]);
  const [name, setName] = useState('');
  const [moduleId, setModuleId] = useState('');
  const [category, setCategory] = useState<TestCategory | ''>('');
  const [type, setType] = useState<TestType>('WEB');
  const [targetUrl, setTargetUrl] = useState('');
  const [recordInIncognito, setRecordInIncognito] = useState(true);

  const [apiMethod, setApiMethod] = useState<HttpMethod>('GET');
  const [headerRows, setHeaderRows] = useState<Array<{ key: string; value: string }>>([{ key: '', value: '' }]);
  const [bodyMode, setBodyMode] = useState<'JSON' | 'FORM' | 'RAW'>('JSON');
  const [bodyText, setBodyText] = useState('');
  const [apiEndpointForCombined, setApiEndpointForCombined] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [newModuleName, setNewModuleName] = useState('');
  const [retries, setRetries] = useState(0);
  const [dataSetId, setDataSetId] = useState('');
  const [dataSets, setDataSets] = useState<DataSet[]>([]);
  const [environmentId, setEnvironmentId] = useState('');
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [viewportWidth, setViewportWidth] = useState('');
  const [viewportHeight, setViewportHeight] = useState('');
  const [userAgent, setUserAgent] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    api.get<TestModule[]>(`/projects/${projectId}/test-modules`).then(setModules);
    api.get<DataSet[]>(`/projects/${projectId}/data-sets`).then((data) => setDataSets(data ?? []));
    api.get<Environment[]>(`/projects/${projectId}/environments`).then((data) => setEnvironments(data ?? []));
  }, [projectId]);

  const needsWeb = type === 'WEB' || type === 'WEB_API';
  const needsApi = type === 'API' || type === 'WEB_API';
  const urlValid = /^https?:\/\//.test(targetUrl);

  const createModule = async (): Promise<void> => {
    if (!projectId || !newModuleName.trim()) return;
    const created = await api.post<TestModule>(`/projects/${projectId}/test-modules`, { name: newModuleName.trim() });
    setModules((prev) => [...prev, created]);
    setModuleId(created.id);
    setNewModuleName('');
  };

  const buildPayload = () => {
    const headers = Object.fromEntries(headerRows.filter((r) => r.key.trim()).map((r) => [r.key, r.value]));
    let body: unknown;
    if (bodyMode === 'JSON' && bodyText.trim()) {
      try {
        body = JSON.parse(bodyText);
      } catch {
        body = bodyText;
      }
    } else if (bodyText.trim()) {
      body = bodyText;
    }

    return {
      name,
      moduleId: moduleId || undefined,
      category,
      type,
      targetUrl: needsWeb ? targetUrl : undefined,
      recordInIncognito,
      apiMethod: needsApi ? apiMethod : undefined,
      apiEndpoint: needsApi ? (type === 'WEB_API' ? apiEndpointForCombined || targetUrl : targetUrl) : undefined,
      apiHeaders: needsApi ? headers : undefined,
      apiBody: needsApi ? body : undefined,
      retries,
      dataSetId: dataSetId || undefined,
      environmentId: environmentId || undefined,
      viewportWidth: needsWeb && viewportWidth ? Number(viewportWidth) : undefined,
      viewportHeight: needsWeb && viewportHeight ? Number(viewportHeight) : undefined,
      userAgent: needsWeb && userAgent.trim() ? userAgent.trim() : undefined,
    };
  };

  const validate = (): string | null => {
    if (!name.trim()) return 'Test name is required';
    if (!category) return 'Test category is required';
    if (needsWeb && !targetUrl.trim()) return 'Test URL is required';
    if (needsWeb && !urlValid) return "Test URL must start with 'http://' or 'https://'";
    if (needsApi && type === 'API' && !targetUrl.trim()) return 'API endpoint is required';
    if (needsApi && type === 'WEB_API' && !apiEndpointForCombined.trim()) return 'API endpoint is required for the combined Functional + API check';
    return null;
  };

  const saveTest = async (): Promise<Test | null> => {
    if (!projectId) {
      setError('Select a project first');
      return null;
    }
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return null;
    }
    setError(null);
    setSaving(true);
    try {
      const test = await api.post<Test>(`/projects/${projectId}/tests`, buildPayload());
      return test;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTest = async (): Promise<void> => {
    const test = await saveTest();
    if (test) navigate(`/tests/${test.id}`);
  };

  const handleStartRecording = async (): Promise<void> => {
    const test = await saveTest();
    if (!test || !projectId) return;
    try {
      await api.post(`/projects/${projectId}/tests/${test.id}/recording/start`);
      navigate(`/tests/${test.id}?recording=1`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold mb-6">New Test</h1>

      <div className="space-y-5 bg-panel border border-border rounded-xl p-6">
        <div>
          <label className="block text-sm font-medium mb-1.5">New Test Name*</label>
          <input
            className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm"
            placeholder="login"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">Test Module*</label>
          <div className="flex gap-2">
            <select
              className="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-sm"
              value={moduleId}
              onChange={(e) => setModuleId(e.target.value)}
            >
              <option value="">Select Test Module</option>
              {modules.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <input
              className="w-40 bg-surface border border-border rounded-lg px-3 py-2 text-sm"
              placeholder="+ new module"
              value={newModuleName}
              onChange={(e) => setNewModuleName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createModule()}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">Test Category*</label>
          <select
            className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm"
            value={category}
            onChange={(e) => setCategory(e.target.value as TestCategory)}
          >
            <option value="">Select Test Category</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">Test Type</label>
          <div className="inline-flex rounded-lg border border-border overflow-hidden">
            <button
              className={`px-5 py-2 text-sm ${type === 'WEB' ? 'bg-indigo-600 text-white' : 'bg-surface text-slate-400'}`}
              onClick={() => setType('WEB')}
            >
              Web
            </button>
            <button
              className={`px-5 py-2 text-sm ${type === 'API' ? 'bg-indigo-600 text-white' : 'bg-surface text-slate-400'}`}
              onClick={() => setType('API')}
            >
              API
            </button>
            <button
              className={`px-5 py-2 text-sm ${type === 'WEB_API' ? 'bg-indigo-600 text-white' : 'bg-surface text-slate-400'}`}
              onClick={() => setType('WEB_API')}
            >
              Both
            </button>
          </div>
          {type === 'WEB_API' && (
            <p className="text-xs text-slate-500 mt-1">Runs the recorded web flow and an API check together — both must pass.</p>
          )}
        </div>

        {needsWeb && (
          <div>
            <label className="block text-sm font-medium mb-1.5">Test URL*</label>
            <input
              className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm"
              placeholder="Enter Test URL"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
            />
            <p className="text-xs text-slate-500 mt-1">Tip: Ensure the URL starts with 'http://' or 'https://'.</p>
          </div>
        )}

        {needsApi && (
          <>
            <div>
              <label className="block text-sm font-medium mb-1.5">Method</label>
              <select
                className="bg-surface border border-border rounded-lg px-3 py-2 text-sm"
                value={apiMethod}
                onChange={(e) => setApiMethod(e.target.value as HttpMethod)}
              >
                {METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">API Endpoint*</label>
              <input
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm"
                placeholder="https://api.example.com/v1/resource"
                value={type === 'WEB_API' ? apiEndpointForCombined : targetUrl}
                onChange={(e) => (type === 'WEB_API' ? setApiEndpointForCombined(e.target.value) : setTargetUrl(e.target.value))}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">Headers</label>
              {headerRows.map((row, i) => (
                <div key={i} className="flex gap-2 mb-2">
                  <input
                    className="flex-1 bg-surface border border-border rounded-lg px-3 py-1.5 text-sm"
                    placeholder="Key"
                    value={row.key}
                    onChange={(e) => setHeaderRows((rows) => rows.map((r, idx) => (idx === i ? { ...r, key: e.target.value } : r)))}
                  />
                  <input
                    className="flex-1 bg-surface border border-border rounded-lg px-3 py-1.5 text-sm"
                    placeholder="Value"
                    value={row.value}
                    onChange={(e) => setHeaderRows((rows) => rows.map((r, idx) => (idx === i ? { ...r, value: e.target.value } : r)))}
                  />
                </div>
              ))}
              <button className="text-xs text-indigo-400" onClick={() => setHeaderRows((rows) => [...rows, { key: '', value: '' }])}>
                + Add header
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">Body</label>
              <div className="flex gap-2 mb-2">
                {(['JSON', 'FORM', 'RAW'] as const).map((mode) => (
                  <button
                    key={mode}
                    className={`px-3 py-1 rounded text-xs ${bodyMode === mode ? 'bg-indigo-600 text-white' : 'bg-surface text-slate-400 border border-border'}`}
                    onClick={() => setBodyMode(mode)}
                  >
                    {mode === 'JSON' ? 'JSON' : mode === 'FORM' ? 'Form-data' : 'Raw Text'}
                  </button>
                ))}
              </div>
              <textarea
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm font-mono"
                rows={5}
                placeholder={bodyMode === 'JSON' ? '{ "key": "value" }' : ''}
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
              />
            </div>
          </>
        )}

        {needsWeb && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={recordInIncognito} onChange={(e) => setRecordInIncognito(e.target.checked)} />
            Record Test in Incognito
          </label>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Auto-Retry on failure</label>
            <input
              type="number"
              min={0}
              max={5}
              className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm"
              value={retries}
              onChange={(e) => setRetries(Math.max(0, Math.min(5, Number(e.target.value) || 0)))}
            />
            <p className="text-xs text-slate-500 mt-1">Re-runs a failed test up to this many times before marking it FAILED.</p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Data Set (Data-Driven)</label>
            <select
              className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm"
              value={dataSetId}
              onChange={(e) => setDataSetId(e.target.value)}
            >
              <option value="">None</option>
              {dataSets.map((ds) => (
                <option key={ds.id} value={ds.id}>
                  {ds.name} ({ds.rows.length} rows)
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500 mt-1">Runs once per row, substituting {'{{columnName}}'} in steps.</p>
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <button
            type="button"
            className="flex items-center gap-1.5 text-sm font-medium text-slate-600"
            onClick={() => setAdvancedOpen((v) => !v)}
          >
            {advancedOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            Advanced options
          </button>

          {advancedOpen && (
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">Environment (Variables)</label>
                <select
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm"
                  value={environmentId}
                  onChange={(e) => setEnvironmentId(e.target.value)}
                >
                  <option value="">None</option>
                  {environments.map((env) => (
                    <option key={env.id} value={env.id}>
                      {env.name} ({env.variables.length} variables)
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 mt-1">
                  Lets steps and API config reference {'{{env.KEY}}'} placeholders resolved from this Environment's Variables.
                </p>
              </div>

              {needsWeb && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1.5">Viewport width (px)</label>
                      <input
                        type="number"
                        className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm"
                        placeholder="1280"
                        value={viewportWidth}
                        onChange={(e) => setViewportWidth(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5">Viewport height (px)</label>
                      <input
                        type="number"
                        className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm"
                        placeholder="720"
                        value={viewportHeight}
                        onChange={(e) => setViewportHeight(e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Custom User Agent</label>
                    <input
                      className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm"
                      placeholder="Leave blank to use the browser's default"
                      value={userAgent}
                      onChange={(e) => setUserAgent(e.target.value)}
                    />
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex gap-3 pt-2">
          <button
            className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-medium disabled:opacity-50"
            onClick={handleSaveTest}
            disabled={saving}
          >
            Save Test
          </button>
          {needsWeb && (
            <button
              className="px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm font-medium disabled:opacity-50"
              onClick={handleStartRecording}
              disabled={saving}
            >
              Start Recording
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
