import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../services/supabase';
import { Modal } from '../../components/ui/Modal';
import { toast } from '../../components/ui/Toast';
import { pctColor } from '../../lib/utils';
import type { Staff, Student, StudentAttendanceSummary, StudentStatus } from '../../types';

interface Props { staff: Staff; courseName: string; }

const PAGE_SIZE = 20;
const emptyForm = { roll_number: '', name: '', email: '', phone: '', department: '', program: '', semester: '', group_label: '', batch: '' };

export function StudentsPage({ staff, courseName }: Props) {
  const [students, setStudents] = useState<Student[]>([]);
  const [summaries, setSummaries] = useState<Record<string, StudentAttendanceSummary>>({});
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StudentStatus | 'all'>('active');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Student | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkGroup, setBulkGroup] = useState('');

  const loadSummaries = useCallback(async () => {
    const { data: summaryRows } = await supabase.rpc('student_attendance_summary', { p_course_name: courseName });
    const map: Record<string, StudentAttendanceSummary> = {};
    (summaryRows ?? []).forEach((s: StudentAttendanceSummary) => { map[s.roll_number] = s; });
    setSummaries(map);
  }, [courseName]);

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('students').select('*', { count: 'exact' }).order('roll_number');
    if (statusFilter !== 'all') query = query.eq('status', statusFilter);
    if (search.trim()) query = query.or(`roll_number.ilike.%${search}%,name.ilike.%${search}%`);
    const { data, count } = await query.range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    setStudents(data ?? []);
    setTotal(count ?? 0);
    setSelected(new Set());
    await loadSummaries();
    setLoading(false);
  }, [search, statusFilter, page, loadSummaries]);

  useEffect(() => { load(); }, [load]);

  // Attendance changes elsewhere shouldn't reset the roster or an in-progress
  // bulk-group selection -- just refresh the percentage numbers live.
  useEffect(() => {
    const channel = supabase
      .channel('students_summary_watch')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_records' }, loadSummaries)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, loadSummaries)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadSummaries]);

  async function handleSoftDelete(student: Student) {
    if (!window.confirm(`Remove ${student.name} (${student.roll_number})? This can be restored later.`)) return;
    const { error } = await supabase.from('students').update({ status: 'deleted', updated_by: staff.id }).eq('id', student.id);
    if (error) { toast('error', 'Could not remove student.'); return; }
    toast('success', 'Student removed.');
    load();
  }

  async function handleRestore(student: Student) {
    const { error } = await supabase.from('students').update({ status: 'active', updated_by: staff.id }).eq('id', student.id);
    if (error) { toast('error', 'Could not restore student.'); return; }
    toast('success', 'Student restored.');
    load();
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) => (prev.size === students.length ? new Set() : new Set(students.map((s) => s.id))));
  }

  async function handleBulkAssignGroup() {
    if (selected.size === 0 || !bulkGroup.trim()) return;
    const { error } = await supabase
      .from('students')
      .update({ group_label: bulkGroup.trim().toUpperCase(), updated_by: staff.id })
      .in('id', Array.from(selected));
    if (error) { toast('error', 'Could not assign group.'); return; }
    toast('success', `Assigned ${selected.size} student(s) to Group ${bulkGroup.trim().toUpperCase()}.`);
    setBulkGroup('');
    load();
  }

  return (
    <main className="page">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Students</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{total} {statusFilter === 'all' ? '' : statusFilter} students · Attendance % shown for {courseName}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowImport(true)} className="btn-secondary btn-sm">Import CSV</button>
          <button onClick={() => setShowAdd(true)} className="btn-primary btn-sm">Add Student</button>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <input
          className="input-base max-w-xs"
          placeholder="Search roll number or name…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
        />
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as StudentStatus | 'all'); setPage(0); }} className="input-base w-auto">
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="graduated">Graduated</option>
          <option value="deleted">Removed</option>
          <option value="all">All</option>
        </select>
      </div>

      {selected.size > 0 && (
        <div className="card p-3 flex items-center gap-3 bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20">
          <span className="text-sm font-medium text-blue-900 dark:text-blue-300">{selected.size} selected</span>
          <input
            className="input-base w-32"
            placeholder="Group e.g. B"
            value={bulkGroup}
            onChange={(e) => setBulkGroup(e.target.value)}
            maxLength={3}
          />
          <button onClick={handleBulkAssignGroup} disabled={!bulkGroup.trim()} className="btn-primary btn-sm">Assign Group</button>
          <button onClick={() => setSelected(new Set())} className="btn-ghost btn-sm">Clear selection</button>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="data-table min-w-[760px]">
          <thead>
            <tr>
              <th><input type="checkbox" checked={selected.size > 0 && selected.size === students.length} onChange={toggleSelectAll} /></th>
              <th>Roll</th><th>Name</th><th>Dept / Program</th><th>Group</th><th>Attendance %</th><th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="text-center py-10 text-slate-400 text-sm">Loading…</td></tr>
            ) : students.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-10 text-slate-400 text-sm">No students found.</td></tr>
            ) : (
              students.map((s) => {
                const summary = summaries[s.roll_number];
                return (
                  <tr key={s.id}>
                    <td><input type="checkbox" checked={selected.has(s.id)} onChange={() => toggleSelect(s.id)} /></td>
                    <td className="font-mono font-medium">{s.roll_number}</td>
                    <td>{s.name}</td>
                    <td className="text-slate-500 dark:text-slate-400 text-xs">{[s.department, s.program].filter(Boolean).join(' · ') || '—'}</td>
                    <td>{s.group_label ? <span className="badge-blue">{s.group_label}</span> : <span className="text-slate-300 dark:text-slate-600 text-xs">Unassigned</span>}</td>
                    <td>
                      {summary ? (
                        <span className={`font-semibold ${pctColor(summary.attendance_percentage)}`}>{summary.attendance_percentage}%</span>
                      ) : '—'}
                    </td>
                    <td><span className="badge-slate">{s.status}</span></td>
                    <td>
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => setEditing(s)} className="text-xs text-blue-600 hover:text-blue-700 font-medium">Edit</button>
                        {s.status === 'deleted' ? (
                          <button onClick={() => handleRestore(s)} className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">Restore</button>
                        ) : (
                          <button onClick={() => handleSoftDelete(s)} className="text-xs text-red-600 hover:text-red-700 font-medium">Remove</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="btn-outline btn-sm disabled:opacity-40">Previous</button>
          <span className="text-xs text-slate-400">Page {page + 1} of {Math.ceil(total / PAGE_SIZE)}</span>
          <button disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage((p) => p + 1)} className="btn-outline btn-sm disabled:opacity-40">Next</button>
        </div>
      )}

      <StudentFormModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        staff={staff}
        onSaved={() => { setShowAdd(false); load(); }}
      />
      <StudentFormModal
        open={!!editing}
        onClose={() => setEditing(null)}
        staff={staff}
        student={editing}
        onSaved={() => { setEditing(null); load(); }}
      />
      <ImportModal open={showImport} onClose={() => setShowImport(false)} staff={staff} onImported={() => { setShowImport(false); load(); }} />
    </main>
  );
}

