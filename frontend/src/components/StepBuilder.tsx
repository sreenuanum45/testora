import { useEffect, useState } from 'react';
import { Plus, Trash2, Pencil, Copy, ChevronUp, ChevronDown, X, Save } from 'lucide-react';
import { api } from '../api/client';
import { useAppStore } from '../store/appStore';
import type { Step, StepAction, Component } from '../api/types';

const ACTION_GROUPS: Array<{ label: string; actions: Array<{ value: StepAction; label: string }> }> = [
  {
    label: 'Interactions',
    actions: [
      { value: 'goto', label: 'Go to URL' },
      { value: 'click', label: 'Click' },
      { value: 'fill', label: 'Fill' },
      { value: 'press', label: 'Press key' },
      { value: 'check', label: 'Check checkbox' },
      { value: 'select', label: 'Select option' },
    ],
  },
  {
    label: 'Advanced Assertions',
    actions: [
      { value: 'assertVisible', label: 'Assert visible' },
      { value: 'assertHidden', label: 'Assert hidden' },
      { value: 'assertText', label: 'Assert text contains' },
      { value: 'assertValue', label: 'Assert field value' },
      { value: 'assertUrl', label: 'Assert URL contains' },
      { value: 'assertCount', label: 'Assert element count' },
      { value: 'assertAttribute', label: 'Assert attribute value' },
      { value: 'assertCss', label: 'Assert CSS property' },
      { value: 'assertEnabled', label: 'Assert enabled' },
      { value: 'assertDisabled', label: 'Assert disabled' },
      { value: 'assertChecked', label: 'Assert checked' },
      { value: 'assertUnchecked', label: 'Assert unchecked' },
    ],
  },
  {
    label: 'Advanced Waits',
    actions: [
      { value: 'waitForVisible', label: 'Wait until visible' },
      { value: 'waitForHidden', label: 'Wait until hidden' },
      { value: 'waitForEnabled', label: 'Wait until enabled' },
      { value: 'waitForUrl', label: 'Wait for URL to contain' },
      { value: 'waitForResponse', label: 'Wait for network response' },
      { value: 'waitForNetworkIdle', label: 'Wait for network idle' },
    ],
  },
  {
    label: 'Composition',
    actions: [
      { value: 'component', label: 'Insert reusable component' },
      { value: 'customCode', label: 'Custom code (escape hatch)' },
    ],
  },
];

const NEEDS_SELECTOR: StepAction[] = [
  'click',
  'fill',
  'press',
  'check',
  'select',
  'assertVisible',
  'assertHidden',
  'assertText',
  'assertValue',
  'assertCount',
  'assertAttribute',
  'assertCss',
  'assertEnabled',
  'assertDisabled',
  'assertChecked',
  'assertUnchecked',
  'waitForVisible',
  'waitForHidden',
  'waitForEnabled',
];
const NEEDS_VALUE: StepAction[] = ['goto', 'fill', 'press', 'select', 'assertText', 'assertValue', 'assertUrl', 'assertCount', 'waitForUrl', 'waitForResponse'];
const NEEDS_PAIR_VALUE: StepAction[] = ['assertAttribute', 'assertCss'];

const VALUE_LABEL: Partial<Record<StepAction, string>> = {
  goto: 'URL',
  fill: 'Text to type',
  press: 'Key (e.g. Enter)',
  select: 'Option value',
  assertText: 'Expected text (contains)',
  assertValue: 'Expected value',
  assertUrl: 'URL substring',
  assertCount: 'Expected count',
  waitForUrl: 'URL substring',
  waitForResponse: 'Response URL substring',
};

const PAIR_LABEL: Partial<Record<StepAction, [string, string]>> = {
  assertAttribute: ['Attribute name (e.g. href)', 'Expected value'],
  assertCss: ['CSS property (e.g. color)', 'Expected value'],
};

const EMPTY_DRAFT: Step = { action: 'click', selectorStrategy: 'role' };

