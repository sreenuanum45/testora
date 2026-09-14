import { useState } from "react";
import { X, Sparkles, Loader2 } from "lucide-react";
import LiveStepLog from "./LiveStepLog";
import { api } from "../api/client";
import { useAppStore } from "../store/appStore";
import type { FailureExplanation, RunStatus, Step } from "../api/types";

function StatusPill({ status }: { status: RunStatus }): JSX.Element {
  const colors: Record<RunStatus, string> = {
    PASSED: "bg-emerald-50 text-emerald-600",
    FAILED: "bg-red-50 text-red-600",
    RUNNING: "bg-amber-50 text-amber-600",
    QUEUED: "bg-slate-100 text-slate-600",
    SKIPPED: "bg-slate-100 text-slate-600",
  };
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status]}`}
    >
      {status}
    </span>
  );
}

interface RunProgressPanelProps {
  runId: string;
  runStatus: RunStatus;
  steps: Step[];
  testName: string;
  errorMessage?: string | null;
  onClose: () => void;
}

/** Docked side panel that shows a run's steps executing one by one in real time — auto-
 *  polls while the run is QUEUED/RUNNING and keeps showing the same log as a permanent
 *  record once it finishes. Rendered as a normal flex sibling next to the page content
 *  (see TestDetail.tsx) — NOT a `fixed`/`position: absolute` overlay — so it sits side by
 *  side with the rest of the page instead of floating on top of it. `sticky` keeps it in
 *  view while the (typically taller) main content column scrolls. */
export default function RunProgressPanel({
  runId,
  runStatus,
  steps,
  testName,
  errorMessage,
  onClose,
}: RunProgressPanelProps): JSX.Element {
  const projectId = useAppStore((s) => s.currentProjectId);
  const [explanation, setExplanation] = useState<FailureExplanation | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [explainError, setExplainError] = useState<string | null>(null);

  const requestExplanation = (): void => {
    if (!projectId || explaining) return;
    setExplaining(true);
    setExplainError(null);
    api
      .post<FailureExplanation>(`/projects/${projectId}/runs/${runId}/explain`)
      .then(setExplanation)
      .catch((err: Error) => setExplainError(err.message))
      .finally(() => setExplaining(false));
  };

  return (
    <div className="w-full max-w-md shrink-0 sticky top-6 bg-panel border border-border rounded-2xl shadow-card flex flex-col max-h-[calc(100vh-3rem)]">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
        <div>
          <div className="text-sm font-semibold text-ink truncate max-w-[280px]">
            {testName}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <StatusPill status={runStatus} />
            {(runStatus === "RUNNING" || runStatus === "QUEUED") && (
              <span className="text-xs text-muted animate-pulse">Live</span>
            )}
          </div>
        </div>
        <button
          className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted hover:bg-surface shrink-0"
          onClick={onClose}
        >
          <X size={15} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {/* The step log only ever shows a per-STEP failure — a run that dies from a
         *  whole-test timeout or a crash before any step's catch block runs leaves every
         *  step frozen at "running" with no red text anywhere, while the badge above says
         *  FAILED with no visible reason. Surface the run's own summarized error (always
         *  captured server-side — see execution.processor.ts's summarizePlaywrightOutput)
         *  directly, independent of whether a step event ever recorded one. */}
        {runStatus === "FAILED" && errorMessage && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3">
            <div className="text-xs font-semibold text-red-700 mb-1.5">
              Failure reason
            </div>
            <pre className="text-xs text-red-700 whitespace-pre-wrap break-words max-h-56 overflow-y-auto font-mono">
              {errorMessage}
            </pre>

            {!explanation && (
              <button
                onClick={requestExplanation}
                disabled={explaining}
                className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-red-200 text-red-700 text-xs font-semibold hover:bg-red-100 disabled:opacity-60"
              >
                {explaining ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                {explaining ? "Thinking…" : "Explain with AI"}
              </button>
            )}
            {explainError && <p className="mt-2 text-xs text-red-600">{explainError}</p>}
            {explanation && (
              <div className="mt-3 rounded-lg bg-white border border-red-200 p-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-brand-600 mb-1.5">
                  <Sparkles size={12} />
                  AI explanation
                </div>
                <p className="text-xs text-ink leading-relaxed">{explanation.summary}</p>
                <p className="text-[10px] text-muted mt-2">via {explanation.provider}</p>
              </div>
            )}
          </div>
        )}
        <LiveStepLog
          runId={runId}
          runStatus={runStatus}
          steps={steps}
          className="max-h-none"
        />
      </div>
    </div>
  );
}
