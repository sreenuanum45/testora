import { useEffect, useState } from 'react';
import { X, ImageOff } from 'lucide-react';
import { api } from '../api/client';
import type { Run } from '../api/types';

interface VisualDiffModalProps {
  projectId: string;
  testId: string;
  run: Run;
  hasBaseline: boolean;
  onClose: () => void;
  onBaselineSet: () => void;
}

/** Baseline / current / pixel-diff side by side for one run — same overlay/card chrome as
 *  RunCompareModal so the two "open a modal over a run" flows feel consistent. */
export default function VisualDiffModal({ projectId, testId, run, hasBaseline, onClose, onBaselineSet }: VisualDiffModalProps): JSX.Element {
  const [baselineUrl, setBaselineUrl] = useState<string | null>(null);
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [diffUrl, setDiffUrl] = useState<string | null>(null);
  const [settingBaseline, setSettingBaseline] = useState(false);

  useEffect(() => {
    let baseline: string | null = null;
    let current: string | null = null;
    let diff: string | null = null;

    if (hasBaseline) {
      api
        .getBlob(`/projects/${projectId}/tests/${testId}/visual-baseline`)
        .then((b) => setBaselineUrl((baseline = URL.createObjectURL(b))))
        .catch(() => setBaselineUrl(null));
    }
    if (run.screenshotPath) {
      api
        .getBlob(`/projects/${projectId}/runs/${run.id}/screenshot`)
        .then((b) => setCurrentUrl((current = URL.createObjectURL(b))))
        .catch(() => setCurrentUrl(null));
    }
    if (run.visualDiffPath) {
      api
        .getBlob(`/projects/${projectId}/runs/${run.id}/visual-diff`)
        .then((b) => setDiffUrl((diff = URL.createObjectURL(b))))
        .catch(() => setDiffUrl(null));
    }

    return () => {
      if (baseline) URL.revokeObjectURL(baseline);
      if (current) URL.revokeObjectURL(current);
      if (diff) URL.revokeObjectURL(diff);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, testId, run.id, hasBaseline]);

  const setAsBaseline = async (): Promise<void> => {
    setSettingBaseline(true);
    try {
      await api.post(`/projects/${projectId}/tests/${testId}/visual-baseline`, { runId: run.id });
      onBaselineSet();
    } finally {
      setSettingBaseline(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-6" onClick={onClose}>
      <div className="bg-panel border border-border rounded-2xl shadow-card max-w-4xl w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <div className="text-sm font-semibold text-ink">Visual regression</div>
            <div className="text-xs text-muted">
              {run.visualDiffPercent !== null ? `${run.visualDiffPercent.toFixed(2)}% pixels different from baseline` : 'No diff computed for this run'}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="px-3 py-1.5 rounded-lg bg-surface border border-border text-xs font-medium text-ink disabled:opacity-50"
              onClick={setAsBaseline}
              disabled={settingBaseline || !run.screenshotPath}
            >
              {settingBaseline ? 'Setting…' : 'Set as baseline'}
            </button>
            <button onClick={onClose} className="w-8 h-8 rounded-lg border border-border flex items-center justify-center hover:bg-surface">
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-3 divide-x divide-border">
          <ImagePane label="Baseline" url={baselineUrl} empty="No baseline set" />
          <ImagePane label="Current" url={currentUrl} empty="No screenshot" />
          <ImagePane label="Diff" url={diffUrl} empty={hasBaseline ? 'Not comparable' : 'Set a baseline first'} />
        </div>
      </div>
    </div>
  );
}

function ImagePane({ label, url, empty }: { label: string; url: string | null; empty: string }): JSX.Element {
  return (
    <div className="p-4">
      <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">{label}</div>
      {url ? (
        <img src={url} alt={label} className="w-full rounded-lg border border-border" />
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 h-40 rounded-lg border border-dashed border-border text-muted text-xs">
          <ImageOff size={18} />
          {empty}
        </div>
      )}
    </div>
  );
}