function StudentFormModal({
  open, onClose, staff, student, onSaved,
}: { open: boolean; onClose: () => void; staff: Staff; student?: Student | null; onSaved: () => void }) {
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (student) {
      setForm({
        roll_number: student.roll_number, name: student.name, email: student.email ?? '', phone: student.phone ?? '',
        department: student.department ?? '', program: student.program ?? '', semester: student.semester ?? '',
        group_label: student.group_label ?? '', batch: student.batch ?? '',
      });
    } else {
      setForm(emptyForm);
    }
    setError('');
  }, [student, open]);

  async function handleSave() {
    if (!form.roll_number.trim() || !form.name.trim()) { setError('Roll number and name are required.'); return; }
    setLoading(true);
    setError('');
    const payload = {
      ...form,
      roll_number: form.roll_number.trim().toUpperCase(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      department: form.department.trim() || null,
      program: form.program.trim() || null,
      semester: form.semester.trim() || null,
      group_label: form.group_label.trim().toUpperCase() || null,
      batch: form.batch.trim() || null,
    };

    const { error: dbErr } = student
      ? await supabase.from('students').update({ ...payload, updated_by: staff.id }).eq('id', student.id)
      : await supabase.from('students').insert({ ...payload, created_by: staff.id });

    setLoading(false);
    if (dbErr) {
      setError(dbErr.code === '23505' ? 'This roll number is already registered.' : 'Could not save. Please try again.');
      return;
    }
    toast('success', student ? 'Student updated.' : 'Student added.');
    onSaved();
  }

  return (
    <Modal open={open} onClose={onClose} title={student ? 'Edit Student' : 'Add Student'} size="md">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Roll Number *" value={form.roll_number} onChange={(v) => setForm((f) => ({ ...f, roll_number: v }))} disabled={!!student} />
        <Field label="Full Name *" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} />
        <Field label="Email" value={form.email} onChange={(v) => setForm((f) => ({ ...f, email: v }))} />
        <Field label="Phone" value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} />
        <Field label="Department" value={form.department} onChange={(v) => setForm((f) => ({ ...f, department: v }))} />
        <Field label="Program" value={form.program} onChange={(v) => setForm((f) => ({ ...f, program: v }))} />
        <Field label="Semester" value={form.semester} onChange={(v) => setForm((f) => ({ ...f, semester: v }))} />
        <Field label="Group (e.g. B)" value={form.group_label} onChange={(v) => setForm((f) => ({ ...f, group_label: v }))} />
        <Field label="Batch" value={form.batch} onChange={(v) => setForm((f) => ({ ...f, batch: v }))} />
      </div>
      {error && <div className="mt-3 px-4 py-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl text-red-700 dark:text-red-400 text-xs">{error}</div>}
      <button onClick={handleSave} disabled={loading} className="btn-primary w-full h-11 mt-5">{loading ? 'Saving…' : 'Save'}</button>
    </Modal>
  );
}

