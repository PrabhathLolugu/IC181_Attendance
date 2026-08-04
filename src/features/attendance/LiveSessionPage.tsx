import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../services/supabase';
import { callFunction } from '../../lib/api';
import { QRCodeCanvas } from 'qrcode.react';
import { Modal } from '../../components/ui/Modal';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { toast } from '../../components/ui/Toast';
import { timeAgo, formatTime } from '../../lib/utils';
import type { Staff, Session, AttendanceRecord, GpsOverrideRequest, CourseSettings, Student } from '../../types';

interface Props { staff: Staff; }

export function LiveSessionPage({ staff }: Props) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [overrides, setOverrides] = useState<GpsOverrideRequest[]>([]);
  const [settings, setSettings] = useState<CourseSettings | null>(null);
  const [qrToken, setQrToken] = useState('');
  const [qrExpiresAt, setQrExpiresAt] = useState<number | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [showStart, setShowStart] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [overrideCode, setOverrideCode] = useState<{ code: string; expiresAt: string } | null>(null);

  const selected = sessions.find((s) => s.id === selectedId) ?? null;

  const loadSessions = useCallback(async () => {
    const { data } = await supabase.from('sessions').select('*').eq('status', 'active').order('created_at', { ascending: false });
    setSessions(data ?? []);
    setSelectedId((prev) => (prev && data?.some((s) => s.id === prev) ? prev : data?.[0]?.id ?? null));
  }, []);

  useEffect(() => {
    supabase.from('course_settings').select('*').single().then(({ data }) => setSettings(data));
    loadSessions();
    const channel = supabase
      .channel('live_sessions_list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, loadSessions)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadSessions]);

  const loadSessionDetail = useCallback(async (sessionId: string) => {
    const [{ data: r }, { data: o }] = await Promise.all([
      supabase.from('attendance_records').select('*').eq('session_id', sessionId).order('marked_at', { ascending: false }),
      supabase.from('gps_override_requests').select('*').eq('session_id', sessionId).eq('status', 'pending').order('requested_at', { ascending: false }),
    ]);
    setRecords(r ?? []);
    setOverrides(o ?? []);
  }, []);

  useEffect(() => {
    if (!selectedId) { setRecords([]); setOverrides([]); return; }
    loadSessionDetail(selectedId);
    const channel = supabase
      .channel(`live_session_${selectedId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_records', filter: `session_id=eq.${selectedId}` }, () => loadSessionDetail(selectedId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gps_override_requests', filter: `session_id=eq.${selectedId}` }, () => loadSessionDetail(selectedId))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedId, loadSessionDetail]);

  useEffect(() => {
    if (!selected) { setQrToken(''); setQrExpiresAt(null); return; }
    let cancelled = false;

    async function rotate() {
      try {
        const res = await callFunction<{ qrToken: string; expiresAt: string }>('session-qr-rotate', { sessionId: selected!.id });
        if (cancelled) return;
        setQrToken(res.qrToken);
        setQrExpiresAt(new Date(res.expiresAt).getTime());
      } catch {
        /* transient failure — next tick will retry */
      }
    }
    rotate();
    const seconds = settings?.qr_rotation_seconds || 25;
    const interval = setInterval(rotate, seconds * 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [selected?.id, settings?.qr_rotation_seconds]);

  useEffect(() => {
    const t = setInterval(() => {
      setCountdown(qrExpiresAt ? Math.max(0, Math.round((qrExpiresAt - Date.now()) / 1000)) : 0);
    }, 250);
    return () => clearInterval(t);
  }, [qrExpiresAt]);

  async function handleEndSession() {
    if (!selected) return;
    if (!window.confirm('End this session? Students will no longer be able to mark attendance for it.')) return;
    await supabase.from('sessions').update({ status: 'ended', ended_at: new Date().toISOString() }).eq('id', selected.id);
    toast('info', 'Session ended.');
  }

  async function handleResolveOverride(o: GpsOverrideRequest, action: 'approve' | 'reject') {
    try {
      await callFunction('override-resolve', { requestId: o.id, action });
      toast(action === 'approve' ? 'success' : 'info', `Request ${action === 'approve' ? 'approved' : 'rejected'}.`);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not resolve request.');
    }
  }

  async function handleGenerateCode() {
    if (!selected) return;
    try {
      const res = await callFunction<{ code: string; expiresAt: string }>('override-code-generate', { sessionId: selected.id });
      setOverrideCode(res);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not generate code.');
    }
  }

  const qrUrl = qrToken ? `${window.location.origin}${window.location.pathname}?attend=${encodeURIComponent(qrToken)}` : '';
  const presentCount = records.length;
  const lateCount = records.filter((r) => r.status === 'late').length;
  const manualCount = records.filter((r) => r.method === 'manual').length;
  const overrideCount = records.filter((r) => r.method === 'override_code' || r.method === 'instructor_approved').length;

  if (sessions.length === 0) {
    return (
      <main className="page">
        <StartSessionPanel staff={staff} onStarted={loadSessions} defaultRadius={settings?.gps_radius_meters ?? 100} />
      </main>
    );
  }

  return (
    <main className={`page ${fullscreen ? 'fixed inset-0 z-50 bg-white dark:bg-[#0d1117] flex flex-col items-center justify-center p-6' : ''}`}>
      {!fullscreen && (
        <>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              {sessions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedId(s.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    s.id === selectedId
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-white dark:bg-[#161b22] border-slate-200 dark:border-[#30363d] text-slate-600 dark:text-slate-300 hover:border-blue-300'
                  }`}
                >
                  {s.session_type === 'practical' ? 'Practical' : 'Theory'} · {formatTime(s.created_at)}
                </button>
              ))}
              <button onClick={() => setShowStart(true)} className="btn-outline btn-sm">+ Start Another</button>
            </div>
            {selected && (
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => setShowManual(true)} className="btn-secondary btn-sm">Manual Attendance</button>
                <button onClick={handleGenerateCode} className="btn-secondary btn-sm">Generate Code</button>
                <button onClick={() => setFullscreen(true)} className="btn-secondary btn-sm">Full Screen QR</button>
                <button onClick={handleEndSession} className="btn-danger btn-sm">End Session</button>
              </div>
            )}
          </div>

          {overrideCode && (
            <div className="card p-4 bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-blue-900 dark:text-blue-300 uppercase tracking-wide">Override Code</p>
                <p className="text-3xl font-bold font-mono tracking-[0.3em] text-blue-900 dark:text-blue-200 mt-1">{overrideCode.code}</p>
                <p className="text-xs text-blue-700 dark:text-blue-400 mt-1">Valid until {formatTime(overrideCode.expiresAt)} · read this out to affected students</p>
              </div>
              <button onClick={() => setOverrideCode(null)} className="btn-ghost btn-sm">Dismiss</button>
            </div>
          )}
        </>
      )}

      {selected &&
        (fullscreen ? (
          <div className="flex flex-col items-center gap-8 relative w-full h-full justify-center">
            <button onClick={() => setFullscreen(false)} className="absolute top-4 right-4 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100">
              <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <div className="text-center">
              <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">{selected.session_type === 'practical' ? 'Practical' : 'Theory'} Session</h1>
              <p className="text-xl text-slate-500">Scan to mark attendance</p>
            </div>
            <div className={`p-8 rounded-[3rem] border-4 transition-all duration-300 ${countdown <= 5 ? 'border-red-400 scale-[1.02]' : 'border-slate-200'}`}>
              {qrUrl && <QRCodeCanvas value={qrUrl} size={420} level="H" fgColor="#0f172a" bgColor="#ffffff" />}
            </div>
            <div className="flex items-center gap-3">
              <div className={`w-4 h-4 rounded-full ${countdown <= 5 ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`} />
              <span className="text-xl text-slate-500 font-tabular font-medium">Refreshes in {countdown}s · {presentCount} present</span>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="card p-6 flex flex-col items-center gap-4">
              <p className="font-semibold text-slate-900 dark:text-slate-100">Scan to Join</p>
              <div className={`p-4 rounded-3xl border-2 transition-all duration-300 ${countdown <= 5 ? 'border-red-400' : 'border-slate-200 dark:border-[#30363d]'}`}>
                {qrUrl && <QRCodeCanvas value={qrUrl} size={220} level="H" fgColor="#0f172a" bgColor="#ffffff" />}
              </div>
              <p className="text-sm text-slate-500 font-tabular">Refreshes in {countdown}s</p>
              <p className="text-xs text-slate-400">{selected.radius_meters}m radius · {selected.session_date}</p>
            </div>

            <div className="lg:col-span-2 flex flex-col gap-6">
              <div className="grid grid-cols-4 gap-3">
                <StatMini label="Present" value={presentCount} color="text-emerald-600" />
                <StatMini label="Late" value={lateCount} color="text-amber-600" />
                <StatMini label="Manual" value={manualCount} color="text-purple-600" />
                <StatMini label="Override" value={overrideCount} color="text-blue-600" />
              </div>

              {overrides.length > 0 && (
                <div className="card border-amber-200 dark:border-amber-500/30 bg-amber-50/50 dark:bg-amber-500/5">
                  <div className="px-5 py-3 border-b border-amber-200/60 dark:border-amber-500/20 font-semibold text-amber-900 dark:text-amber-400 text-sm">
                    Pending GPS Approvals ({overrides.length})
                  </div>
                  <div className="divide-y divide-amber-100 dark:divide-amber-500/10">
                    {overrides.map((o) => (
                      <div key={o.id} className="flex justify-between items-center p-4">
                        <div>
                          <p className="font-semibold text-slate-900 dark:text-slate-100 text-sm">{o.roll_number}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {o.reason === 'outside_radius' ? `${o.distance_meters}m away` : o.reason === 'gps_denied' ? 'Location denied' : 'Location unavailable'} · {timeAgo(o.requested_at)}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => handleResolveOverride(o, 'approve')} className="btn-success btn-sm">Approve</button>
                          <button onClick={() => handleResolveOverride(o, 'reject')} className="btn-danger btn-sm">Reject</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="card flex-1">
                <div className="px-5 py-4 border-b border-slate-100 dark:border-[#21262d] font-semibold text-sm text-slate-900 dark:text-slate-100">Attendance Log</div>
                <div className="max-h-96 overflow-y-auto">
                  {records.length === 0 ? (
                    <div className="px-5 py-10 text-center text-sm text-slate-400">No one has marked attendance yet.</div>
                  ) : (
                    <table className="data-table">
                      <thead><tr><th>Roll</th><th>Status</th><th>Method</th><th>Time</th></tr></thead>
                      <tbody>
                        {records.map((r) => (
                          <tr key={r.id}>
                            <td className="font-medium">{r.roll_number}</td>
                            <td><StatusBadge status={r.status} /></td>
                            <td className="text-slate-400 text-xs">{r.method.replace('_', ' ')}</td>
                            <td className="text-slate-400 text-sm">{timeAgo(r.marked_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}

      <Modal open={showStart} onClose={() => setShowStart(false)} title="Start Another Session" size="sm">
        <StartSessionPanel staff={staff} embedded onStarted={() => { setShowStart(false); loadSessions(); }} defaultRadius={settings?.gps_radius_meters ?? 100} />
      </Modal>

      {selected && (
        <ManualAttendanceModal open={showManual} onClose={() => setShowManual(false)} session={selected} onMarked={() => loadSessionDetail(selected.id)} />
      )}
    </main>
  );
}

function StatMini({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="card p-4 text-center">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-[10px] text-slate-500 font-medium uppercase mt-1 tracking-wide">{label}</p>
    </div>
  );
}

function StartSessionPanel({
  staff, onStarted, defaultRadius, embedded,
}: { staff: Staff; onStarted: () => void; defaultRadius: number; embedded?: boolean }) {
  const [sessionType, setSessionType] = useState<'theory' | 'practical'>('theory');
  const [allowOverride, setAllowOverride] = useState(true);
  const [sectionFilter, setSectionFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleStart(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!navigator.geolocation) { setError('This device does not support location services.'); return; }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await callFunction('session-start', {
            sessionType,
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            radiusMeters: defaultRadius,
            allowGpsOverride: allowOverride,
            sectionFilter: sectionFilter.trim() || undefined,
          });
          toast('success', 'Session started.');
          onStarted();
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not start the session.');
        } finally {
          setLoading(false);
        }
      },
      () => { setError('We need your current location to anchor the GPS radius for this session.'); setLoading(false); },
      { enableHighAccuracy: true, timeout: 12000 },
    );
  }

  return (
    <div className={embedded ? '' : 'card p-6 max-w-md mx-auto'}>
      {!embedded && (
        <>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">No Active Session</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Start one to generate a QR code for {staff.name.split(' ')[0]}'s class.</p>
        </>
      )}
      <form onSubmit={handleStart} className="flex flex-col gap-4 mt-4">
        <div>
          <label className="label">Session Type</label>
          <select value={sessionType} onChange={(e) => setSessionType(e.target.value as 'theory' | 'practical')} className="input-base">
            <option value="theory">Theory</option>
            <option value="practical">Practical</option>
          </select>
        </div>
        <div>
          <label className="label">Section (optional — leave blank if everyone attends)</label>
          <input value={sectionFilter} onChange={(e) => setSectionFilter(e.target.value)} placeholder="e.g. B1" className="input-base" />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
          <input type="checkbox" checked={allowOverride} onChange={(e) => setAllowOverride(e.target.checked)} className="rounded" />
          Allow GPS override requests for this session
        </label>
        {error && <div className="px-4 py-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl text-red-700 dark:text-red-400 text-xs">{error}</div>}
        <button type="submit" disabled={loading} className="btn-primary w-full h-11">
          {loading ? 'Getting your location…' : 'Generate QR & Start'}
        </button>
      </form>
    </div>
  );
}

function ManualAttendanceModal({
  open, onClose, session, onMarked,
}: { open: boolean; onClose: () => void; session: Session; onMarked: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Student[]>([]);
  const [selected, setSelected] = useState<Student | null>(null);
  const [reason, setReason] = useState('Phone unavailable');
  const [customReason, setCustomReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!query.trim() || selected) { setResults([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('students')
        .select('*')
        .or(`roll_number.ilike.%${query}%,name.ilike.%${query}%`)
        .eq('status', 'active')
        .limit(8);
      setResults(data ?? []);
    }, 250);
    return () => clearTimeout(t);
  }, [query, selected]);

  async function handleMark() {
    if (!selected) return;
    setLoading(true);
    setError('');
    try {
      await callFunction('attendance-manual', {
        sessionId: session.id,
        rollNumber: selected.roll_number,
        reason: reason === 'Other' ? customReason.trim() || 'Other' : reason,
      });
      toast('success', `${selected.roll_number} marked present.`);
      onMarked();
      setSelected(null);
      setQuery('');
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not mark attendance.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Manual Attendance" subtitle="For students whose device or GPS failed.">
      <div className="flex flex-col gap-4">
        {!selected ? (
          <>
            <input autoFocus className="input-base" placeholder="Search by roll number or name" value={query} onChange={(e) => setQuery(e.target.value)} />
            <div className="flex flex-col gap-1 max-h-56 overflow-y-auto">
              {results.map((s) => (
                <button key={s.id} onClick={() => setSelected(s)} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-[#21262d] text-left transition-colors">
                  <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{s.name}</span>
                  <span className="text-xs text-slate-400 font-mono">{s.roll_number}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="card p-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{selected.name}</p>
                <p className="text-xs text-slate-500 font-mono">{selected.roll_number}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-xs text-blue-600">Change</button>
            </div>
            <div>
              <label className="label">Reason</label>
              <select value={reason} onChange={(e) => setReason(e.target.value)} className="input-base">
                <option>Phone unavailable</option>
                <option>Medical issue</option>
                <option>Permission granted</option>
                <option>Technical issue</option>
                <option>Other</option>
              </select>
            </div>
            {reason === 'Other' && (
              <input className="input-base" placeholder="Describe the reason" value={customReason} onChange={(e) => setCustomReason(e.target.value)} />
            )}
            {error && <div className="px-4 py-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl text-red-700 dark:text-red-400 text-xs">{error}</div>}
            <button onClick={handleMark} disabled={loading} className="btn-primary w-full h-11">
              {loading ? 'Marking…' : 'Mark Present'}
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}
