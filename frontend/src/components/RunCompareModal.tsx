import { X, ArrowRight, Check, XCircle, MinusCircle } from 'lucide-react';
import type { RunCompareResult, Step } from '../api/types';
import { describeStep } from './LiveStepLog';

function StepStatusChip({ status }: { status: string | null }): JSX.Element {
  if (status === 'passed') return <Check size={13} className="text-emerald-500" />;
  if (status === 'failed') return <XCircle size={13} className="text-red-500" />;
  if (!status) return <MinusCircle size={13} className="text-slate-300" />;
  return <span className="text-xs text-muted">{status}</span>;
}

interface RunCompareModalProps {
  result: RunCompareResult;
  steps: Step[];
  onClose: () => void;
}

/** Side-by-side diff of two runs of the same test — answers "why did this start failing
 *  after run #47" directly instead of making someone eyeball two separate step logs. */
export default function RunCompareModal({ result, steps, onClose }: RunCompareModalProps): JSX.Element {
  const { runA, runB, durationDeltaMs, stepDiff, healsOnlyInA, healsOnlyInB } = result;
  const changedCount = stepDiff.filter((s) => s.changed).length;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-6" onClick={onClose}>
      <div
        className="bg-panel border border-border rounded-2xl shadow-card w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h2 className="text-sm font-semibold text-ink">Run comparison</h2>
          <button className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted hover:bg-surface" onClick={onClose}>
            <X size={15} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5">
          <div className="grid grid-cols-2 gap-3">
            {[runA, runB].map((r, i) => (
              <div key={r.id} className="rounded-xl border border-border p-3">
                <div className="text-xs text-muted mb-1">Run {i === 0 ? 'A' : 'B'}</div>
                <div className="text-sm font-medium text-ink">{new Date(r.startedAt).toLocaleString()}</div>
                <div className="flex items-center gap-2 mt-1.5 text-xs">
                  <span
                    className={`px-2 py-0.5 rounded-full font-medium ${
                      r.status === 'PASSED' ? 'bg-emerald-50 text-emerald-600' : r.status === 'FAILED' ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {r.status}
                  </span>
                  <span className="text-muted">{r.browser}</span>
                  <span className="text-muted">{r.durationMs ? `${(r.durationMs / 1000).toFixed(1)}s` : '—'}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-4 text-xs text-muted">
            <span>
              Duration delta:{' '}
              <span className={durationDeltaMs > 0 ? 'text-amber-600 font-medium' : durationDeltaMs < 0 ? 'text-emerald-600 font-medium' : ''}>
                {durationDeltaMs > 0 ? '+' : ''}
                {(durationDeltaMs / 1000).toFixed(1)}s
              </span>
            </span>
            <span>
              {changedCount} step{changedCount === 1 ? '' : 's'} changed
            </span>
          </div>

          <div>
            <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Step-by-step</div>
            <div className="space-y-1">
              {stepDiff.map((s) => (
                <div
                  key={s.index}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-xs ${
                    s.changed ? 'bg-amber-50 border border-amber-200' : 'bg-surface border border-border'
                  }`}
                >
                  <span className="text-muted w-5 shrink-0">{s.index + 1}.</span>
                  <span className="flex-1 truncate text-ink">{describeStep(steps[s.index], s.index)}</span>
                  <StepStatusChip status={s.statusA} />
                  <ArrowRight size={12} className="text-muted shrink-0" />
                  <StepStatusChip status={s.statusB} />
                </div>
              ))}
            </div>
          </div>

          {(healsOnlyInA.length > 0 || healsOnlyInB.length > 0) && (
            <div>
              <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Heal differences</div>
              <div className="space-y-1.5">
                {healsOnlyInA.map((h) => (
                  <div key={h.id} className="text-xs px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700">
                    Only in Run A: healed {h.locatorKey} ({h.oldValue} → {h.newValue})
                  </div>
                ))}
                {healsOnlyInB.map((h) => (
                  <div key={h.id} className="text-xs px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700">
                    Only in Run B: healed {h.locatorKey} ({h.oldValue} → {h.newValue})
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
