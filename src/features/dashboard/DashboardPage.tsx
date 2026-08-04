import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../services/supabase';
import { getGreeting, timeAgo } from '../../lib/utils';
import { StatusBadge } from '../../components/ui/StatusBadge';
import type { Staff, Session, AttendanceRecord } from '../../types';

interface Props {
  staff: Staff;
  onNavigate: (tab: string) => void;
}

export function DashboardPage({ staff, onNavigate }: Props) {
  const [todaySessions, setTodaySessions] = useState<Session[]>([]);
  const [todayRecords, setTodayRecords] = useState<AttendanceRecord[]>([]);
  const [pendingOverrides, setPendingOverrides] = useState(0);
  const [totalStudents, setTotalStudents] = useState(0);
  const [recentActivity, setRecentActivity] = useState<AttendanceRecord[]>([]);

  const load = useCallback(async () => {
    const today = new Date().toISOString().slice(0, 10);

    const { data: sessions } = await supabase
      .from('sessions')
      .select('*')
      .eq('session_date', today)
      .order('created_at', { ascending: false });
    setTodaySessions(sessions ?? []);

    const sessionIds = (sessions ?? []).map((s) => s.id);

    if (sessionIds.length > 0) {
      const { data: records } = await supabase
        .from('attendance_records')
        .select('*')
        .in('session_id', sessionIds)
        .order('marked_at', { ascending: false });
      setTodayRecords(records ?? []);
      setRecentActivity((records ?? []).slice(0, 8));

      const { count } = await supabase
        .from('gps_override_requests')
        .select('*', { count: 'exact', head: true })
        .in('session_id', sessionIds)
        .eq('status', 'pending');
      setPendingOverrides(count ?? 0);
    } else {
      setTodayRecords([]);
      setRecentActivity([]);
      setPendingOverrides(0);
    }

    const { count: studentCount } = await supabase.from('students').select('*', { count: 'exact', head: true }).eq('status', 'active');
    setTotalStudents(studentCount ?? 0);
  }, []);

  useEffect(() => {
    load();
    const channel = supabase
      .channel('dashboard_watch')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_records' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gps_override_requests' }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  const activeSessions = todaySessions.filter((s) => s.status === 'active');
  const present = todayRecords.filter((r) => r.status === 'present').length;
  const late = todayRecords.filter((r) => r.status === 'late').length;
  const manual = todayRecords.filter((r) => r.method === 'manual').length;
  const override = todayRecords.filter((r) => r.method === 'override_code' || r.method === 'instructor_approved').length;
  const attendancePct = totalStudents > 0 ? Math.round((new Set(todayRecords.map((r) => r.roll_number)).size / totalStudents) * 100) : 0;

  return (
    <main className="page">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">{getGreeting()}, {staff.name.split(' ')[0]}.</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => onNavigate('live_session')} className="btn-primary btn-sm">
            {activeSessions.length > 0 ? `${activeSessions.length} Live Now` : 'Start Attendance'}
          </button>
          <button onClick={() => onNavigate('students')} className="btn-secondary btn-sm">Students</button>
          <button onClick={() => onNavigate('reports')} className="btn-secondary btn-sm">Reports</button>
        </div>
      </div>

      <div>
        <p className="section-title mb-3">Live Classroom Status</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard label="Present" value={present} color="text-emerald-600" />
          <StatCard label="Late" value={late} color="text-amber-600" />
          <StatCard label="Manual" value={manual} color="text-purple-600" />
          <StatCard label="GPS Override" value={override} color="text-blue-600" />
          <StatCard label="Pending Approval" value={pendingOverrides} color="text-amber-600" highlight={pendingOverrides > 0} onClick={() => onNavigate('live_session')} />
          <StatCard label="Today's Attendance %" value={`${attendancePct}%`} color="text-slate-900 dark:text-slate-100" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-[#21262d] flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Today's Sessions</p>
          </div>
          {todaySessions.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-slate-400">No sessions today yet.</div>
          ) : (
            <div className="divide-y divide-slate-50 dark:divide-[#21262d]">
              {todaySessions.map((s) => {
                const count = todayRecords.filter((r) => r.session_id === s.id).length;
                return (
                  <button
                    key={s.id}
                    onClick={() => onNavigate('live_session')}
                    className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-[#161b22]/60 transition-colors text-left"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {s.course_name} · {s.session_type}
                        {s.group_filter && <span className="text-slate-400 font-normal"> · Group {s.group_filter}</span>}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">{new Date(s.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">{count}</span>
                      <StatusBadge status={s.status} />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="card">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-[#21262d]">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Live Activity</p>
          </div>
          {recentActivity.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-slate-400">Nothing yet today.</div>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              {recentActivity.map((r) => (
                <div key={r.id} className="flex items-start gap-3 px-5 py-3 border-b border-slate-50 dark:border-[#21262d]/50 last:border-0">
                  <div className="timeline-dot border-blue-400 bg-blue-100 mt-2" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">{r.roll_number}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{r.method.replace('_', ' ')} · {timeAgo(r.marked_at)}</p>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function StatCard({
  label, value, color, highlight, onClick,
}: { label: string; value: number | string; color: string; highlight?: boolean; onClick?: () => void }) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp onClick={onClick} className={`stat-card text-left ${highlight ? 'ring-2 ring-amber-400/50' : ''} ${onClick ? 'cursor-pointer hover:-translate-y-0.5 transition-transform' : ''}`}>
      <p className={`text-2xl font-bold font-tabular ${color}`}>{value}</p>
      <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wide">{label}</p>
    </Comp>
  );
}
