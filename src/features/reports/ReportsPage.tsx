import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../services/supabase';
import { callFunction } from '../../lib/api';
import { toast } from '../../components/ui/Toast';
import { Modal } from '../../components/ui/Modal';
import { AttendanceTable } from '../../components/shared/AttendanceTable';
import { ManualAttendanceModal } from '../../components/shared/ManualAttendanceModal';
import { pctColor, formatDate, formatDateTime } from '../../lib/utils';
import type { Staff, Session, StudentAttendanceSummary, AttendanceRecord } from '../../types';

interface Props { staff: Staff; }

export function ReportsPage({ staff }: Props) {
  const [tab, setTab] = useState<'sessions' | 'students'>('students');
  const [sessions, setSessions] = useState<(Session & { presentCount: number })[]>([]);
  const [summaries, setSummaries] = useState<StudentAttendanceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [openSession, setOpenSession] = useState<Session | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: summaryRows } = await supabase.from('student_attendance_summary').select('*').order('roll_number');
    const { data: sessionRows } = await supabase.from('sessions').select('*').order('session_date', { ascending: false }).order('created_at', { ascending: false }).limit(100);

    if (sessionRows?.length) {
      const { data: records } = await supabase.from('attendance_records').select('session_id').in('session_id', sessionRows.map((s) => s.id));
      const counts: Record<string, number> = {};
      (records ?? []).forEach((r) => { counts[r.session_id] = (counts[r.session_id] ?? 0) + 1; });
      setSessions(sessionRows.map((s) => ({ ...s, presentCount: counts[s.id] ?? 0 })));
    } else {
      setSessions([]);
    }

    setSummaries(summaryRows ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleExcelExport() {
    setExporting(true);
    try {
      const res = await callFunction<{ url: string }>('excel-sync', {});
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
    const rows = summaries.map((s) => [s.roll_number, s.name, s.section ?? '', s.present_count, s.late_count, s.excused_count, s.manual_count, s.override_count, s.total_sessions, s.attendance_percentage]);
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
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Attendance history and exports. Click any session to review or correct it.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleCsvExport} className="btn-secondary btn-sm">Export CSV</button>
          <button onClick={handleExcelExport} disabled={exporting} className="btn-primary btn-sm">
            {exporting ? 'Preparing…' : 'Download Excel'}
          </button>
        </div>
      </div>

      <div className="flex gap-1 border-b border-slate-200 dark:border-[#21262d]">
        {(['students', 'sessions'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {t === 'students' ? 'By Student' : 'By Session'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="card p-10 text-center text-sm text-slate-400">Loading…</div>
      ) : tab === 'students' ? (
        <div className="card overflow-x-auto">
          <table className="data-table min-w-[820px]">
            <thead>
              <tr><th>Roll</th><th>Name</th><th>Present</th><th>Late</th><th>Excused</th><th>Manual</th><th>Override</th><th>Total Sessions</th><th>Attendance %</th></tr>
            </thead>
            <tbody>
              {summaries.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-10 text-slate-400 text-sm">No data yet.</td></tr>
              ) : summaries.map((s) => (
                <tr key={s.student_id}>
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
      ) : (
        <div className="card overflow-x-auto">
          <table className="data-table min-w-[680px]">
            <thead><tr><th>Date</th><th>Course</th><th>Type</th><th>Section</th><th>Status</th><th>Present</th></tr></thead>
            <tbody>
              {sessions.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-10 text-slate-400 text-sm">No sessions yet.</td></tr>
              ) : sessions.map((s) => (
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
      )}

      {openSession && (
        <SessionDetailModal
          staff={staff}
          session={openSession}
          onClose={() => setOpenSession(null)}
          onChanged={load}
        />
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