function Field({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="input-base" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

interface ParsedRow { roll_number: string; name: string; email?: string; phone?: string; department?: string; program?: string; semester?: string; group_label?: string; batch?: string; error?: string; }

function parseCsv(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const splitLine = (line: string) => line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
  const header = splitLine(lines[0]).map((h) => h.toLowerCase());
  const col = (name: string) => header.indexOf(name);

  const rollIdx = col('roll_number') !== -1 ? col('roll_number') : col('roll');
  const nameIdx = col('name');
  const groupIdx = col('group') !== -1 ? col('group') : col('group_label');
  if (rollIdx === -1 || nameIdx === -1) return [];

  return lines.slice(1).map((line) => {
    const cells = splitLine(line);
    const row: ParsedRow = {
      roll_number: (cells[rollIdx] || '').toUpperCase(),
      name: cells[nameIdx] || '',
      email: cells[col('email')] || undefined,
      phone: cells[col('phone')] || undefined,
      department: cells[col('department')] || undefined,
      program: cells[col('program')] || undefined,
      semester: cells[col('semester')] || undefined,
      group_label: groupIdx !== -1 ? (cells[groupIdx] || undefined)?.toUpperCase() : undefined,
      batch: cells[col('batch')] || undefined,
    };
    if (!row.roll_number || !row.name) row.error = 'Missing roll number or name';
    return row;
  });
}

function ImportModal({ open, onClose, staff, onImported }: { open: boolean; onClose: () => void; staff: Staff; onImported: () => void }) {
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setRows(parseCsv(String(reader.result)));
    reader.readAsText(file);
  }

  async function handleImport() {
    const valid = rows.filter((r) => !r.error);
    if (valid.length === 0) { setError('No valid rows to import.'); return; }
    setLoading(true);
    setError('');
    const { error: dbErr } = await supabase.from('students').upsert(
      valid.map((r) => ({
        roll_number: r.roll_number, name: r.name, email: r.email || null, phone: r.phone || null,
        department: r.department || null, program: r.program || null, semester: r.semester || null,
        group_label: r.group_label || null, batch: r.batch || null, created_by: staff.id,
      })),
      { onConflict: 'roll_number', ignoreDuplicates: true },
    );
    setLoading(false);
    if (dbErr) { setError('Import failed: ' + dbErr.message); return; }
    toast('success', `Imported ${valid.length} students.`);
    setRows([]);
    onImported();
  }

  return (
    <Modal open={open} onClose={onClose} title="Import Students" subtitle="CSV with columns: roll_number, name, email, phone, department, program, semester, group, batch" size="lg">
      <input type="file" accept=".csv" onChange={handleFile} className="text-sm" />
      {rows.length > 0 && (
        <div className="mt-4">
          <p className="text-xs text-slate-500 mb-2">
            {rows.filter((r) => !r.error).length} valid · {rows.filter((r) => r.error).length} skipped
          </p>
          <div className="max-h-64 overflow-y-auto border border-slate-100 dark:border-[#21262d] rounded-xl">
            <table className="data-table">
              <thead><tr><th>Roll</th><th>Name</th><th>Group</th><th>Status</th></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td className="font-mono">{r.roll_number || '—'}</td>
                    <td>{r.name || '—'}</td>
                    <td>{r.group_label || '—'}</td>
                    <td>{r.error ? <span className="badge-red">{r.error}</span> : <span className="badge-green">Ready</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {error && <div className="mt-3 px-4 py-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl text-red-700 dark:text-red-400 text-xs">{error}</div>}
      <button onClick={handleImport} disabled={loading || rows.length === 0} className="btn-primary w-full h-11 mt-5">
        {loading ? 'Importing…' : `Import ${rows.filter((r) => !r.error).length || ''} Students`}
      </button>
    </Modal>
  );
}