function summarize(step: Step): string {
  const parts: string[] = [step.action];
  if (step.selectorStrategy && step.selector) parts.push(`${step.selectorStrategy}="${step.selector}"${step.roleName ? ` name="${step.roleName}"` : ''}`);
  if (step.value) parts.push(`= "${step.value}"`);
  if (step.componentId) parts.push(`(component)`);
  if (step.code) parts.push(`(custom code)`);
  return parts.join(' ');
}

interface StepBuilderProps {
  steps: Step[];
  onChange: (steps: Step[]) => void;
}

export default function StepBuilder({ steps, onChange }: StepBuilderProps): JSX.Element {
  const projectId = useAppStore((s) => s.currentProjectId);
  const [components, setComponents] = useState<Component[]>([]);
  const [draft, setDraft] = useState<Step>(EMPTY_DRAFT);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!projectId) return;
    api.get<Component[]>(`/projects/${projectId}/components`).then(setComponents);
  }, [projectId]);

  const startEdit = (index: number): void => {
    setEditingIndex(index);
    setDraft({ ...steps[index]! });
  };

  const cancelEdit = (): void => {
    setEditingIndex(null);
    setDraft(EMPTY_DRAFT);
  };

  const saveStep = (): void => {
    if (editingIndex !== null) {
      onChange(steps.map((s, i) => (i === editingIndex ? draft : s)));
      setEditingIndex(null);
      setDraft(EMPTY_DRAFT);
    } else {
      onChange([...steps, draft]);
      setDraft({ action: draft.action, selectorStrategy: 'role' });
    }
  };

  const removeStep = (index: number): void => {
    onChange(steps.filter((_, i) => i !== index));
    if (editingIndex === index) cancelEdit();
    else if (editingIndex !== null && index < editingIndex) setEditingIndex(editingIndex - 1);
  };

  const duplicateStep = (index: number): void => {
    const copy = { ...steps[index]! };
    const next = [...steps.slice(0, index + 1), copy, ...steps.slice(index + 1)];
    onChange(next);
  };

  const moveStep = (index: number, direction: -1 | 1): void => {
    const target = index + direction;
    if (target < 0 || target >= steps.length) return;
    const next = [...steps];
    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange(next);
    if (editingIndex === index) setEditingIndex(target);
    else if (editingIndex === target) setEditingIndex(index);
  };

  return (
    <div>
      {steps.length > 0 && (
        <ol className="space-y-1.5 mb-4">
          {steps.map((step, i) => (
            <li
              key={i}
              className={`flex items-center gap-2 border rounded-lg px-3 py-2 text-xs font-mono ${
                editingIndex === i ? 'bg-brand-50 border-brand-200' : 'bg-surface border-border'
              }`}
            >
              <div className="flex flex-col shrink-0 -my-1">
                <button
                  className="text-muted hover:text-ink disabled:opacity-30"
                  onClick={() => moveStep(i, -1)}
                  disabled={i === 0}
                  title="Move up"
                >
                  <ChevronUp size={11} />
                </button>
                <button
                  className="text-muted hover:text-ink disabled:opacity-30"
                  onClick={() => moveStep(i, 1)}
                  disabled={i === steps.length - 1}
                  title="Move down"
                >
                  <ChevronDown size={11} />
                </button>
              </div>
              <span className="text-muted shrink-0">{i + 1}.</span>
              <span className="flex-1 truncate">{summarize(step)}</span>
              <button onClick={() => startEdit(i)} className="text-brand-600 shrink-0" title="Edit step">
                <Pencil size={12} />
              </button>
              <button onClick={() => duplicateStep(i)} className="text-slate-500 shrink-0" title="Duplicate step">
                <Copy size={12} />
              </button>
              <button onClick={() => removeStep(i)} className="text-red-500 shrink-0" title="Delete step">
                <Trash2 size={12} />
              </button>
            </li>
          ))}
        </ol>
      )}

      <div className={`border rounded-xl p-4 space-y-3 ${editingIndex !== null ? 'border-brand-300 bg-brand-50/40' : 'border-dashed border-border'}`}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-ink">
            {editingIndex !== null ? `Editing step ${editingIndex + 1}` : 'Add a step'}
          </span>
          {editingIndex !== null && (
            <button className="flex items-center gap-1 text-xs text-muted" onClick={cancelEdit}>
              <X size={12} />
              Cancel
            </button>
          )}
        </div>

        <select
          className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm"
          value={draft.action}
          onChange={(e) => setDraft({ action: e.target.value as StepAction, selectorStrategy: 'role' })}
        >
          {ACTION_GROUPS.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.actions.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>

        {NEEDS_SELECTOR.includes(draft.action) && (
          <div className="grid grid-cols-3 gap-2">
            <select
              className="bg-surface border border-border rounded-lg px-2 py-1.5 text-xs"
              value={draft.selectorStrategy ?? 'role'}
              onChange={(e) => setDraft({ ...draft, selectorStrategy: e.target.value as Step['selectorStrategy'] })}
            >
              <option value="role">role</option>
              <option value="label">label</option>
              <option value="placeholder">placeholder</option>
              <option value="text">text</option>
              <option value="testid">testid</option>
              <option value="css">css</option>
            </select>
            <input
              className="bg-surface border border-border rounded-lg px-2 py-1.5 text-xs col-span-2"
              placeholder={draft.selectorStrategy === 'role' ? 'ARIA role, e.g. button' : 'Selector value'}
              value={draft.selector ?? ''}
              onChange={(e) => setDraft({ ...draft, selector: e.target.value })}
            />
            {draft.selectorStrategy === 'role' && (
              <input
                className="bg-surface border border-border rounded-lg px-2 py-1.5 text-xs col-span-3"
                placeholder="Accessible name (e.g. Submit)"
                value={draft.roleName ?? ''}
                onChange={(e) => setDraft({ ...draft, roleName: e.target.value })}
              />
            )}
          </div>
        )}

        {NEEDS_VALUE.includes(draft.action) && (
          <input
            className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm"
            placeholder={VALUE_LABEL[draft.action] ?? 'Value'}
            value={draft.value ?? ''}
            onChange={(e) => setDraft({ ...draft, value: e.target.value })}
          />
        )}

        {NEEDS_PAIR_VALUE.includes(draft.action) && (
          <div className="grid grid-cols-2 gap-2">
            <input
              className="bg-surface border border-border rounded-lg px-3 py-2 text-sm"
              placeholder={PAIR_LABEL[draft.action]?.[0] ?? 'Name'}
              value={(draft.value ?? '').split('=')[0] ?? ''}
              onChange={(e) => setDraft({ ...draft, value: `${e.target.value}=${(draft.value ?? '').split('=').slice(1).join('=')}` })}
            />
            <input
              className="bg-surface border border-border rounded-lg px-3 py-2 text-sm"
              placeholder={PAIR_LABEL[draft.action]?.[1] ?? 'Expected value'}
              value={(draft.value ?? '').split('=').slice(1).join('=')}
              onChange={(e) => setDraft({ ...draft, value: `${(draft.value ?? '').split('=')[0] ?? ''}=${e.target.value}` })}
            />
          </div>
        )}

        {draft.action === 'component' && (
          <select
            className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm"
            value={draft.componentId ?? ''}
            onChange={(e) => setDraft({ ...draft, componentId: e.target.value })}
          >
            <option value="">Select a component</option>
            {components.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}

        {draft.action === 'customCode' && (
          <textarea
            className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-xs font-mono"
            rows={3}
            placeholder="await page.mouse.wheel(0, 400);"
            value={draft.code ?? ''}
            onChange={(e) => setDraft({ ...draft, code: e.target.value })}
          />
        )}

        <button
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-xs font-medium ${
            editingIndex !== null ? 'bg-brand-600' : 'bg-ink'
          }`}
          onClick={saveStep}
        >
          {editingIndex !== null ? (
            <>
              <Save size={13} />
              Save Changes
            </>
          ) : (
            <>
              <Plus size={13} />
              Add Step
            </>
          )}
        </button>
      </div>
    </div>
  );
}
