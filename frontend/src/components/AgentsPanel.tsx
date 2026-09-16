import { useState } from "react";
import { Bot, Loader2, Sparkles, Wrench, Check, Plus, FileCode2 } from "lucide-react";
import { api } from "../api/client";
import type { Step } from "../api/types";

/**
 * AI Agents panel: Planner / Generator / Healer, all grounded in the live page via a
 * real Hyperbrowser session. Results load into the step builder above as unsaved draft
 * changes, so nothing the agents produce touches the test until the user saves —
 * applying an agent's output is always an explicit action.
 */
type AgentKind = "plan" | "generate" | "heal";

interface AgentStepsResponse {
  steps: Step[];
  provider: string;
  model: string;
  exploration: { url: string; title: string; usedFallback: boolean } | null;
  runId?: string | null;
}

const AGENTS: Array<{
  kind: AgentKind;
  label: string;
  icon: typeof Sparkles;
  blurb: string;
  cta: string;
  promptPlaceholder: string;
}> = [
  {
    kind: "plan",
    label: "Planner",
    icon: Sparkles,
    blurb: "Explores the live site via Hyperbrowser, then proposes a test plan for its core flow.",
    cta: "Plan test",
    promptPlaceholder: "Optional focus, e.g. “test the login flow and one failed-login check”",
  },
  {
    kind: "generate",
    label: "Generator",
    icon: FileCode2,
    blurb: "Turns your plan into concrete, executable steps against the real page's elements.",
    cta: "Generate steps",
    promptPlaceholder: "Describe the flow, e.g. “open search, query ‘headphones’, assert results appear”",
  },
  {
    kind: "heal",
    label: "Healer",
    icon: Wrench,
    blurb: "Replays the latest failed run's errors against the page as it looks NOW, and repairs the steps.",
    cta: "Repair test",
    promptPlaceholder: "",
  },
];

export default function AgentsPanel({
  projectId,
  testId,
  hasTargetUrl,
  hasFailedRun,
  onApplySteps,
}: {
  projectId: string;
  testId: string;
  hasTargetUrl: boolean;
  hasFailedRun: boolean;
  onApplySteps: (steps: Step[]) => void;
}) {
  const [kind, setKind] = useState<AgentKind>("plan");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AgentStepsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const active = AGENTS.find((a) => a.kind === kind)!;

  const runAgent = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      if (kind === "plan") {
        const r = await api.post<AgentStepsResponse>(`/projects/${projectId}/tests/${testId}/agents/plan`, {
          notes: prompt || undefined,
          mode: "append",
        });
        setResult(r);
      } else if (kind === "generate") {
        if (!prompt.trim()) {
          setError("Describe the flow you want generated first.");
          setBusy(false);
          return;
        }
        const r = await api.post<AgentStepsResponse>(`/projects/${projectId}/tests/${testId}/agents/generate`, {
          plan: prompt,
          apply: false,
        });
        setResult(r);
      } else {
        const r = await api.post<AgentStepsResponse>(`/projects/${projectId}/tests/${testId}/agents/heal`, {
          apply: false,
        });
        setResult(r);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-panel border border-border rounded-2xl shadow-card p-6">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold text-ink flex items-center gap-1.5">
            <Bot size={14} className="text-brand-500" />
            AI Agents
          </h2>
          <p className="text-xs text-muted mt-0.5">
            Planner, Generator and Healer — grounded in the live page through a real Hyperbrowser
            session. Results load into the step builder as a draft; nothing is saved until you save.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {AGENTS.map((a) => {
          const Icon = a.icon;
          const selected = kind === a.kind;
          return (
            <button
              key={a.kind}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                selected
                  ? "bg-brand-600 text-white border-brand-600"
                  : "bg-surface text-ink border-border hover:border-brand-400"
              }`}
              onClick={() => {
                setKind(a.kind);
                setResult(null);
                setError(null);
              }}
              disabled={busy}
            >
              <Icon size={13} />
              {a.label}
            </button>
          );
        })}
      </div>

      <p className="text-xs text-muted mb-3">{active.blurb}</p>

      {active.promptPlaceholder && (
        <textarea
          className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-ink placeholder:text-muted/60 focus:outline-none focus:ring-1 focus:ring-brand-500"
          rows={2}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={active.promptPlaceholder}
        />
      )}

      <div className="flex items-center gap-2 mt-3">
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-medium disabled:opacity-40"
          onClick={runAgent}
          disabled={busy || !hasTargetUrl || (kind === "heal" && !hasFailedRun)}
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <active.icon size={13} />}
          {busy ? `${active.label} is thinking…` : active.cta}
        </button>
        {kind === "heal" && !hasFailedRun && (
          <span className="text-xs text-muted">No failed runs yet — the Healer needs one to diagnose.</span>
        )}
        {!hasTargetUrl && <span className="text-xs text-muted">Set a target URL on the test first.</span>}
      </div>

      {error && (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 whitespace-pre-wrap">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-4 rounded-xl border border-border bg-surface p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-muted">
              {result.steps.length} step(s) via <span className="font-medium text-ink">{result.provider}/{result.model}</span>
              {result.exploration &&
                (result.exploration.usedFallback ? (
                  " · page explored (text-only snapshot)"
                ) : (
                  " · grounded in the live page snapshot"
                ))}
            </div>
            <button
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium"
              onClick={() => {
                onApplySteps(result.steps);
                setResult(null);
                setPrompt("");
              }}
            >
              <Plus size={12} />
              Load into step builder
            </button>
          </div>
          <ol className="space-y-1">
            {result.steps.map((s, i) => (
              <li key={i} className="text-[11px] text-ink flex items-start gap-2">
                <Check size={12} className="text-emerald-500 mt-0.5 shrink-0" />
                <code className="truncate">
                  {s.action}
                  {s.selectorStrategy ? ` ${s.selectorStrategy}="${s.selector ?? ""}"` : ""}
                  {s.roleName ? ` name="${s.roleName}"` : ""}
                  {s.value ? ` = "${s.value}"` : ""}
                </code>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
