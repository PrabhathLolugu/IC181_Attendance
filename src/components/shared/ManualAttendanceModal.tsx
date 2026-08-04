import React, { useEffect, useState } from 'react';
import { supabase } from '../../services/supabase';
import { callFunction } from '../../lib/api';
import { Modal } from '../ui/Modal';
import { toast } from '../ui/Toast';
import type { Session, Student } from '../../types';

export function ManualAttendanceModal({
  open, onClose, session, onMarked,
}: { open: boolean; onClose: () => void; session: Session; onMarked: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Student[]>([]);
  const [selected, setSelected] = useState<Student | null>(null);
  const [status, setStatus] = useState<'present' | 'late' | 'excused'>('present');
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
        status,
        reason: reason === 'Other' ? customReason.trim() || 'Other' : reason,
      });
      toast('success', `${selected.roll_number} marked ${status}.`);
      onMarked();
      setSelected(null);
      setQuery('');
      setStatus('present');
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not mark attendance.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Manual Attendance" subtitle="For students whose device or GPS failed, or joining/leaving under special circumstances.">
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
              <label className="label">Mark As</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as 'present' | 'late' | 'excused')} className="input-base">
                <option value="present">Present</option>
                <option value="late">Late</option>
                <option value="excused">Excused (medical / approved leave)</option>
              </select>
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
              {loading ? 'Marking…' : `Mark ${status[0].toUpperCase()}${status.slice(1)}`}
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}
