import { X } from "lucide-react";
import LiveStepLog from "./LiveStepLog";
import type { RunStatus, Step } from "../api/types";

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
  onClose,
}: RunProgressPanelProps): JSX.Element {
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
