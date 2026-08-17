import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../services/supabase';
import { callFunction } from '../../lib/api';
import { toast } from '../../components/ui/Toast';
import { Modal } from '../../components/ui/Modal';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { AttendanceTable } from '../../components/shared/AttendanceTable';
import { ManualAttendanceModal } from '../../components/shared/ManualAttendanceModal';
import { pctColor, formatDate, formatDateTime } from '../../lib/utils';
import { SESSION_TYPE_PRESETS } from '../../types';
import type { Staff, Session, Student, StudentAttendanceSummary, AttendanceRecord } from '../../types';

interface Props { staff: Staff; courseName: string; focusSessionId?: string | null; onFocusHandled?: () => void; }

const todayISO = () => new Date().toISOString().slice(0, 10);

interface SortState { key: string; dir: 'asc' | 'desc'; }

function compareValues(av: unknown, bv: unknown): number {
  const a = av ?? '';
  const b = bv ?? '';
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

function sortRows<T>(rows: T[], sort: SortState): T[] {
  return [...rows].sort((a, b) => {
    const av = (a as Record<string, unknown>)[sort.key];
    const bv = (b as Record<string, unknown>)[sort.key];
    const cmp = compareValues(av, bv);
    return sort.dir === 'asc' ? cmp : -cmp;
  });
}

function Th({ label, sortKey, sort, onSort, className }: { label: string; sortKey: string; sort: SortState; onSort: (key: string) => void; className?: string }) {
  const active = sort.key === sortKey;
  return (
    <th onClick={() => onSort(sortKey)} className={`cursor-pointer select-none hover:text-slate-700 dark:hover:text-slate-300 ${className ?? ''}`}>
      <span className="inline-flex items-center gap-1">
        {label}
        <span className={`text-[9px] ${active ? 'text-blue-600' : 'text-slate-300 dark:text-slate-600'}`}>
          {active ? (sort.dir === 'asc' ? '▲' : '▼') : '▲'}
        </span>
      </span>
    </th>
  );
}

export function ReportsPage({ staff, courseName, focusSessionId, onFocusHandled }: Props) {
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
  const [studentSort, setStudentSort] = useState<SortState>({ key: 'roll_number', dir: 'asc' });
  const [sessionSort, setSessionSort] = useState<SortState>({ key: 'session_date', dir: 'desc' });

  function toggleStudentSort(key: string) {
    setStudentSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  }
  function toggleSessionSort(key: string) {
    setSessionSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  }

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: summaryRows }, { data: sessionRows }, { data: studentRows }] = await Promise.all([
      supabase.rpc('student_attendance_summary', { p_course_name: courseName }),
      supabase.from('sessions').select('*, attendance_records(count)').eq('course_name', courseName).order('session_date', { ascending: false }).order('created_at', { ascending: false }).limit(500),
      supabase.from('students').select('*').eq('status', 'active').order('roll_number'),
    ]);

    if (sessionRows?.length) {
      setSessions(sessionRows.map((s) => {
        // Supabase returns related counts as an array with a single object: [{ count: number }]
        const countData = s.attendance_records as unknown as [{ count: number }] | undefined;
        const presentCount = countData?.[0]?.count ?? 0;
        return { ...s, presentCount };
      }));
    } else {
      setSessions([]);
    }

    setSummaries((summaryRows as StudentAttendanceSummary[]) ?? []);
    setStudents(studentRows ?? []);
    setLoading(false);
  }, [courseName]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!focusSessionId) return;
    const match = sessions.find((s) => s.id === focusSessionId);
    if (match) {
      setTab('sessions');
      setOpenSession(match);
      onFocusHandled?.();
      return;
    }
    if (!loading) {
      supabase.from('sessions').select('*').eq('id', focusSessionId).maybeSingle().then(({ data }) => {
        if (data) { setTab('sessions'); setOpenSession(data); }
        onFocusHandled?.();
      });
    }
  }, [focusSessionId, sessions, loading, onFocusHandled]);

  useEffect(() => {
    const channel = supabase
      .channel('reports_watch')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_records' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'students' }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  const filteredSummaries = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    const base = q ? summaries.filter((s) => s.roll_number.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)) : summaries;
    return sortRows(base, studentSort);
  }, [summaries, studentSearch, studentSort]);

  const filteredSessions = useMemo(() => {
    const base = sessions.filter((s) => (!sessionFrom || s.session_date >= sessionFrom) && (!sessionTo || s.session_date <= sessionTo));
    return sortRows(base, sessionSort);
  }, [sessions, sessionFrom, sessionTo, sessionSort]);

  async function handleExcelExport() {
    setExporting(true);
    try {
      const res = await callFunction<{ url: string }>('excel-sync', {
        courseName,
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
    const header = ['Roll Number', 'Name', 'Group', 'Present', 'Excused', 'Manual', 'Override', 'Total Sessions', 'Attendance %'];
    const rows = filteredSummaries.map((s) => [s.roll_number, s.name, s.group_label ?? '', s.present_count, s.excused_count, s.manual_count, s.override_count, s.total_sessions, s.attendance_percentage]);
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
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Reports — {courseName}</h1>
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
                <tr>
                  <Th label="Roll / Emp ID" sortKey="roll_number" sort={studentSort} onSort={toggleStudentSort} />
                  <Th label="Name" sortKey="name" sort={studentSort} onSort={toggleStudentSort} />
                  <Th label="Present" sortKey="present_count" sort={studentSort} onSort={toggleStudentSort} />
                  <Th label="Excused" sortKey="excused_count" sort={studentSort} onSort={toggleStudentSort} />
                  <Th label="Manual" sortKey="manual_count" sort={studentSort} onSort={toggleStudentSort} />
                  <Th label="Override" sortKey="override_count" sort={studentSort} onSort={toggleStudentSort} />
                  <Th label="Total Sessions" sortKey="total_sessions" sort={studentSort} onSort={toggleStudentSort} />
                  <Th label="Attendance %" sortKey="attendance_percentage" sort={studentSort} onSort={toggleStudentSort} />
                </tr>
              </thead>
              <tbody>
                {filteredSummaries.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-10 text-slate-400 text-sm">No matching students.</td></tr>
                ) : filteredSummaries.map((s) => (
                  <tr key={s.student_id} onClick={() => setOpenStudent(s)} className="cursor-pointer">
                    <td className="font-mono font-medium">{s.roll_number}</td>
                    <td>{s.name}</td>
                    <td>{s.present_count}</td>
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
              <thead>
                <tr>
                  <Th label="Date" sortKey="session_date" sort={sessionSort} onSort={toggleSessionSort} />
                  <Th label="Course" sortKey="course_name" sort={sessionSort} onSort={toggleSessionSort} />
                  <Th label="Type" sortKey="session_type" sort={sessionSort} onSort={toggleSessionSort} />
                  <Th label="Section" sortKey="group_filter" sort={sessionSort} onSort={toggleSessionSort} />
                  <Th label="Status" sortKey="status" sort={sessionSort} onSort={toggleSessionSort} />
                  <Th label="Present" sortKey="presentCount" sort={sessionSort} onSort={toggleSessionSort} />
                </tr>
              </thead>
              <tbody>
                {filteredSessions.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-10 text-slate-400 text-sm">No sessions in range.</td></tr>
                ) : filteredSessions.map((s) => (
                  <tr key={s.id} onClick={() => setOpenSession(s)} className="cursor-pointer">
                    <td>{formatDate(s.session_date)}</td>
                    <td>{s.course_name}</td>
                    <td>{s.session_type}</td>
                    <td className="text-slate-400">{s.group_filter || 'All'}</td>
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
          <DayAttendanceView date={dayDate} students={students} courseName={courseName} />
        </>
      )}

      {openSession && (
        <SessionDetailModal staff={staff} session={openSession} onClose={() => setOpenSession(null)} onChanged={load} />
      )}
      {openStudent && (
        <StudentDetailModal staff={staff} summary={openStudent} courseName={courseName} onClose={() => setOpenStudent(null)} onChanged={load} />
      )}
    </main>
  );
}

function SessionDetailModal({
  staff, session, onClose, onChanged,
}: { staff: Staff; session: Session; onClose: () => void; onChanged: () => void }) {
  const [current, setCurrent] = useState(session);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showManual, setShowManual] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('attendance_records').select('*').eq('session_id', current.id).order('marked_at', { ascending: false });
    setRecords(data ?? []);
    setLoading(false);
  }, [current.id]);

  useEffect(() => { load(); }, [load]);

  function handleChanged() {
    load();
    onChanged();
  }

  function handleEdited(updated: Session) {
    setCurrent(updated);
    setShowEdit(false);
    onChanged();
  }

  async function handleDelete() {
    const count = records.length;
    const warning = count > 0
      ? ` This will permanently remove it and all ${count} attendance record${count === 1 ? '' : 's'} tied to it.`
      : '';
    if (!window.confirm(`Delete this session?${warning} This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await callFunction('session-delete', { sessionId: current.id });
      toast('success', 'Session deleted.');
      onChanged();
      onClose();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not delete the session.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`${current.course_name} — ${current.session_type}`}
      subtitle={`${formatDateTime(current.created_at)} · ${current.group_filter || 'All groups'} · ${current.status}`}
      footer={
        <>
          {staff.role === 'admin' && (
            <button onClick={handleDelete} disabled={deleting} className="btn-danger btn-sm mr-auto">
              {deleting ? 'Deleting…' : 'Delete Session'}
            </button>
          )}
          <button onClick={() => setShowEdit(true)} className="btn-secondary btn-sm">Edit Session</button>
          <button onClick={() => setShowManual(true)} className="btn-secondary btn-sm">+ Add Student</button>
        </>
      }
    >
      {loading ? (
        <div className="py-10 text-center text-sm text-slate-400">Loading…</div>
      ) : (
        <AttendanceTable staff={staff} records={records} onChanged={handleChanged} title="" emptyText="No attendance recorded for this session." />
      )}
      <ManualAttendanceModal open={showManual} onClose={() => setShowManual(false)} session={current} onMarked={handleChanged} />
      <EditSessionModal open={showEdit} onClose={() => setShowEdit(false)} session={current} onSaved={handleEdited} />
    </Modal>
  );
}

function EditSessionModal({
  open, onClose, session, onSaved,
}: { open: boolean; onClose: () => void; session: Session; onSaved: (updated: Session) => void }) {
  const [courseName, setCourseName] = useState(session.course_name);
  const [sessionType, setSessionType] = useState(session.session_type);
  const [sessionDate, setSessionDate] = useState(session.session_date);
  const [audience, setAudience] = useState<'general' | 'group'>(session.group_filter ? 'group' : 'general');
  const [groupFilter, setGroupFilter] = useState(session.group_filter ?? '');
  const [radiusMeters, setRadiusMeters] = useState(session.radius_meters);
  const [allowOverride, setAllowOverride] = useState(session.allow_gps_override);
  const [notes, setNotes] = useState(session.notes ?? '');
  const [groupChoices, setGroupChoices] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setCourseName(session.course_name);
    setSessionType(session.session_type);
    setSessionDate(session.session_date);
    setAudience(session.group_filter ? 'group' : 'general');
    setGroupFilter(session.group_filter ?? '');
    setRadiusMeters(session.radius_meters);
    setAllowOverride(session.allow_gps_override);
    setNotes(session.notes ?? '');
    setError('');
    supabase.from('students').select('group_label').eq('status', 'active').not('group_label', 'is', null).then(({ data }) => {
      setGroupChoices(Array.from(new Set((data ?? []).map((g) => g.group_label as string))).sort());
    });
  }, [open, session]);

  async function handleSave() {
    setError('');
    const finalCourse = courseName.trim();
    const finalType = sessionType.trim();
    const finalGroup = audience === 'group' ? groupFilter.trim().toUpperCase() : '';
    if (!finalCourse) { setError('Please name the course.'); return; }
    if (!finalType) { setError('Please name the session type.'); return; }
    if (audience === 'group' && !finalGroup) { setError('Please pick or type a group.'); return; }
    if (!sessionDate) { setError('Please pick a date.'); return; }
    setLoading(true);
    try {
      const res = await callFunction<{ session: Session }>('session-edit', {
        sessionId: session.id,
        courseName: finalCourse,
        sessionType: finalType,
        sessionDate,
        groupFilter: finalGroup || undefined,
        notes: notes.trim() || undefined,
        radiusMeters,
        allowGpsOverride: allowOverride,
      });
      toast('success', 'Session updated.');
      onSaved(res.session);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update the session.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit Session" subtitle="Fix a mistake — course, type, date, audience, or GPS settings." size="sm">
      <div className="flex flex-col gap-4">
        <div>
          <label className="label">Course</label>
          <input className="input-base" value={courseName} onChange={(e) => setCourseName(e.target.value)} />
        </div>
        <div>
          <label className="label">Session Type</label>
          <input className="input-base" value={sessionType} onChange={(e) => setSessionType(e.target.value)} list="edit-session-type-presets" />
          <datalist id="edit-session-type-presets">
            {SESSION_TYPE_PRESETS.map((t) => <option key={t} value={t} />)}
          </datalist>
        </div>
        <div>
          <label className="label">Date</label>
          <input type="date" className="input-base" value={sessionDate} onChange={(e) => setSessionDate(e.target.value)} />
        </div>
        <div>
          <label className="label">Audience</label>
          <select value={audience} onChange={(e) => setAudience(e.target.value as 'general' | 'group')} className="input-base">
            <option value="general">General — everyone can attend</option>
            <option value="group">Specific group</option>
          </select>
          {audience === 'group' && (
            <div className="mt-2">
              <input
                className="input-base"
                placeholder="e.g. I"
                maxLength={3}
                value={groupFilter}
                onChange={(e) => setGroupFilter(e.target.value)}
                list="edit-session-group-choices"
              />
              <datalist id="edit-session-group-choices">
                {groupChoices.map((g) => <option key={g} value={g} />)}
              </datalist>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">GPS Radius (m)</label>
            <input type="number" min={10} className="input-base" value={radiusMeters} onChange={(e) => setRadiusMeters(Number(e.target.value))} />
          </div>
          <div className="flex items-end pb-2.5">
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
              <input type="checkbox" checked={allowOverride} onChange={(e) => setAllowOverride(e.target.checked)} className="rounded" />
              Allow GPS override
            </label>
          </div>
        </div>
        <div>
          <label className="label">Notes</label>
          <input className="input-base" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
        </div>
        {error && <div className="px-4 py-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl text-red-700 dark:text-red-400 text-xs">{error}</div>}
        <button onClick={handleSave} disabled={loading} className="btn-primary w-full h-11">
          {loading ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </Modal>
  );
}

interface MergedDay { session: Session; record: AttendanceRecord | null; }

function StudentDetailModal({
  staff, summary, courseName, onClose, onChanged,
}: { staff: Staff; summary: StudentAttendanceSummary; courseName: string; onClose: () => void; onChanged: () => void }) {
  const [rows, setRows] = useState<MergedDay[]>([]);
  const [profile, setProfile] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState<AttendanceRecord['status']>('present');

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: allSessions }, { data: myRecords }, { data: studentRow }] = await Promise.all([
      supabase.from('sessions').select('*').eq('status', 'ended').eq('course_name', courseName).order('session_date', { ascending: false }),
      supabase.from('attendance_records').select('*').eq('student_id', summary.student_id),
      supabase.from('students').select('*').eq('id', summary.student_id).maybeSingle(),
    ]);
    const recordBySession = new Map((myRecords ?? []).map((r) => [r.session_id, r]));
    const applicable = (allSessions ?? []).filter((s) => !s.group_filter || s.group_filter === summary.group_label);
    setRows(applicable.map((s) => ({ session: s, record: recordBySession.get(s.id) ?? null })));
    setProfile(studentRow ?? null);
    setLoading(false);
  }, [summary.student_id, summary.group_label, courseName]);

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

  const EDITABLE: AttendanceRecord['status'][] = ['present', 'manual', 'override', 'excused'];

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={summary.name}
      subtitle={`${summary.roll_number} · ${summary.group_label ?? 'No group'} · ${summary.attendance_percentage}% overall`}
    >
      {profile && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3 mb-4 pb-4 border-b border-slate-100 dark:border-[#21262d]">
          <ProfileField label="Roll / Emp ID" value={profile.roll_number} />
          <ProfileField label="Role" value={profile.role_type === 'faculty' ? 'Faculty / Staff' : 'Student'} />
          <ProfileField label="School / Centre" value={profile.department} />
          {profile.role_type !== 'faculty' && <ProfileField label="Program" value={profile.program} />}
        </div>
      )}
      {loading ? (
        <div className="py-10 text-center text-sm text-slate-400">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-400">No sessions have ended yet that apply to this student.</div>
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

function ProfileField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-[11px] text-slate-400 uppercase tracking-wide font-medium">{label}</p>
      <p className="text-sm text-slate-800 dark:text-slate-200 mt-0.5">{value || <span className="text-slate-300 dark:text-slate-600">—</span>}</p>
    </div>
  );
}

function DayAttendanceView({ date, students, courseName }: { date: string; students: Student[]; courseName: string }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: sess } = await supabase.from('sessions').select('*').eq('session_date', date).eq('course_name', courseName).order('created_at');
      if (cancelled) return;
      setSessions(sess ?? []);
      if (sess?.length) {
        const { data: recs } = await supabase.from('attendance_records').select('*').in('session_id', sess.map((s) => s.id)).limit(10000);
        if (!cancelled) setRecords(recs ?? []);
      } else {
        setRecords([]);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [date, courseName]);

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
                <th key={s.id}>{s.course_name} · {s.session_type}{s.group_filter ? ` (Group ${s.group_filter})` : ''}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredStudents.map((student) => (
              <tr key={student.id}>
                <td className="font-mono font-medium">{student.roll_number}</td>
                <td>{student.name}</td>
                {sessions.map((s) => {
                  const applicable = !s.group_filter || s.group_filter === student.group_label;
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
