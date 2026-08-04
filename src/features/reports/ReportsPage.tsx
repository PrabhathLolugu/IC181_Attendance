import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../services/supabase';
import { callFunction } from '../../lib/api';
import { toast } from '../../components/ui/Toast';
import { Modal } from '../../components/ui/Modal';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { AttendanceTable } from '../../components/shared/AttendanceTable';
import { ManualAttendanceModal } from '../../components/shared/ManualAttendanceModal';
import { pctColor, formatDate, formatDateTime } from '../../lib/utils';
import type { Staff, Session, Student, StudentAttendanceSummary, AttendanceRecord } from '../../types';

interface Props { staff: Staff; }

const todayISO = () => new Date().toISOString().slice(0, 10);

export function ReportsPage({ staff }: Props) {
  const [tab, setTab] = useState<'students' | 'sessions' | 'day'>('students');
  const [sessions, setSessions] = useState<(Session & { presentCount: number })[]>([]);
  const [summaries, setSummaries] = useState<StudentAttendanceSummary[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [openSession, setOpenSession] = useState<Session | null>(null);
  const [openStudent, setOpenStudent] = useState<StudentAttendanceSummary | null>(null);

  const [studentSearch, setStudentSearch] = useState('');
  const [sessionFrom, setSessionFrom] = useState('');
  const [sessionTo, setSessionTo] = useState('');
  const [dayDate, setDayDate] = useState(todayISO());
  const [exportFrom, setExportFrom] = useState('');
  const [exportTo, setExportTo] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: summaryRows }, { data: sessionRows }, { data: studentRows }] = await Promise.all([
      supabase.from('student_attendance_summary').select('*').order('roll_number'),
      supabase.from('sessions').select('*').order('session_date', { ascending: false }).order('created_at', { ascending: false }).limit(500),
      supabase.from('students').select('*').eq('status', 'active').order('roll_number'),
    ]);

    if (sessionRows?.length) {
      const { data: records } = await supabase.from('attendance_records').select('session_id').in('session_id', sessionRows.map((s) => s.id));
      const counts: Record<string, number> = {};
      (records ?? []).forEach((r) => { counts[r.session_id] = (counts[r.session_id] ?? 0) + 1; });
      setSessions(sessionRows.map((s) => ({ ...s, presentCount: counts[s.id] ?? 0 })));
    } else {
      setSessions([]);
    }

    setSummaries(summaryRows ?? []);
    setStudents(studentRows ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filteredSummaries = useMemo(() => {
    if (!studentSearch.trim()) return summaries;
    const q = studentSearch.toLowerCase();
    return summaries.filter((s) => s.roll_number.toLowerCase().includes(q) || s.name.toLowerCase().includes(q));
  }, [summaries, studentSearch]);

  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => (!sessionFrom || s.session_date >= sessionFrom) && (!sessionTo || s.session_date <= sessionTo));
  }, [sessions, sessionFrom, sessionTo]);

  async function handleExcelExport() {
    setExporting(true);
    try {
      const res = await callFunction<{ url: string }>('excel-sync', {
        fromDate: exportFrom || undefined,
        toDate: exportTo || undefined,
      });
      window.open(res.url, '_blank');
      toast('success', 'Attendance.xlsx is ready.');
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Export failed.');
    } finally {
      setExporting(false);
    }
  }

  function handleCsvExport() {
    const header = ['Roll Number', 'Name', 'Section', 'Present', 'Late', 'Excused', 'Manual', 'Override', 'Total Sessions', 'Attendance %'];
    const rows = filteredSummaries.map((s) => [s.roll_number, s.name, s.section ?? '', s.present_count, s.late_count, s.excused_count, s.manual_count, s.override_count, s.total_sessions, s.attendance_percentage]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'attendance-summary.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="page">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Reports</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Attendance history and exports. Click any session or student to review or correct it.</p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <input type="date" value={exportFrom} onChange={(e) => setExportFrom(e.target.value)} className="input-base w-auto text-xs" title="Export from date (optional)" />
          <span className="text-xs text-slate-400">to</span>
          <input type="date" value={exportTo} onChange={(e) => setExportTo(e.target.value)} className="input-base w-auto text-xs" title="Export to date (optional)" />
          <button onClick={handleCsvExport} className="btn-secondary btn-sm">Export CSV</button>
          <button onClick={handleExcelExport} disabled={exporting} className="btn-primary btn-sm">
            {exporting ? 'Preparing…' : 'Download Excel'}
          </button>
        </div>
      </div>

      <div className="flex gap-1 border-b border-slate-200 dark:border-[#21262d]">
        {(['students', 'sessions', 'day'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {t === 'students' ? 'By Student' : t === 'sessions' ? 'By Session' : 'By Day'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="card p-10 text-center text-sm text-slate-400">Loading…</div>
      ) : tab === 'students' ? (
        <>
          <input className="input-base max-w-xs" placeholder="Search roll number or name…" value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} />
          <div className="card overflow-x-auto">
            <table className="data-table min-w-[820px]">
              <thead>
                <tr><th>Roll</th><th>Name</th><th>Present</th><th>Late</th><th>Excused</th><th>Manual</th><th>Override</th><th>Total Sessions</th><th>Attendance %</th></tr>
              </thead>
              <tbody>
                {filteredSummaries.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-10 text-slate-400 text-sm">No matching students.</td></tr>
                ) : filteredSummaries.map((s) => (
                  <tr key={s.student_id} onClick={() => setOpenStudent(s)} className="cursor-pointer">
                    <td className="font-mono font-medium">{s.roll_number}</td>
                    <td>{s.name}</td>
                    <td>{s.present_count}</td>
                    <td>{s.late_count}</td>
                    <td className="text-purple-500">{s.excused_count}</td>
                    <td>{s.manual_count}</td>
                    <td>{s.override_count}</td>
                    <td className="text-slate-400">{s.total_sessions}</td>
                    <td><span className={`font-semibold ${pctColor(s.attendance_percentage)}`}>{s.attendance_percentage}%</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : tab === 'sessions' ? (
        <>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500">From</label>
            <input type="date" value={sessionFrom} onChange={(e) => setSessionFrom(e.target.value)} className="input-base w-auto" />
            <label className="text-xs text-slate-500">To</label>
            <input type="date" value={sessionTo} onChange={(e) => setSessionTo(e.target.value)} className="input-base w-auto" />
            {(sessionFrom || sessionTo) && (
              <button onClick={() => { setSessionFrom(''); setSessionTo(''); }} className="text-xs text-blue-600">Clear</button>
            )}
          </div>
          <div className="card overflow-x-auto">
            <table className="data-table min-w-[680px]">
              <thead><tr><th>Date</th><th>Course</th><th>Type</th><th>Section</th><th>Status</th><th>Present</th></tr></thead>
              <tbody>
                {filteredSessions.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-10 text-slate-400 text-sm">No sessions in range.</td></tr>
                ) : filteredSessions.map((s) => (
                  <tr key={s.id} onClick={() => setOpenSession(s)} className="cursor-pointer">
                    <td>{formatDate(s.session_date)}</td>
                    <td>{s.course_name}</td>
                    <td>{s.session_type}</td>
                    <td className="text-slate-400">{s.section_filter || 'All'}</td>
                    <td><span className={s.status === 'active' ? 'badge-green' : 'badge-slate'}>{s.status}</span></td>
                    <td className="font-semibold">{s.presentCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500">Date</label>
            <input type="date" value={dayDate} onChange={(e) => setDayDate(e.target.value)} className="input-base w-auto" />
          </div>
          <DayAttendanceView date={dayDate} students={students} />
        </>
      )}

      {openSession && (
        <SessionDetailModal staff={staff} session={openSession} onClose={() => setOpenSession(null)} onChanged={load} />
      )}
      {openStudent && (
        <StudentDetailModal staff={staff} summary={openStudent} onClose={() => setOpenStudent(null)} onChanged={load} />
      )}
    </main>
  );
}

function SessionDetailModal({
  staff, session, onClose, onChanged,
}: { staff: Staff; session: Session; onClose: () => void; onChanged: () => void }) {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showManual, setShowManual] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('attendance_records').select('*').eq('session_id', session.id).order('marked_at', { ascending: false });
    setRecords(data ?? []);
    setLoading(false);
  }, [session.id]);

  useEffect(() => { load(); }, [load]);

  function handleChanged() {
    load();
    onChanged();
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`${session.course_name} — ${session.session_type}`}
      subtitle={`${formatDateTime(session.created_at)} · ${session.section_filter || 'All sections'} · ${session.status}`}
      footer={<button onClick={() => setShowManual(true)} className="btn-secondary btn-sm">+ Add Student</button>}
    >
      {loading ? (
        <div className="py-10 text-center text-sm text-slate-400">Loading…</div>
      ) : (
        <AttendanceTable staff={staff} records={records} onChanged={handleChanged} title="" emptyText="No attendance recorded for this session." />
      )}
      <ManualAttendanceModal open={showManual} onClose={() => setShowManual(false)} session={session} onMarked={handleChanged} />
    </Modal>
  );
}

interface MergedDay { session: Session; record: AttendanceRecord | null; }

function StudentDetailModal({
  staff, summary, onClose, onChanged,
}: { staff: Staff; summary: StudentAttendanceSummary; onClose: () => void; onChanged: () => void }) {
  const [rows, setRows] = useState<MergedDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState<AttendanceRecord['status']>('present');

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: allSessions }, { data: myRecords }] = await Promise.all([
      supabase.from('sessions').select('*').eq('status', 'ended').order('session_date', { ascending: false }),
      supabase.from('attendance_records').select('*').eq('student_id', summary.student_id),
    ]);
    const recordBySession = new Map((myRecords ?? []).map((r) => [r.session_id, r]));
    const applicable = (allSessions ?? []).filter((s) => !s.section_filter || s.section_filter === summary.section);
    setRows(applicable.map((s) => ({ session: s, record: recordBySession.get(s.id) ?? null })));
    setLoading(false);
  }, [summary.student_id, summary.section]);

  useEffect(() => { load(); }, [load]);

  function handleChanged() {
    load();
    onChanged();
  }

  async function saveEdit(record: AttendanceRecord) {
    setBusyId(record.id);
    try {
      await callFunction('attendance-edit', { recordId: record.id, status: editStatus, notes: record.notes ?? null });
      toast('success', 'Attendance updated.');
      setEditingId(null);
      handleChanged();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not update attendance.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(record: AttendanceRecord) {
    if (!window.confirm('Remove this attendance record?')) return;
    setBusyId(record.id);
    try {
      await callFunction('attendance-delete', { recordId: record.id });
      toast('success', 'Attendance record removed.');
      handleChanged();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not delete attendance record.');
    } finally {
      setBusyId(null);
    }
  }

  const EDITABLE: AttendanceRecord['status'][] = ['present', 'late', 'manual', 'override', 'excused'];

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={summary.name}
      subtitle={`${summary.roll_number} · ${summary.section ?? 'No section'} · ${summary.attendance_percentage}% overall`}
    >
      {loading ? (
        <div className="py-10 text-center text-sm text-slate-400">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-400">No sessions have ended yet for this student's section.</div>
      ) : (
        <div className="max-h-[60vh] overflow-y-auto">
          <table className="data-table">
            <thead><tr><th>Date</th><th>Course</th><th>Type</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rows.map(({ session, record }) => (
                <tr key={session.id}>
                  <td>{formatDate(session.session_date)}</td>
                  <td>{session.course_name}</td>
                  <td>{session.session_type}</td>
                  <td>
                    {record ? (
                      editingId === record.id ? (
                        <select
                          value={editStatus}
                          onChange={(e) => setEditStatus(e.target.value as AttendanceRecord['status'])}
                          className="text-xs border border-slate-200 dark:border-[#30363d] rounded-lg px-2 py-1 bg-white dark:bg-[#0d1117]"
                        >
                          {EDITABLE.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      ) : (
                        <StatusBadge status={record.status} />
                      )
                    ) : (
                      <span className="badge-red">Absent</span>
                    )}
                  </td>
                  <td>
                    {record && (
                      <div className="flex gap-2 justify-end">
                        {editingId === record.id ? (
                          <>
                            <button onClick={() => saveEdit(record)} disabled={busyId === record.id} className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">Save</button>
                            <button onClick={() => setEditingId(null)} className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => { setEditingId(record.id); setEditStatus(record.status); }} className="text-xs text-blue-600 hover:text-blue-700 font-medium">Edit</button>
                            {staff.role === 'admin' && (
                              <button onClick={() => handleDelete(record)} disabled={busyId === record.id} className="text-xs text-red-600 hover:text-red-700 font-medium">Delete</button>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

function DayAttendanceView({ date, students }: { date: string; students: Student[] }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: sess } = await supabase.from('sessions').select('*').eq('session_date', date).order('created_at');
      if (cancelled) return;
      setSessions(sess ?? []);
      if (sess?.length) {
        const { data: recs } = await supabase.from('attendance_records').select('*').in('session_id', sess.map((s) => s.id));
        if (!cancelled) setRecords(recs ?? []);
      } else {
        setRecords([]);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [date]);

  const filteredStudents = useMemo(() => {
    if (!search.trim()) return students;
    const q = search.toLowerCase();
    return students.filter((s) => s.roll_number.toLowerCase().includes(q) || s.name.toLowerCase().includes(q));
  }, [students, search]);

  if (loading) return <div className="card p-10 text-center text-sm text-slate-400">Loading…</div>;
  if (sessions.length === 0) return <div className="card p-10 text-center text-sm text-slate-400">No sessions on this date.</div>;

  return (
    <div className="flex flex-col gap-3">
      <input className="input-base max-w-xs" placeholder="Search roll number or name…" value={search} onChange={(e) => setSearch(e.target.value)} />
      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Roll</th><th>Name</th>
              {sessions.map((s) => (
                <th key={s.id}>{s.course_name} · {s.session_type}{s.section_filter ? ` (${s.section_filter})` : ''}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredStudents.map((student) => (
              <tr key={student.id}>
                <td className="font-mono font-medium">{student.roll_number}</td>
                <td>{student.name}</td>
                {sessions.map((s) => {
                  const applicable = !s.section_filter || s.section_filter === student.section;
                  const record = records.find((r) => r.session_id === s.id && r.student_id === student.id);
                  return (
                    <td key={s.id}>
                      {!applicable ? (
                        <span className="text-slate-300 dark:text-slate-600">—</span>
                      ) : record ? (
                        <StatusBadge status={record.status} />
                      ) : (
                        <span className="badge-red">Absent</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
