import React, { useState } from 'react';
import { callFunction } from '../../lib/api';
import { StatusBadge } from '../ui/StatusBadge';
import { toast } from '../ui/Toast';
import { timeAgo, statusLabel } from '../../lib/utils';
import type { Staff, AttendanceRecord } from '../../types';

const EDITABLE_STATUSES: AttendanceRecord['status'][] = ['present', 'late', 'manual', 'override', 'excused'];

export function AttendanceTable({
  staff, records, onChanged, title = 'Attendance Log', emptyText = 'No one has marked attendance yet.',
}: { staff: Staff; records: AttendanceRecord[]; onChanged: () => void; title?: string; emptyText?: string }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState<AttendanceRecord['status']>('present');
  const [busyId, setBusyId] = useState<string | null>(null);

  function startEdit(r: AttendanceRecord) {
    setEditingId(r.id);
    setEditStatus(r.status);
  }

  async function saveEdit(r: AttendanceRecord) {
    setBusyId(r.id);
    try {
      await callFunction('attendance-edit', { recordId: r.id, status: editStatus, notes: r.notes ?? null });
      toast('success', 'Attendance updated.');
      setEditingId(null);
      onChanged();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not update attendance.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(r: AttendanceRecord) {
    if (!window.confirm(`Remove ${r.roll_number}'s attendance record for this session?`)) return;
    setBusyId(r.id);
    try {
      await callFunction('attendance-delete', { recordId: r.id });
      toast('success', 'Attendance record removed.');
      onChanged();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not delete attendance record.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="card flex-1">
      <div className="px-5 py-4 border-b border-slate-100 dark:border-[#21262d] font-semibold text-sm text-slate-900 dark:text-slate-100">{title}</div>
      <div className="max-h-96 overflow-y-auto">
        {records.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-slate-400">{emptyText}</div>
        ) : (
          <table className="data-table">
            <thead><tr><th>Roll</th><th>Status</th><th>Method</th><th>Time</th><th></th></tr></thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id}>
                  <td className="font-medium">{r.roll_number}</td>
                  <td>
                    {editingId === r.id ? (
                      <select
                        value={editStatus}
                        onChange={(e) => setEditStatus(e.target.value as AttendanceRecord['status'])}
                        className="text-xs border border-slate-200 dark:border-[#30363d] rounded-lg px-2 py-1 bg-white dark:bg-[#0d1117]"
                      >
                        {EDITABLE_STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
                      </select>
                    ) : (
                      <StatusBadge status={r.status} />
                    )}
                  </td>
                  <td className="text-slate-400 text-xs">{r.method.replace('_', ' ')}</td>
                  <td className="text-slate-400 text-sm">{timeAgo(r.marked_at)}</td>
                  <td>
                    <div className="flex gap-2 justify-end">
                      {editingId === r.id ? (
                        <>
                          <button onClick={() => saveEdit(r)} disabled={busyId === r.id} className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">Save</button>
                          <button onClick={() => setEditingId(null)} className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => startEdit(r)} className="text-xs text-blue-600 hover:text-blue-700 font-medium">Edit</button>
                          {staff.role === 'admin' && (
                            <button onClick={() => handleDelete(r)} disabled={busyId === r.id} className="text-xs text-red-600 hover:text-red-700 font-medium">Delete</button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
