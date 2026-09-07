import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import {
  Play,
  Sparkles,
  Wand2,
  Trash2,
  Video,
  ScrollText,
  Pencil,
  X,
  Camera,
  Monitor,
  Activity,
} from "lucide-react";
import { api } from "../api/client";
import { useAppStore } from "../store/appStore";
import type {
  DataSet,
  Environment,
  Locator,
  Run,
  Step,
  Test,
} from "../api/types";
import StepBuilder from "../components/StepBuilder";
import RunProgressPanel from "../components/RunProgressPanel";

const STRATEGY_OPTIONS = [
  "TESTID",
  "ROLE",
  "LABEL",
  "PLACEHOLDER",
  "TEXT",
  "CSS",
] as const;

export default function TestDetail(): JSX.Element {
  const { testId } = useParams<{ testId: string }>();
  const [searchParams] = useSearchParams();
  const projectId = useAppStore((s) => s.currentProjectId);

  const [test, setTest] = useState<Test | null>(null);
  const [recording, setRecording] = useState(
    searchParams.get("recording") === "1",
  );
  const [elapsedMs, setElapsedMs] = useState(0);
  const [runs, setRuns] = useState<Run[]>([]);
  const [dataSets, setDataSets] = useState<DataSet[]>([]);
  const [exportedCode, setExportedCode] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [draftSteps, setDraftSteps] = useState<Step[]>([]);
  const [savingSteps, setSavingSteps] = useState(false);

  const [nlpText, setNlpText] = useState("");
  const [nlpMode, setNlpMode] = useState<"append" | "replace">("append");
  const [nlpBusy, setNlpBusy] = useState(false);

  const [editingLocatorKey, setEditingLocatorKey] = useState<string | null>(
    null,
  );
  const [locatorDraft, setLocatorDraft] = useState<{
    strategy: string;
    value: string;
    roleName: string;
  }>({
    strategy: "ROLE",
    value: "",
    roleName: "",
  });

  const [videoRunId, setVideoRunId] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [headed, setHeaded] = useState(false);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  const loadTest = (): void => {
    if (!projectId || !testId) return;
    api.get<Test>(`/projects/${projectId}/tests/${testId}`).then((t) => {
      setTest(t);
      setDraftSteps(t.steps ?? []);
    });
  };
  const loadRuns = (): void => {
    if (!projectId || !testId) return;
    api.get<Run[]>(`/projects/${projectId}/tests/${testId}/runs`).then(setRuns);
  };

  useEffect(loadTest, [projectId, testId]);
  useEffect(() => {
    if (!projectId) return;
    api
      .get<DataSet[]>(`/projects/${projectId}/data-sets`)
      .then((d) => setDataSets(d ?? []));
    api
      .get<Environment[]>(`/projects/${projectId}/environments`)
      .then((e) => setEnvironments(e ?? []));
  }, [projectId]);
  useEffect(() => {
    loadRuns();
    const interval = setInterval(loadRuns, 3000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, testId]);

  useEffect(() => {
    if (!recording || !projectId || !testId) return;
    const interval = setInterval(() => {
      api
        .get<{ recording: boolean; elapsedMs: number | null }>(
          `/projects/${projectId}/tests/${testId}/recording/status`,
        )
        .then((s) => {
          setElapsedMs(s.elapsedMs ?? 0);
          if (!s.recording) {
            setRecording(false);
            loadTest();
          }
        });
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording, projectId, testId]);

  const stopRecording = async (): Promise<void> => {
    if (!projectId || !testId) return;
    await api.post(`/projects/${projectId}/tests/${testId}/recording/stop`);
    setRecording(false);
    loadTest();
  };

  const needsWeb = test?.type === "WEB" || test?.type === "WEB_API";
  const needsApi = test?.type === "API" || test?.type === "WEB_API";

  const runTest = async (browser = "chromium"): Promise<void> => {
    if (!projectId || !testId) return;
    setMessage(null);
    try {
      const created = await api.post<Run[]>(
        `/projects/${projectId}/tests/${testId}/runs`,
        { browser, headed },
      );
      const mode = headed ? " (headed)" : "";
      setMessage(
        Array.isArray(created) && created.length > 1
          ? `${created.length} runs queued (one per data row) on ${browser}${mode}.`
          : `Run queued on ${browser}${mode}.`,
      );
      if (Array.isArray(created) && created.length > 0) {
        setExpandedRunId(created[0]!.id);
        // Show the panel instantly instead of waiting for the next 3s runs poll.
        setRuns((prev) => [
          ...created.map((r) => ({ ...r, healEvents: [] })),
          ...prev,
        ]);
      }
      loadRuns();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  };

  const exportCode = async (): Promise<void> => {
    if (!projectId || !testId) return;
    const result = await api.get<{ code: string }>(
      `/projects/${projectId}/tests/${testId}/export/playwright`,
    );
    setExportedCode(result.code);
  };

  const stepsDirty = test
    ? JSON.stringify(draftSteps) !== JSON.stringify(test.steps ?? [])
    : false;

  const saveSteps = async (): Promise<void> => {
    if (!projectId || !testId) return;
    setSavingSteps(true);
    try {
      const updated = await api.put<Test>(
        `/projects/${projectId}/tests/${testId}/steps`,
        { steps: draftSteps },
      );
      setTest(updated);
      setDraftSteps(updated.steps ?? []);
      setMessage("Steps saved.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingSteps(false);
    }
  };

  const discardStepChanges = (): void => {
    setDraftSteps(test?.steps ?? []);
  };

  const generateNlpSteps = async (): Promise<void> => {
    if (!projectId || !testId || !nlpText.trim()) return;
    setNlpBusy(true);
    setMessage(null);
    try {
      const result = await api.post<{
        steps: Step[];
        addedCount: number;
        provider: string;
        model: string;
      }>(`/projects/${projectId}/tests/${testId}/nlp-steps`, {
        text: nlpText,
        mode: nlpMode,
      });
      setDraftSteps(result.steps);
      setMessage(
        `Added ${result.addedCount} step(s) via ${result.provider}/${result.model} and saved.`,
      );
      setNlpText("");
      // Refresh the test record for its freshly-materialized locators WITHOUT touching
      // draftSteps a second time — draftSteps already holds the authoritative new list.
      const refreshed = await api.get<Test>(
        `/projects/${projectId}/tests/${testId}`,
      );
      setTest(refreshed);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setNlpBusy(false);
    }
  };

  const startEditLocator = (loc: Locator): void => {
    setEditingLocatorKey(loc.key);
    setLocatorDraft({
      strategy: loc.strategy,
      value: loc.value,
      roleName: loc.roleName ?? "",
    });
  };

  const saveLocator = async (key: string): Promise<void> => {
    if (!projectId || !testId) return;
    await api.put(`/projects/${projectId}/tests/${testId}/locators/${key}`, {
      strategy: locatorDraft.strategy,
      value: locatorDraft.value,
      roleName: locatorDraft.roleName || undefined,
    });
    setEditingLocatorKey(null);
    loadTest();
  };

  const deleteLocator = async (key: string): Promise<void> => {
    if (!projectId || !testId) return;
    await api.delete(`/projects/${projectId}/tests/${testId}/locators/${key}`);
    loadTest();
  };

  const openTrace = async (runId: string): Promise<void> => {
    if (!projectId) return;
    try {
      await api.post(`/projects/${projectId}/runs/${runId}/playback`);
      setMessage("Opened Playwright trace viewer on the server.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  };

  const openVideo = async (runId: string): Promise<void> => {
    if (!projectId) return;
    try {
      const blob = await api.getBlob(
        `/projects/${projectId}/runs/${runId}/video`,
      );
      setVideoUrl(URL.createObjectURL(blob));
      setVideoRunId(runId);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  };

  const closeVideo = (): void => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(null);
    setVideoRunId(null);
  };

  const openScreenshot = async (runId: string): Promise<void> => {
    if (!projectId) return;
    try {
      const blob = await api.getBlob(
        `/projects/${projectId}/runs/${runId}/screenshot`,
      );
      setScreenshotUrl(URL.createObjectURL(blob));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  };

  const closeScreenshot = (): void => {
    if (screenshotUrl) URL.revokeObjectURL(screenshotUrl);
    setScreenshotUrl(null);
  };

  if (!test) return <div className="text-muted">Loading...</div>;

  const dataSet = dataSets.find((d) => d.id === test.dataSetId);
  const environment = environments.find((e) => e.id === test.environmentId);

  return (
    <div className="flex gap-6 items-start">
      <div className="max-w-4xl w-full space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-ink">{test.name}</h1>
            <p className="text-sm text-muted mt-1">
              {test.type} · {test.category} ·{" "}
              {test.targetUrl ?? test.apiEndpoint}
            </p>
            <div className="flex gap-2 mt-2">
              {test.retries > 0 && (
                <span className="px-2 py-0.5 rounded-full text-xs bg-amber-50 text-amber-600 border border-amber-200">
                  Auto-retry ×{test.retries}
                </span>
              )}
              {dataSet && (
                <span className="px-2 py-0.5 rounded-full text-xs bg-brand-50 text-brand-600 border border-brand-100">
                  Data-driven: {dataSet.name} ({dataSet.rows.length} rows)
                </span>
              )}
              {environment && (
                <span className="px-2 py-0.5 rounded-full text-xs bg-indigo-50 text-indigo-600 border border-indigo-100">
                  Env: {environment.name} ({environment.variables.length} vars)
                </span>
              )}
              {needsWeb && test.viewportWidth && test.viewportHeight && (
                <span className="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-600 border border-slate-200">
                  {test.viewportWidth}×{test.viewportHeight}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {needsWeb && (
              <label
                className="flex items-center gap-1.5 text-xs text-muted mr-1"
                title="Launch a visible browser window for the next run"
              >
                <input
                  type="checkbox"
                  checked={headed}
                  onChange={(e) => setHeaded(e.target.checked)}
                />
                <Monitor size={13} />
                Headed
              </label>
            )}
            <button
              className="px-4 py-2 rounded-lg bg-panel border border-border text-sm shadow-card"
              onClick={exportCode}
            >
              Export as Playwright Code
            </button>
            {needsWeb && (
              <select
                className="bg-panel border border-border rounded-lg px-3 py-2 text-sm shadow-card"
                onChange={(e) => e.target.value && runTest(e.target.value)}
                value=""
              >
                <option value="">Run on...</option>
                <option value="chromium">Chromium</option>
                <option value="firefox">Firefox</option>
                <option value="webkit">WebKit</option>
              </select>
            )}
            {needsApi && !needsWeb && (
              <button
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-brand-500 to-brand-400 text-white text-sm font-semibold shadow-card"
                onClick={() => runTest()}
              >
                <Play size={14} />
                Run
              </button>
            )}
          </div>
        </div>

        {message && <p className="text-sm text-brand-600">{message}</p>}

        {recording && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center justify-between">
            <span className="text-sm text-emerald-700">
              ● Recording in progress — {(elapsedMs / 1000).toFixed(0)}s. A
              browser window is open on the server.
            </span>
            <button
              className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs"
              onClick={stopRecording}
            >
              Stop Recording
            </button>
          </div>
        )}

        <div className="bg-panel border border-border rounded-2xl shadow-card p-6">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={16} className="text-brand-500" />
            <h2 className="text-sm font-semibold text-ink">
              Describe steps in plain English
            </h2>
          </div>
          <textarea
            className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-sm"
            rows={3}
            placeholder={
              'Click the Sign In button\nType "alice@example.com" into the email field\nAssert that the Dashboard heading is visible'
            }
            value={nlpText}
            onChange={(e) => setNlpText(e.target.value)}
          />
          <div className="flex items-center justify-between mt-3">
            <div className="inline-flex rounded-lg border border-border overflow-hidden text-xs">
              <button
                className={`px-3 py-1.5 ${nlpMode === "append" ? "bg-ink text-white" : "bg-surface text-muted"}`}
                onClick={() => setNlpMode("append")}
              >
                Append
              </button>
              <button
                className={`px-3 py-1.5 ${nlpMode === "replace" ? "bg-ink text-white" : "bg-surface text-muted"}`}
                onClick={() => setNlpMode("replace")}
              >
                Replace all
              </button>
            </div>
            <button
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-brand-500 to-brand-400 text-white text-sm font-semibold disabled:opacity-50"
              onClick={generateNlpSteps}
              disabled={nlpBusy || !nlpText.trim()}
            >
              <Wand2 size={14} />
              {nlpBusy ? "Generating…" : "Generate steps"}
            </button>
          </div>
        </div>

        <div className="bg-panel border border-border rounded-2xl shadow-card p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-ink">
              Steps ({draftSteps.length})
            </h2>
            <div className="flex items-center gap-3">
              {stepsDirty && (
                <span className="text-xs text-amber-600">Unsaved changes</span>
              )}
              {stepsDirty && (
                <button
                  className="text-xs text-muted"
                  onClick={discardStepChanges}
                  disabled={savingSteps}
                >
                  Discard
                </button>
              )}
              <button
                className="flex items-center gap-1.5 text-xs font-medium text-white bg-brand-600 px-3 py-1.5 rounded-lg disabled:opacity-40"
                onClick={saveSteps}
                disabled={!stepsDirty || savingSteps}
              >
                <Pencil size={12} />
                {savingSteps ? "Saving…" : "Save steps"}
              </button>
            </div>
          </div>

          <StepBuilder steps={draftSteps} onChange={setDraftSteps} />
        </div>

        {test.locators && test.locators.length > 0 && (
          <div className="bg-panel border border-border rounded-2xl shadow-card p-6">
            <h2 className="text-sm font-semibold text-ink mb-3">
              Locators ({test.locators.length})
            </h2>
            <div className="space-y-2">
              {test.locators.map((loc) => (
                <div
                  key={loc.key}
                  className="flex items-center gap-2 bg-surface border border-border rounded-lg px-3 py-2 text-xs font-mono"
                >
                  <span className="text-muted shrink-0 w-16">{loc.key}</span>
                  {editingLocatorKey === loc.key ? (
                    <>
                      <select
                        className="bg-panel border border-border rounded px-1.5 py-1"
                        value={locatorDraft.strategy}
                        onChange={(e) =>
                          setLocatorDraft({
                            ...locatorDraft,
                            strategy: e.target.value,
                          })
                        }
                      >
                        {STRATEGY_OPTIONS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                      <input
                        className="flex-1 bg-panel border border-border rounded px-1.5 py-1"
                        value={locatorDraft.value}
                        onChange={(e) =>
                          setLocatorDraft({
                            ...locatorDraft,
                            value: e.target.value,
                          })
                        }
                      />
                      <input
                        className="w-28 bg-panel border border-border rounded px-1.5 py-1"
                        placeholder="role name"
                        value={locatorDraft.roleName}
                        onChange={(e) =>
                          setLocatorDraft({
                            ...locatorDraft,
                            roleName: e.target.value,
                          })
                        }
                      />
                      <button
                        className="text-brand-600 shrink-0"
                        onClick={() => saveLocator(loc.key)}
                      >
                        Save
                      </button>
                      <button
                        className="text-muted shrink-0"
                        onClick={() => setEditingLocatorKey(null)}
                      >
                        <X size={12} />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 truncate">
                        {loc.strategy}="{loc.value}"
                        {loc.roleName ? ` name="${loc.roleName}"` : ""}
                      </span>
                      <button
                        className="text-muted shrink-0"
                        onClick={() => startEditLocator(loc)}
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        className="text-red-500 shrink-0"
                        onClick={() => deleteLocator(loc.key)}
                      >
                        <Trash2 size={12} />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {exportedCode && (
          <div className="bg-panel border border-border rounded-2xl shadow-card p-6">
            <h2 className="text-sm font-semibold text-ink mb-3">
              Exported Playwright code
            </h2>
            <pre className="bg-surface border border-border rounded-lg p-3 text-xs overflow-x-auto">
              {exportedCode}
            </pre>
          </div>
        )}

        <div className="bg-panel border border-border rounded-2xl shadow-card p-6">
          <h2 className="text-sm font-semibold text-ink mb-3">Runs</h2>
          {runs.length === 0 ? (
            <p className="text-sm text-muted">No runs yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted border-b border-border">
                    <th className="py-2">Started</th>
                    <th className="py-2">Browser</th>
                    <th className="py-2">Data row</th>
                    <th className="py-2">Status</th>
                    <th className="py-2">Duration</th>
                    <th className="py-2">Heals</th>
                    <th className="py-2">Playback</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b border-border last:border-0 cursor-pointer hover:bg-surface"
                      onClick={() => setExpandedRunId(r.id)}
                    >
                      <td className="py-2 flex items-center gap-1.5">
                        <Activity size={13} className="text-brand-500" />
                        {new Date(r.startedAt).toLocaleString()}
                      </td>
                      <td className="py-2">{r.browser}</td>
                      <td className="py-2 text-xs text-muted">
                        {r.dataRowIndex !== null
                          ? `#${r.dataRowIndex + 1}`
                          : "—"}
                      </td>
                      <td className="py-2">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="py-2">
                        {r.durationMs
                          ? `${(r.durationMs / 1000).toFixed(1)}s`
                          : "—"}
                      </td>
                      <td className="py-2">
                        {r.healEvents.length > 0 ? (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-brand-50 text-brand-600">
                            {r.healEvents.length} healed
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-2" onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-2">
                          {r.tracePath && (
                            <button
                              className="flex items-center gap-1 text-xs text-brand-600"
                              onClick={() => openTrace(r.id)}
                              title="Open trace viewer"
                            >
                              <ScrollText size={12} />
                              Trace
                            </button>
                          )}
                          {r.videoPath && (
                            <button
                              className="flex items-center gap-1 text-xs text-brand-600"
                              onClick={() => openVideo(r.id)}
                              title="Play video"
                            >
                              <Video size={12} />
                              Video
                            </button>
                          )}
                          {r.screenshotPath && (
                            <button
                              className="flex items-center gap-1 text-xs text-brand-600"
                              onClick={() => openScreenshot(r.id)}
                              title="View failure screenshot"
                            >
                              <Camera size={12} />
                              Screenshot
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {videoRunId && videoUrl && (
          <div
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
            onClick={closeVideo}
          >
            <div
              className="bg-panel rounded-2xl p-4 max-w-3xl w-full mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-ink">
                  Run recording
                </h3>
                <button onClick={closeVideo} className="text-muted">
                  <X size={16} />
                </button>
              </div>
              <video
                src={videoUrl}
                controls
                autoPlay
                className="w-full rounded-lg"
              />
            </div>
          </div>
        )}

        {screenshotUrl && (
          <div
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
            onClick={closeScreenshot}
          >
            <div
              className="bg-panel rounded-2xl p-4 max-w-3xl w-full mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-ink">
                  Failure screenshot
                </h3>
                <button onClick={closeScreenshot} className="text-muted">
                  <X size={16} />
                </button>
              </div>
              <img
                src={screenshotUrl}
                alt="Failure screenshot"
                className="w-full rounded-lg border border-border"
              />
            </div>
          </div>
        )}
      </div>

      {expandedRunId &&
        (() => {
          const activeRun = runs.find((r) => r.id === expandedRunId);
          if (!activeRun) return null;
          return (
            <RunProgressPanel
              runId={activeRun.id}
              runStatus={activeRun.status}
              steps={test.steps ?? []}
              testName={test.name}
              onClose={() => setExpandedRunId(null)}
            />
          );
        })()}
    </div>
  );
}

function StatusBadge({ status }: { status: string }): JSX.Element {
  const colors: Record<string, string> = {
    PASSED: "bg-emerald-50 text-emerald-600",
    FAILED: "bg-red-50 text-red-600",
    RUNNING: "bg-amber-50 text-amber-600",
    QUEUED: "bg-slate-100 text-slate-600",
  };
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs ${colors[status] ?? colors.QUEUED}`}
    >
      {status}
    </span>
  );
}
