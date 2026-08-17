import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { supabase } from '../../services/supabase';
import { getGreeting } from '../../lib/utils';
import { StatusBadge } from '../../components/ui/StatusBadge';
import type { Staff, Session, StudentAttendanceSummary } from '../../types';

interface Props {
  staff: Staff;
  onNavigate: (tab: string) => void;
  onOpenSession: (sessionId: string) => void;
  courseName: string;
}

// Validated categorical slots (blue / orange / aqua / yellow / …) — passes CVD
// checks in this fixed order; never reassign per-render.
const CAT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
const AXIS_INK = '#94a3b8';
const GRID = '#e2e8f0';

const METHOD_LABEL: Record<string, string> = {
  gps: 'QR Scan', override_code: 'Override Code', instructor_approved: 'Staff Approved', manual: 'Manual Entry',
};

export function DashboardPage({ staff, onNavigate, onOpenSession, courseName }: Props) {
  const [todaySessions, setTodaySessions] = useState<Session[]>([]);
  const [todayRecords, setTodayRecords] = useState<{ session_id: string; status: string }[]>([]);
  const [totalStudents, setTotalStudents] = useState(0);
  const [summaries, setSummaries] = useState<StudentAttendanceSummary[]>([]);
  const [sessionsEndedGeneral, setSessionsEndedGeneral] = useState<{ session_date: string; count: number }[]>([]);
  const [methodTally, setMethodTally] = useState<Record<string, number>>({});
  const [sessionsHeldCount, setSessionsHeldCount] = useState(0);
  const [demographics, setDemographics] = useState<{ department: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const today = new Date().toISOString().slice(0, 10);

    const [{ data: sessions }, { data: sessionRows }, { data: roster }, { data: summaryRows }] = await Promise.all([
      supabase.from('sessions').select('*').eq('session_date', today).eq('course_name', courseName).order('created_at', { ascending: false }),
      supabase.from('sessions').select('id, session_date, status, group_filter').eq('course_name', courseName),
      supabase.from('students').select('department').eq('status', 'active'),
      supabase.rpc('student_attendance_summary', { p_course_name: courseName }),
    ]);
    setTodaySessions(sessions ?? []);
    setSummaries((summaryRows as StudentAttendanceSummary[]) ?? []);
    setTotalStudents(roster?.length ?? 0);

    const dept: Record<string, number> = {};
    (roster ?? []).forEach((r) => {
      const key = (r.department as string | null)?.trim() || 'Unspecified';
      dept[key] = (dept[key] ?? 0) + 1;
    });
    setDemographics(Object.entries(dept).map(([department, count]) => ({ department, count })).sort((a, b) => b.count - a.count));

    const allSessions = sessionRows ?? [];
    const endedGeneral = allSessions.filter((s) => s.status === 'ended' && !s.group_filter);
    setSessionsHeldCount(allSessions.filter((s) => s.status === 'ended').length);

    const allIds = allSessions.map((s) => s.id);
    if (allIds.length > 0) {
      const { data: records } = await supabase.from('attendance_records').select('session_id, status, method').in('session_id', allIds).limit(20000);
      const todayIds = new Set((sessions ?? []).map((s) => s.id));
      setTodayRecords((records ?? []).filter((r) => todayIds.has(r.session_id)));

      const method: Record<string, number> = {};
      (records ?? []).forEach((r) => { method[r.method] = (method[r.method] ?? 0) + 1; });
      setMethodTally(method);

      const perSession: Record<string, number> = {};
      (records ?? []).forEach((r) => { perSession[r.session_id] = (perSession[r.session_id] ?? 0) + 1; });
      const byDate: Record<string, number> = {};
      endedGeneral.forEach((s) => { byDate[s.session_date] = (byDate[s.session_date] ?? 0) + (perSession[s.id] ?? 0); });
      setSessionsEndedGeneral(
        Object.entries(byDate)
          .map(([session_date, count]) => ({ session_date, count }))
          .sort((a, b) => a.session_date.localeCompare(b.session_date))
          .slice(-14),
      );
    } else {
      setTodayRecords([]);
      setMethodTally({});
      setSessionsEndedGeneral([]);
    }

    setLoading(false);
  }, [courseName]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel('dashboard_watch')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_records' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'students' }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  const activeSessions = todaySessions.filter((s) => s.status === 'active');

  const overallPct = useMemo(() => {
    const present = summaries.reduce((sum, s) => sum + s.present_count, 0);
    const total = summaries.reduce((sum, s) => sum + s.total_sessions, 0);
    return total > 0 ? Math.round((present / total) * 1000) / 10 : 0;
  }, [summaries]);

  const excusedTotal = useMemo(() => summaries.reduce((sum, s) => sum + s.excused_count, 0), [summaries]);

  const groupChart = useMemo(() => {
    const byGroup: Record<string, { sum: number; n: number }> = {};
    summaries.forEach((s) => {
      if (!s.group_label) return;
      byGroup[s.group_label] ??= { sum: 0, n: 0 };
      byGroup[s.group_label].sum += s.attendance_percentage;
      byGroup[s.group_label].n += 1;
    });
    return Object.entries(byGroup)
      .map(([group, { sum, n }]) => ({ group, pct: Math.round((sum / n) * 10) / 10 }))
      .sort((a, b) => a.group.localeCompare(b.group));
  }, [summaries]);

  const methodChart = useMemo(
    () => Object.entries(methodTally).map(([method, value]) => ({ name: METHOD_LABEL[method] ?? method, value })),
    [methodTally],
  );

  const trendChart = useMemo(
    () => sessionsEndedGeneral.map((d) => ({
      date: new Date(d.session_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
      pct: totalStudents > 0 ? Math.round((d.count / totalStudents) * 1000) / 10 : 0,
    })),
    [sessionsEndedGeneral, totalStudents],
  );

  const deptChart = useMemo(() => {
    if (demographics.length <= 8) return demographics;
    const top = demographics.slice(0, 7);
    const rest = demographics.slice(7).reduce((sum, d) => sum + d.count, 0);
    return [...top, { department: 'Other', count: rest }];
  }, [demographics]);

  return (
    <main className="page">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">{getGreeting()}, {staff.name.split(' ')[0]}.</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {courseName} · {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => onNavigate('live_session')} className="btn-primary btn-sm">
            {activeSessions.length > 0 ? `${activeSessions.length} Live Now` : 'Start Attendance'}
          </button>
          <button onClick={() => onNavigate('students')} className="btn-secondary btn-sm">Participants</button>
          <button onClick={() => onNavigate('reports')} className="btn-secondary btn-sm">Reports</button>
        </div>
      </div>

      <div>
        <p className="section-title mb-3">Overall Stats — {courseName}</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard label="Total Participants" value={totalStudents} color="text-slate-900 dark:text-slate-100" />
          <StatCard label="Sessions Held" value={sessionsHeldCount} color="text-slate-900 dark:text-slate-100" />
          <StatCard label="Overall Attendance %" value={`${overallPct}%`} color="text-emerald-600" />
          <StatCard label="Excused" value={excusedTotal} color="text-amber-600" />
          <StatCard label="Override Entries" value={methodTally.override_code ?? 0} color="text-blue-600" />
          <StatCard label="Manual Entries" value={methodTally.manual ?? 0} color="text-purple-600" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Attendance Trend" subtitle="Day-wise attendance %, general sessions">
          {trendChart.length === 0 ? (
            <EmptyChart text="No ended sessions yet." />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={trendChart} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: AXIS_INK }} axisLine={{ stroke: GRID }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: AXIS_INK }} axisLine={false} tickLine={false} width={36} domain={[0, 100]} />
                <Tooltip
                  cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                  contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                  formatter={(v: number) => [`${v}%`, 'Attendance']}
                />
                <Bar dataKey="pct" fill={CAT[0]} radius={[4, 4, 0, 0]} maxBarSize={24} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="How Attendance Was Marked" subtitle="Across every session this course, to date">
          {methodChart.length === 0 ? (
            <EmptyChart text="No attendance recorded yet." />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={methodChart} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2} stroke="#fff" strokeWidth={2}>
                  {methodChart.map((_, i) => <Cell key={i} fill={CAT[i % CAT.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12, color: AXIS_INK }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Attendance by Group" subtitle="Average % per assigned group">
          {groupChart.length === 0 ? (
            <EmptyChart text="No participants have been assigned a group yet." />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={groupChart} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis dataKey="group" tick={{ fontSize: 11, fill: AXIS_INK }} axisLine={{ stroke: GRID }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: AXIS_INK }} axisLine={false} tickLine={false} width={36} domain={[0, 100]} />
                <Tooltip
                  cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                  contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                  formatter={(v: number) => [`${v}%`, 'Avg. Attendance']}
                  labelFormatter={(l) => `Group ${l}`}
                />
                <Bar dataKey="pct" fill={CAT[0]} radius={[4, 4, 0, 0]} maxBarSize={24} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Roster by School / Centre" subtitle="Active participants, all courses">
          {deptChart.length === 0 ? (
            <EmptyChart text="No students enrolled yet." />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={deptChart} layout="vertical" margin={{ top: 8, right: 24, left: 0, bottom: 0 }}>
                <CartesianGrid horizontal={false} stroke={GRID} />
                <XAxis type="number" tick={{ fontSize: 11, fill: AXIS_INK }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="department" tick={{ fontSize: 11, fill: AXIS_INK }} axisLine={false} tickLine={false} width={110} />
                <Tooltip
                  cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                  contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                  formatter={(v: number) => [v, 'Students']}
                />
                <Bar dataKey="count" fill={CAT[0]} radius={[0, 4, 4, 0]} maxBarSize={20} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <div className="card">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-[#21262d] flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Today's Sessions</p>
          <p className="text-[11px] text-slate-400">Click a session to view its stats</p>
        </div>
        {loading ? (
          <div className="px-5 py-10 text-center text-sm text-slate-400">Loading…</div>
        ) : todaySessions.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-slate-400">No sessions today yet.</div>
        ) : (
          <div className="divide-y divide-slate-50 dark:divide-[#21262d]">
            {todaySessions.map((s) => {
              const count = todayRecords.filter((r) => r.session_id === s.id).length;
              return (
                <button
                  key={s.id}
                  onClick={() => onOpenSession(s.id)}
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
    </main>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <div className="px-5 py-4 border-b border-slate-100 dark:border-[#21262d]">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</p>
        <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function EmptyChart({ text }: { text: string }) {
  return <div className="h-[260px] flex items-center justify-center text-sm text-slate-400">{text}</div>;
}

function StatCard({
  label, value, color,
}: { label: string; value: number | string; color: string }) {
  return (
    <div className="stat-card text-left">
      <p className={`text-2xl font-bold font-tabular ${color}`}>{value}</p>
      <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wide">{label}</p>
    </div>
  );
}
