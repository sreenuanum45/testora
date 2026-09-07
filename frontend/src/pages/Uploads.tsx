import { useEffect, useState } from 'react';
import { UploadCloud, Trash2, Database, Plus, Wand2 } from 'lucide-react';
import { api } from '../api/client';
import { useAppStore } from '../store/appStore';
import type { DataSet, FakerColumn, FakerColumnType } from '../api/types';

const FAKER_TYPE_OPTIONS: Array<{ value: FakerColumnType; label: string }> = [
  { value: 'fullName', label: 'Full name' },
  { value: 'firstName', label: 'First name' },
  { value: 'lastName', label: 'Last name' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone number' },
  { value: 'username', label: 'Username' },
  { value: 'password', label: 'Password' },
  { value: 'uuid', label: 'UUID' },
  { value: 'streetAddress', label: 'Street address' },
  { value: 'city', label: 'City' },
  { value: 'country', label: 'Country' },
  { value: 'zipCode', label: 'Zip code' },
  { value: 'company', label: 'Company' },
  { value: 'jobTitle', label: 'Job title' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'pastDate', label: 'Past date' },
  { value: 'futureDate', label: 'Future date' },
  { value: 'word', label: 'Word' },
  { value: 'sentence', label: 'Sentence' },
  { value: 'url', label: 'URL' },
  { value: 'creditCardNumber', label: 'Credit card number' },
];

export default function Uploads(): JSX.Element {
  const projectId = useAppStore((s) => s.currentProjectId);
  const [dataSets, setDataSets] = useState<DataSet[]>([]);
  const [mode, setMode] = useState<'csv' | 'faker'>('csv');
  const [name, setName] = useState('');
  const [csvText, setCsvText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [fakerColumns, setFakerColumns] = useState<FakerColumn[]>([{ name: 'email', type: 'email' }]);
  const [fakerRowCount, setFakerRowCount] = useState(10);
  const [generating, setGenerating] = useState(false);

  const refresh = (): void => {
    if (!projectId) return;
    api.get<DataSet[]>(`/projects/${projectId}/data-sets`).then(setDataSets);
  };

  useEffect(refresh, [projectId]);

  const create = async (): Promise<void> => {
    if (!projectId || !name.trim() || !csvText.trim()) return;
    setError(null);
    try {
      await api.post(`/projects/${projectId}/data-sets`, { name: name.trim(), csv: csvText });
      setName('');
      setCsvText('');
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const generate = async (): Promise<void> => {
    if (!projectId || !name.trim() || fakerColumns.length === 0) return;
    setError(null);
    setGenerating(true);
    try {
      await api.post(`/projects/${projectId}/data-sets/generate`, {
        name: name.trim(),
        columns: fakerColumns.filter((c) => c.name.trim()),
        rowCount: fakerRowCount,
      });
      setName('');
      setFakerColumns([{ name: 'email', type: 'email' }]);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  };

  const remove = async (id: string): Promise<void> => {
    if (!projectId) return;
    await api.delete(`/projects/${projectId}/data-sets/${id}`);
    refresh();
  };

  const onFile = (file: File): void => {
    const reader = new FileReader();
    reader.onload = () => setCsvText(String(reader.result ?? ''));
    reader.readAsText(file);
    if (!name.trim()) setName(file.name.replace(/\.csv$/i, ''));
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-ink">Uploads / Data Sets</h1>
        <p className="text-muted text-sm mt-1">
          A Data-Driven test runs once per row, with <code>{'{{columnName}}'}</code> placeholders in its steps or API
          endpoint substituted from each row — upload a CSV, or generate realistic synthetic data with Faker.
        </p>
      </div>

      <div className="bg-panel border border-border rounded-2xl shadow-card p-6 space-y-4">
        <div className="inline-flex rounded-lg border border-border overflow-hidden text-sm">
          <button
            className={`px-4 py-1.5 ${mode === 'csv' ? 'bg-ink text-white' : 'bg-surface text-muted'}`}
            onClick={() => setMode('csv')}
          >
            Upload CSV
          </button>
          <button
            className={`px-4 py-1.5 flex items-center gap-1.5 ${mode === 'faker' ? 'bg-ink text-white' : 'bg-surface text-muted'}`}
            onClick={() => setMode('faker')}
          >
            <Wand2 size={13} />
            Generate with Faker
          </button>
        </div>

        <input
          className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-sm"
          placeholder="Data set name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        {mode === 'csv' ? (
          <>
            <label className="flex items-center justify-center gap-2 border-2 border-dashed border-border rounded-xl py-6 text-sm text-muted cursor-pointer hover:bg-surface">
              <UploadCloud size={18} />
              Click to upload a CSV file, or paste it below
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
              />
            </label>
            <textarea
              className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-xs font-mono"
              rows={6}
              placeholder={'email,password\nalice@example.com,secret1\nbob@example.com,secret2'}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-500 to-brand-400 text-white text-sm font-semibold"
              onClick={create}
            >
              Create Data Set
            </button>
          </>
        ) : (
          <>
            <div className="space-y-2">
              {fakerColumns.map((col, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    className="flex-1 bg-surface border border-border rounded-lg px-3 py-1.5 text-sm"
                    placeholder="Column name (e.g. email)"
                    value={col.name}
                    onChange={(e) =>
                      setFakerColumns((cols) => cols.map((c, idx) => (idx === i ? { ...c, name: e.target.value } : c)))
                    }
                  />
                  <select
                    className="flex-1 bg-surface border border-border rounded-lg px-3 py-1.5 text-sm"
                    value={col.type}
                    onChange={(e) =>
                      setFakerColumns((cols) =>
                        cols.map((c, idx) => (idx === i ? { ...c, type: e.target.value as FakerColumnType } : c)),
                      )
                    }
                  >
                    {FAKER_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <button
                    className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-red-500 hover:bg-red-50 shrink-0"
                    onClick={() => setFakerColumns((cols) => cols.filter((_, idx) => idx !== i))}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <button
                className="flex items-center gap-1.5 text-xs font-medium text-brand-600"
                onClick={() => setFakerColumns((cols) => [...cols, { name: '', type: 'word' }])}
              >
                <Plus size={13} />
                Add column
              </button>
            </div>

            <div className="flex items-center gap-3">
              <label className="text-sm font-medium">Rows to generate</label>
              <input
                type="number"
                min={1}
                max={500}
                className="w-24 bg-surface border border-border rounded-lg px-3 py-1.5 text-sm"
                value={fakerRowCount}
                onChange={(e) => setFakerRowCount(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-500 to-brand-400 text-white text-sm font-semibold disabled:opacity-50"
              onClick={generate}
              disabled={generating}
            >
              <Wand2 size={14} />
              {generating ? 'Generating…' : 'Generate Data Set'}
            </button>
          </>
        )}
      </div>

      <div className="space-y-3">
        {dataSets.length === 0 ? (
          <div className="bg-panel border border-border rounded-2xl p-8 text-center text-muted text-sm">No data sets yet.</div>
        ) : (
          dataSets.map((ds) => (
            <div key={ds.id} className="bg-panel border border-border rounded-2xl shadow-card p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 font-semibold text-ink">
                  <Database size={16} className="text-brand-500" />
                  {ds.name}
                  <span className="text-xs font-normal text-muted">({ds.rows.length} rows)</span>
                </div>
                <button className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-red-500 hover:bg-red-50" onClick={() => remove(ds.id)}>
                  <Trash2 size={14} />
                </button>
              </div>
              {ds.rows.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-muted border-b border-border">
                        {Object.keys(ds.rows[0]!).map((col) => (
                          <th key={col} className="py-1.5 pr-4">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ds.rows.slice(0, 5).map((row, i) => (
                        <tr key={i} className="border-b border-border last:border-0">
                          {Object.values(row).map((v, j) => (
                            <td key={j} className="py-1.5 pr-4 text-slate-600">
                              {String(v)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {ds.rows.length > 5 && <p className="text-xs text-muted mt-2">+{ds.rows.length - 5} more rows</p>}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
