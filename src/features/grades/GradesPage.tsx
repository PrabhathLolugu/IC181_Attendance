import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../services/supabase';
import { Modal } from '../../components/ui/Modal';
import { toast } from '../../components/ui/Toast';
import type { Staff, Student, GradeCategory, GradeEntry, GradeScaleBand, StudentAttendanceSummary } from '../../types';

interface Props { staff: Staff; courseName: string; }

export function GradesPage({ staff, courseName }: Props) {
  const [categories, setCategories] = useState<GradeCategory[]>([]);
  const [bands, setBands] = useState<GradeScaleBand[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [entries, setEntries] = useState<GradeEntry[]>([]);
  const [attendancePct, setAttendancePct] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortDesc, setSortDesc] = useState(true);
  const [showCategories, setShowCategories] = useState(false);
  const [showScale, setShowScale] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: cats }, { data: bandRows }, { data: studentRows }, { data: entryRows }, { data: summaryRows }] = await Promise.all([
      supabase.from('grade_categories').select('*').eq('course_name', courseName).order('position'),
      supabase.from('grade_scale_bands').select('*').order('position'),
      supabase.from('students').select('*').eq('status', 'active').order('roll_number'),
      supabase.from('grade_entries').select('*'),
      supabase.rpc('student_attendance_summary', { p_course_name: courseName }),
    ]);
    setCategories(cats ?? []);
    setBands(bandRows ?? []);
    setStudents(studentRows ?? []);
    setEntries(entryRows ?? []);
    const pctMap: Record<string, number> = {};
    ((summaryRows as StudentAttendanceSummary[]) ?? []).forEach((s) => { pctMap[s.student_id] = s.attendance_percentage; });
    setAttendancePct(pctMap);
    setLoading(false);
  }, [courseName]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel('grade_entries_watch')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'grade_entries' }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  const entryMap = useMemo(() => {
    const m = new Map<string, GradeEntry>();
    entries.forEach((e) => m.set(`${e.category_id}|${e.student_id}`, e));
    return m;
  }, [entries]);

  const weightSum = useMemo(() => categories.reduce((sum, c) => sum + Number(c.weight_percent), 0), [categories]);

  function categoryScorePercent(cat: GradeCategory, studentId: string): number {
    if (cat.attendance_linked) return attendancePct[studentId] ?? 0;
    const entry = entryMap.get(`${cat.id}|${studentId}`);
    if (!entry) return 0;
    return (Number(entry.score) / Number(cat.max_score)) * 100;
  }

  function totalPercent(studentId: string): number {
    if (categories.length === 0) return 0;
    const sum = categories.reduce((acc, c) => acc + (categoryScorePercent(c, studentId) * Number(c.weight_percent)) / 100, 0);
    return Math.round(sum * 10) / 10;
  }

  function gradeFor(pct: number): GradeScaleBand | null {
    return bands.find((b) => pct >= Number(b.min_percent) && pct <= Number(b.max_percent)) ?? null;
  }

  const rows = useMemo(() => {
    const filtered = students.filter(
      (s) => !search.trim() || s.roll_number.toLowerCase().includes(search.toLowerCase()) || s.name.toLowerCase().includes(search.toLowerCase()),
    );
    const withTotals = filtered.map((s) => ({ student: s, total: totalPercent(s.id) }));
    withTotals.sort((a, b) => (sortDesc ? b.total - a.total : a.total - b.total));
    return withTotals;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, search, sortDesc, entries, categories, attendancePct]);

  async function saveScore(categoryId: string, studentId: string, score: number) {
    const { error } = await supabase
      .from('grade_entries')
      .upsert({ category_id: categoryId, student_id: studentId, score, updated_by: staff.id }, { onConflict: 'category_id,student_id' });
    if (error) { toast('error', 'Could not save score.'); return; }
    setEntries((prev) => {
      const others = prev.filter((e) => !(e.category_id === categoryId && e.student_id === studentId));
      return [...others, { id: `${categoryId}|${studentId}`, category_id: categoryId, student_id: studentId, score, updated_at: new Date().toISOString() }];
    });
  }

  function handleCsvExport() {
    const header = ['Roll Number', 'Name', ...categories.map((c) => c.name), 'Total %', 'Grade'];
    const csvRows = rows.map(({ student, total }) => [
      student.roll_number,
      student.name,
      ...categories.map((c) => categoryScorePercent(c, student.id).toFixed(1)),
      total.toFixed(1),
      gradeFor(total)?.label ?? '',
    ]);
    const csv = [header, ...csvRows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'gradebook.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="page">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Grades</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{courseName} · Weighted scoring across categories, ranked and graded.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setShowCategories(true)} className="btn-secondary btn-sm">Categories</button>
          <button onClick={() => setShowScale(true)} className="btn-secondary btn-sm">Grade Scale</button>
          <button onClick={() => setShowImport(true)} className="btn-secondary btn-sm">Import Scores</button>
          <button onClick={handleCsvExport} className="btn-primary btn-sm">Export CSV</button>
        </div>
      </div>

      {categories.length > 0 && Math.round(weightSum) !== 100 && (
        <div className="px-4 py-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl text-amber-800 dark:text-amber-400 text-xs">
          Category weights add up to {weightSum}%, not 100% — totals below will reflect that until it's fixed in Categories.
        </div>
      )}

      {categories.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">No grading categories yet — add one to start scoring (e.g. Attendance 10%, Quiz 1 15%, Midterm 25%...).</p>
          <button onClick={() => setShowCategories(true)} className="btn-primary btn-sm">Add Categories</button>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <input className="input-base max-w-xs" placeholder="Search roll number or name…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <button onClick={() => setSortDesc((v) => !v)} className="btn-outline btn-sm">
              Sort {sortDesc ? '↓ High to Low' : '↑ Low to High'}
            </button>
            <span className="text-xs text-slate-400">{rows.length} students</span>
          </div>

          <div className="card overflow-x-auto">
            {loading ? (
              <div className="p-10 text-center text-sm text-slate-400">Loading…</div>
            ) : (
              <table className="data-table min-w-[720px]">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Roll</th>
                    <th>Name</th>
                    {categories.map((c) => (
                      <th key={c.id}>{c.name} <span className="text-slate-400 font-normal">({c.weight_percent}%)</span></th>
                    ))}
                    <th>Total %</th>
                    <th>Grade</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ student, total }, i) => {
                    const grade = gradeFor(total);
                    return (
                      <tr key={student.id}>
                        <td className="text-slate-400">{i + 1}</td>
                        <td className="font-mono font-medium">{student.roll_number}</td>
                        <td>{student.name}</td>
                        {categories.map((c) => (
                          <td key={c.id}>
                            {c.attendance_linked ? (
                              <span className="text-slate-500 dark:text-slate-400">{(attendancePct[student.id] ?? 0).toFixed(0)}%</span>
                            ) : (
                              <ScoreCell
                                maxScore={c.max_score}
                                value={entryMap.get(`${c.id}|${student.id}`)?.score ?? null}
                                onSave={(score) => saveScore(c.id, student.id, score)}
                              />
                            )}
                          </td>
                        ))}
                        <td className="font-semibold">{total.toFixed(1)}%</td>
                        <td>
                          {grade ? (
                            <span className="badge" style={grade.color ? { backgroundColor: `${grade.color}22`, color: grade.color, borderColor: `${grade.color}55` } : undefined}>
                              {grade.label}
                            </span>
                          ) : <span className="text-slate-300 dark:text-slate-600">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      <CategoriesModal open={showCategories} onClose={() => setShowCategories(false)} staff={staff} courseName={courseName} categories={categories} onChanged={load} />
      <GradeScaleModal open={showScale} onClose={() => setShowScale(false)} bands={bands} onChanged={load} />
      <ImportScoresModal open={showImport} onClose={() => setShowImport(false)} staff={staff} categories={categories} students={students} onImported={load} />
    </main>
  );
}

function ScoreCell({ value, maxScore, onSave }: { value: number | null; maxScore: number; onSave: (score: number) => void }) {
  const [text, setText] = useState(value === null ? '' : String(value));
  const [saving, setSaving] = useState(false);

  useEffect(() => { setText(value === null ? '' : String(value)); }, [value]);

  async function commit() {
    const num = Number(text);
    if (text === '' || Number.isNaN(num) || num < 0) { setText(value === null ? '' : String(value)); return; }
    if (num === value) return;
    setSaving(true);
    await onSave(num);
    setSaving(false);
  }

  return (
    <input
      type="number"
      min={0}
      max={maxScore}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      placeholder={`/${maxScore}`}
      disabled={saving}
      className="w-16 px-2 py-1 text-sm border border-slate-200 dark:border-[#30363d] rounded-lg bg-white dark:bg-[#0d1117] focus:outline-none focus:ring-2 focus:ring-blue-500/30"
    />
  );
}

function CategoriesModal({
  open, onClose, staff, courseName, categories, onChanged,
}: { open: boolean; onClose: () => void; staff: Staff; courseName: string; categories: GradeCategory[]; onChanged: () => void }) {
  const [form, setForm] = useState({ name: '', weight_percent: 10, max_score: 100, attendance_linked: false });

  async function handleAdd() {
    if (!form.name.trim()) { toast('error', 'Category name is required.'); return; }
    const { error } = await supabase.from('grade_categories').insert({
      name: form.name.trim(),
      weight_percent: form.weight_percent,
      max_score: form.attendance_linked ? 100 : form.max_score,
      attendance_linked: form.attendance_linked,
      position: categories.length,
      created_by: staff.id,
      course_name: courseName,
    });
    if (error) { toast('error', 'Could not add category.'); return; }
    setForm({ name: '', weight_percent: 10, max_score: 100, attendance_linked: false });
    onChanged();
  }

  async function handleUpdate(id: string, patch: Partial<GradeCategory>) {
    const { error } = await supabase.from('grade_categories').update(patch).eq('id', id);
    if (error) { toast('error', 'Could not update category.'); return; }
    onChanged();
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this category? All scores entered for it will be removed too.')) return;
    const { error } = await supabase.from('grade_categories').delete().eq('id', id);
    if (error) { toast('error', 'Could not delete category.'); return; }
    onChanged();
  }

  return (
    <Modal open={open} onClose={onClose} title="Grading Categories" subtitle="Weights should add up to 100%. Any admin or TA can manage these." size="lg">
      <div className="flex flex-col gap-2 mb-4">
        {categories.map((c) => (
          <div key={c.id} className="flex items-center gap-2 p-2 border border-slate-100 dark:border-[#21262d] rounded-xl">
            <input
              defaultValue={c.name}
              onBlur={(e) => e.target.value.trim() && e.target.value !== c.name && handleUpdate(c.id, { name: e.target.value.trim() })}
              className="input-base flex-1 min-w-0"
            />
            <input
              type="number" min={0} max={100} defaultValue={c.weight_percent}
              onBlur={(e) => Number(e.target.value) !== c.weight_percent && handleUpdate(c.id, { weight_percent: Number(e.target.value) })}
              className="input-base w-20"
            />
            <span className="text-xs text-slate-400">%</span>
            {!c.attendance_linked && (
              <>
                <input
                  type="number" min={1} defaultValue={c.max_score}
                  onBlur={(e) => Number(e.target.value) !== c.max_score && handleUpdate(c.id, { max_score: Number(e.target.value) })}
                  className="input-base w-20"
                />
                <span className="text-xs text-slate-400">max</span>
              </>
            )}
            <label className="flex items-center gap-1 text-[11px] text-slate-500 whitespace-nowrap">
              <input type="checkbox" checked={c.attendance_linked} onChange={(e) => handleUpdate(c.id, { attendance_linked: e.target.checked })} />
              Auto (attendance %)
            </label>
            <button onClick={() => handleDelete(c.id)} className="text-xs text-red-600 hover:text-red-700 font-medium flex-shrink-0">Delete</button>
          </div>
        ))}
      </div>

      <div className="flex items-end gap-2 pt-3 border-t border-slate-100 dark:border-[#21262d]">
        <div className="flex-1">
          <label className="label">New Category</label>
          <input className="input-base" placeholder="e.g. Quiz 1" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </div>
        <div>
          <label className="label">Weight %</label>
          <input type="number" min={0} max={100} className="input-base w-20" value={form.weight_percent} onChange={(e) => setForm((f) => ({ ...f, weight_percent: Number(e.target.value) }))} />
        </div>
        {!form.attendance_linked && (
          <div>
            <label className="label">Max Score</label>
            <input type="number" min={1} className="input-base w-20" value={form.max_score} onChange={(e) => setForm((f) => ({ ...f, max_score: Number(e.target.value) }))} />
          </div>
        )}
        <label className="flex items-center gap-1 text-xs text-slate-500 mb-2.5 whitespace-nowrap">
          <input type="checkbox" checked={form.attendance_linked} onChange={(e) => setForm((f) => ({ ...f, attendance_linked: e.target.checked }))} />
          Link to attendance %
        </label>
        <button onClick={handleAdd} className="btn-primary btn-sm">Add</button>
      </div>
    </Modal>
  );
}

function GradeScaleModal({ open, onClose, bands, onChanged }: { open: boolean; onClose: () => void; bands: GradeScaleBand[]; onChanged: () => void }) {
  const [form, setForm] = useState({ label: '', min_percent: 0, max_percent: 100, color: '#2563eb' });

  async function handleAdd() {
    if (!form.label.trim()) { toast('error', 'A label is required.'); return; }
    const { error } = await supabase.from('grade_scale_bands').insert({ ...form, label: form.label.trim(), position: bands.length });
    if (error) { toast('error', 'Could not add grade band.'); return; }
    setForm({ label: '', min_percent: 0, max_percent: 100, color: '#2563eb' });
    onChanged();
  }

  async function handleUpdate(id: string, patch: Partial<GradeScaleBand>) {
    const { error } = await supabase.from('grade_scale_bands').update(patch).eq('id', id);
    if (error) { toast('error', 'Could not update grade band.'); return; }
    onChanged();
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from('grade_scale_bands').delete().eq('id', id);
    if (error) { toast('error', 'Could not delete grade band.'); return; }
    onChanged();
  }

  return (
    <Modal open={open} onClose={onClose} title="Grade Scale" subtitle="Custom letter grades (or any labels) for percentage ranges." size="lg">
      <div className="flex flex-col gap-2 mb-4">
        {bands.map((b) => (
          <div key={b.id} className="flex items-center gap-2 p-2 border border-slate-100 dark:border-[#21262d] rounded-xl">
            <input type="color" defaultValue={b.color ?? '#2563eb'} onBlur={(e) => handleUpdate(b.id, { color: e.target.value })} className="w-9 h-9 rounded-lg border border-slate-200 dark:border-[#30363d]" />
            <input defaultValue={b.label} onBlur={(e) => e.target.value.trim() && e.target.value !== b.label && handleUpdate(b.id, { label: e.target.value.trim() })} className="input-base flex-1 min-w-0" />
            <input type="number" min={0} max={100} defaultValue={b.min_percent} onBlur={(e) => Number(e.target.value) !== b.min_percent && handleUpdate(b.id, { min_percent: Number(e.target.value) })} className="input-base w-20" />
            <span className="text-xs text-slate-400">to</span>
            <input type="number" min={0} max={100} defaultValue={b.max_percent} onBlur={(e) => Number(e.target.value) !== b.max_percent && handleUpdate(b.id, { max_percent: Number(e.target.value) })} className="input-base w-20" />
            <span className="text-xs text-slate-400">%</span>
            <button onClick={() => handleDelete(b.id)} className="text-xs text-red-600 hover:text-red-700 font-medium flex-shrink-0">Delete</button>
          </div>
        ))}
      </div>
      <div className="flex items-end gap-2 pt-3 border-t border-slate-100 dark:border-[#21262d]">
        <input type="color" value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} className="w-9 h-9 rounded-lg border border-slate-200 dark:border-[#30363d]" />
        <div className="flex-1">
          <label className="label">Label</label>
          <input className="input-base" placeholder="e.g. A, Excellent" value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} />
        </div>
        <div>
          <label className="label">Min %</label>
          <input type="number" min={0} max={100} className="input-base w-20" value={form.min_percent} onChange={(e) => setForm((f) => ({ ...f, min_percent: Number(e.target.value) }))} />
        </div>
        <div>
          <label className="label">Max %</label>
          <input type="number" min={0} max={100} className="input-base w-20" value={form.max_percent} onChange={(e) => setForm((f) => ({ ...f, max_percent: Number(e.target.value) }))} />
        </div>
        <button onClick={handleAdd} className="btn-primary btn-sm">Add</button>
      </div>
    </Modal>
  );
}

function ImportScoresModal({
  open, onClose, staff, categories, students, onImported,
}: { open: boolean; onClose: () => void; staff: Staff; categories: GradeCategory[]; students: Student[]; onImported: () => void }) {
  const [categoryId, setCategoryId] = useState('');
  const [rows, setRows] = useState<{ roll: string; score: string; studentId?: string; error?: string }[]>([]);
  const [loading, setLoading] = useState(false);

  const byRoll = useMemo(() => {
    const m = new Map<string, Student>();
    students.forEach((s) => m.set(s.roll_number.toUpperCase(), s));
    return m;
  }, [students]);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const lines = String(reader.result).split(/\r?\n/).filter((l) => l.trim());
      const header = lines[0]?.toLowerCase().split(',').map((c) => c.trim());
      const rollIdx = header?.indexOf('roll_number') !== -1 ? header.indexOf('roll_number') : 0;
      const scoreIdx = header?.indexOf('score') !== -1 ? header.indexOf('score') : 1;
      const parsed = lines.slice(1).map((line) => {
        const cells = line.split(',').map((c) => c.trim());
        const roll = (cells[rollIdx] || '').toUpperCase();
        const score = cells[scoreIdx] || '';
        const student = byRoll.get(roll);
        return {
          roll, score,
          studentId: student?.id,
          error: !student ? 'Unknown roll number' : Number.isNaN(Number(score)) ? 'Invalid score' : undefined,
        };
      });
      setRows(parsed);
    };
    reader.readAsText(file);
  }

  async function handleImport() {
    if (!categoryId) { toast('error', 'Pick a category first.'); return; }
    const valid = rows.filter((r) => !r.error && r.studentId);
    if (valid.length === 0) { toast('error', 'No valid rows to import.'); return; }
    setLoading(true);
    const { error } = await supabase.from('grade_entries').upsert(
      valid.map((r) => ({ category_id: categoryId, student_id: r.studentId, score: Number(r.score), updated_by: staff.id })),
      { onConflict: 'category_id,student_id' },
    );
    setLoading(false);
    if (error) { toast('error', 'Import failed: ' + error.message); return; }
    toast('success', `Imported ${valid.length} scores.`);
    setRows([]);
    onImported();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Import Scores" subtitle="CSV with columns: roll_number, score" size="lg">
      <div className="flex flex-col gap-4">
        <div>
          <label className="label">Category</label>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="input-base">
            <option value="">Select a category…</option>
            {categories.filter((c) => !c.attendance_linked).map((c) => <option key={c.id} value={c.id}>{c.name} (out of {c.max_score})</option>)}
          </select>
        </div>
        <input type="file" accept=".csv" onChange={handleFile} className="text-sm" />
        {rows.length > 0 && (
          <div className="max-h-64 overflow-y-auto border border-slate-100 dark:border-[#21262d] rounded-xl">
            <table className="data-table">
              <thead><tr><th>Roll</th><th>Score</th><th>Status</th></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td className="font-mono">{r.roll}</td>
                    <td>{r.score}</td>
                    <td>{r.error ? <span className="badge-red">{r.error}</span> : <span className="badge-green">Ready</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <button onClick={handleImport} disabled={loading || rows.length === 0} className="btn-primary w-full h-11">
          {loading ? 'Importing…' : `Import ${rows.filter((r) => !r.error).length || ''} Scores`}
        </button>
      </div>
    </Modal>
  );
}
