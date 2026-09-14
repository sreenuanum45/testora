import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  LayoutDashboard,
  Layers3,
  Box,
  CalendarDays,
  Braces,
  ScanSearch,
  UploadCloud,
  BarChart3,
  Link2,
  Settings as SettingsIcon,
  Plus,
  FileText,
  CornerDownLeft,
  type LucideIcon,
} from 'lucide-react';
import { api } from '../api/client';
import { useAppStore } from '../store/appStore';
import type { Test } from '../api/types';

interface PageEntry {
  kind: 'page';
  label: string;
  path: string;
  icon: LucideIcon;
}

interface TestEntry {
  kind: 'test';
  label: string;
  sublabel: string;
  path: string;
  icon: LucideIcon;
}

type Entry = PageEntry | TestEntry;

const PAGES: PageEntry[] = [
  { kind: 'page', label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { kind: 'page', label: 'New Test', path: '/new-test', icon: Plus },
  { kind: 'page', label: 'Suites', path: '/suites', icon: Layers3 },
  { kind: 'page', label: 'Components', path: '/components', icon: Box },
  { kind: 'page', label: 'Schedulers', path: '/schedulers', icon: CalendarDays },
  { kind: 'page', label: 'Variables', path: '/variables', icon: Braces },
  { kind: 'page', label: 'Locators', path: '/locators', icon: ScanSearch },
  { kind: 'page', label: 'Uploads', path: '/uploads', icon: UploadCloud },
  { kind: 'page', label: 'Reports', path: '/reports', icon: BarChart3 },
  { kind: 'page', label: 'API Testing', path: '/api-testing', icon: Link2 },
  { kind: 'page', label: 'Settings', path: '/settings', icon: SettingsIcon },
];

/** Global Ctrl/Cmd+K quick-jump — fuzzy-search every page and every test in the current
 *  project without leaving the keyboard. Mounted once at the app layout root so the
 *  shortcut works from anywhere, not just a specific page. */
export default function CommandPalette(): JSX.Element | null {
  const navigate = useNavigate();
  const projectId = useAppStore((s) => s.currentProjectId);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [tests, setTests] = useState<Test[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    const onOpenRequest = (): void => setOpen(true);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('open-command-palette', onOpenRequest);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('open-command-palette', onOpenRequest);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    if (!open || !projectId) return;
    api.get<Test[]>(`/projects/${projectId}/tests`).then(setTests);
  }, [open, projectId]);

  const entries: Entry[] = useMemo(() => {
    const testEntries: TestEntry[] = tests.map((t) => ({
      kind: 'test',
      label: t.name,
      sublabel: `${t.type} · ${t.category}`,
      path: `/tests/${t.id}`,
      icon: FileText,
    }));
    return [...PAGES, ...testEntries];
  }, [tests]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => e.label.toLowerCase().includes(q) || ('sublabel' in e && e.sublabel.toLowerCase().includes(q)));
  }, [entries, query]);

  useEffect(() => setActiveIndex(0), [query]);

  const select = (entry: Entry): void => {
    navigate(entry.path);
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] bg-black/40" onClick={() => setOpen(false)}>
      <div
        className="w-full max-w-lg bg-panel border border-border rounded-2xl shadow-card overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
          <Search size={16} className="text-muted shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to a test or page…"
            className="flex-1 bg-transparent text-sm text-ink placeholder:text-muted outline-none"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === 'Enter' && filtered[activeIndex]) {
                select(filtered[activeIndex]);
              }
            }}
          />
          <kbd className="text-[10px] text-muted border border-border rounded px-1.5 py-0.5">Esc</kbd>
        </div>

        <div className="max-h-80 overflow-y-auto py-1.5">
          {filtered.length === 0 && <p className="text-sm text-muted text-center py-8">No matches.</p>}
          {filtered.map((entry, i) => {
            const Icon = entry.icon;
            return (
              <button
                key={`${entry.kind}-${entry.path}-${i}`}
                onClick={() => select(entry)}
                onMouseEnter={() => setActiveIndex(i)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm ${
                  i === activeIndex ? 'bg-brand-50 text-brand-700' : 'text-ink hover:bg-surface'
                }`}
              >
                <Icon size={15} className={i === activeIndex ? 'text-brand-500' : 'text-muted'} />
                <span className="flex-1 truncate">{entry.label}</span>
                {'sublabel' in entry && <span className="text-xs text-muted shrink-0">{entry.sublabel}</span>}
                {i === activeIndex && <CornerDownLeft size={13} className="text-brand-400 shrink-0" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
