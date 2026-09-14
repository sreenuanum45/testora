import { useState } from 'react';
import { X } from 'lucide-react';

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
}

/** Chip list with an add-on-Enter/comma text field — no equivalent existed anywhere in the
 *  app before test tagging, so this is the first one; kept generic enough to reuse wherever
 *  a multi-value tag/label editor is needed next. */
export default function TagInput({ value, onChange }: TagInputProps): JSX.Element {
  const [draft, setDraft] = useState('');

  function addTag(raw: string): void {
    const tag = raw.trim();
    if (!tag || value.includes(tag)) return;
    onChange([...value, tag]);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(draft);
      setDraft('');
    } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 bg-surface border border-border rounded-xl px-2.5 py-1.5">
      {value.map((tag) => (
        <span key={tag} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-brand-50 text-brand-600">
          {tag}
          <button type="button" onClick={() => onChange(value.filter((t) => t !== tag))} className="hover:text-brand-800">
            <X size={11} />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          addTag(draft);
          setDraft('');
        }}
        placeholder={value.length === 0 ? 'Add a tag…' : ''}
        className="flex-1 min-w-[80px] bg-transparent text-sm outline-none py-0.5"
      />
    </div>
  );
}
