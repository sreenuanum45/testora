import { useEffect, useRef, useState } from 'react';
import { Check, X, Loader2, Sparkles, MousePointerClick } from 'lucide-react';
import { api } from '../api/client';
import { useAppStore } from '../store/appStore';
import type { RunStatus, RunStepEvent, Step } from '../api/types';

export function describeStep(step: Step | undefined, index: number): string {
  if (!step) return `Step ${index + 1}`;
  const target = step.roleName || step.selector || '';
  switch (step.action) {
    case 'goto':
      return `Go to ${step.value}`;
    case 'click':
      return `Click on ${target}`;
    case 'fill':
      return `Type "${step.value}" into ${target}`;
    case 'press':
      return `Press ${step.value}`;
    case 'check':
      return `Check ${target}`;
    case 'select':
      return `Select "${step.value}" in ${target}`;
    case 'assertVisible':
      return `Verify that ${target} is visible`;
    case 'assertHidden':
      return `Verify that ${target} is hidden`;
    case 'assertText':
      return `Verify that ${target} contains the text "${step.value}"`;
    case 'assertValue':
      return `Verify that ${target} has value "${step.value}"`;
    case 'assertUrl':
      return `Verify that the URL contains "${step.value}"`;
    case 'assertCount':
      return `Verify that ${target} count is ${step.value}`;
    case 'assertEnabled':
      return `Verify that ${target} is enabled`;
    case 'assertDisabled':
      return `Verify that ${target} is disabled`;
    case 'assertChecked':
      return `Verify that ${target} is checked`;
    case 'assertUnchecked':
      return `Verify that ${target} is unchecked`;
    case 'waitForVisible':
      return `Wait until ${target} is visible`;
    case 'waitForHidden':
      return `Wait until ${target} is hidden`;
    case 'waitForEnabled':
      return `Wait until ${target} is enabled`;
    case 'waitForUrl':
      return `Wait for the URL to contain "${step.value}"`;
    case 'waitForNetworkIdle':
      return `Wait for network idle`;
    case 'waitForPopup':
      return `Switch to the new tab/window that just opened`;
    case 'customCode':
      return `Run custom code`;
    case 'component':
      return `Run reusable component`;
    default:
      return `${step.action} ${target}`.trim();
  }
}

function StatusIcon({ status }: { status: RunStepEvent['status'] }): JSX.Element {
  if (status === 'passed') return <Check size={14} className="text-emerald-500" />;
  if (status === 'failed') return <X size={14} className="text-red-500" />;
  if (status === 'running') return <Loader2 size={14} className="text-brand-500 animate-spin" />;
  return <MousePointerClick size={14} className="text-slate-400" />;
}

interface LiveStepLogProps {
  runId: string;
  runStatus: RunStatus;
  steps: Step[];
  className?: string;
}

export default function LiveStepLog({ runId, runStatus, steps, className }: LiveStepLogProps): JSX.Element {
  const projectId = useAppStore((s) => s.currentProjectId);
  const [events, setEvents] = useState<RunStepEvent[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    const load = (): void => {
      api.get<RunStepEvent[]>(`/projects/${projectId}/runs/${runId}/step-events`).then((data) => {
        if (!cancelled) setEvents(data);
      });
    };
    load();
    const isLive = runStatus === 'RUNNING' || runStatus === 'QUEUED';
    const interval = isLive ? setInterval(load, 1200) : undefined;
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [projectId, runId, runStatus]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [events.length]);

  return (
    <div ref={listRef} className={`space-y-1.5 pr-1 ${className ?? 'max-h-96 overflow-y-auto'}`}>
      {events.length === 0 && (
        <p className="text-xs text-muted py-4 text-center">
          {runStatus === 'QUEUED' ? 'Waiting to start…' : 'No step events yet.'}
        </p>
      )}
      {events.map((event) => {
        if (event.action === 'heal') {
          const healed = event.status === 'healed';
          return (
            <div
              key={event.id}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs border ${
                healed ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-700'
              }`}
            >
              <Sparkles size={13} className="shrink-0" />
              <span className="flex-1">{event.message}</span>
              {!healed && event.status === 'healing' && (
                <span className="px-2 py-0.5 rounded-full bg-white/70 text-[10px] font-semibold uppercase tracking-wide">
                  Self-healing…
                </span>
              )}
            </div>
          );
        }
        return (
          <div key={event.id} className="flex items-center gap-2 bg-surface border border-border rounded-lg px-3 py-2 text-xs">
            <StatusIcon status={event.status} />
            <span className="text-muted shrink-0">{event.index + 1}.</span>
            <span className={`flex-1 min-w-0 truncate ${event.status === 'failed' ? 'text-red-600' : 'text-ink'}`}>
              {describeStep(steps[event.index], event.index)}
            </span>
            {event.status === 'failed' && event.message && <span className="text-red-500 truncate max-w-[40%]">{event.message}</span>}
          </div>
        );
      })}
    </div>
  );
}
