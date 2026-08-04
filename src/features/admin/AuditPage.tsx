import React, { useEffect, useState } from 'react';
import { supabase } from '../../services/supabase';
import { formatDateTime } from '../../lib/utils';
import type { AuditLogEntry } from '../../types';

const PAGE_SIZE = 30;

export function AuditPage() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [actionFilter, setActionFilter] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      let query = supabase.from('audit_log').select('*', { count: 'exact' }).order('created_at', { ascending: false });
      if (actionFilter) query = query.eq('action', actionFilter);
      const { data, count } = await query.range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (!cancelled) {
        setEntries(data ?? []);
        setTotal(count ?? 0);
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [page, actionFilter]);

  const actionOptions = [
    'student_registered', 'attendance_submitted', 'gps_override_requested', 'gps_override_approved', 'gps_override_rejected',
    'manual_attendance_added', 'session_started', 'override_code_generated', 'override_code_redeemed',
    'staff_invited', 'staff_disabled', 'staff_enabled', 'staff_removed', 'staff_role_changed',
  ];

  return (
    <main className="page">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Audit Log</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Every sensitive action, permanently recorded. {total} entries.</p>
      </div>

      <select value={actionFilter} onChange={(e) => { setActionFilter(e.target.value); setPage(0); }} className="input-base w-auto">
        <option value="">All actions</option>
        {actionOptions.map((a) => <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>)}
      </select>

      <div className="card">
        {loading ? (
          <div className="px-5 py-10 text-center text-sm text-slate-400">Loading…</div>
        ) : entries.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-slate-400">No matching entries.</div>
        ) : (
          <div className="divide-y divide-slate-50 dark:divide-[#21262d]">
            {entries.map((e) => (
              <div key={e.id} className="px-5 py-3">
                <button onClick={() => setExpanded(expanded === e.id ? null : e.id)} className="w-full flex items-center justify-between gap-3 text-left">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{e.action.replace(/_/g, ' ')}</p>
                    <p className="text-xs text-slate-400 truncate">{e.actor_label} · {e.entity_type}{e.entity_id ? ` · ${e.entity_id.slice(0, 8)}` : ''}</p>
                  </div>
                  <span className="text-xs text-slate-400 flex-shrink-0">{formatDateTime(e.created_at)}</span>
                </button>
                {expanded === e.id && !!(e.before || e.after) && (
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {e.before ? (
                      <pre className="text-[10px] bg-red-50 dark:bg-red-500/5 border border-red-100 dark:border-red-500/10 rounded-lg p-2 overflow-x-auto text-red-900 dark:text-red-300">
                        {JSON.stringify(e.before, null, 2)}
                      </pre>
                    ) : <div />}
                    {e.after ? (
                      <pre className="text-[10px] bg-emerald-50 dark:bg-emerald-500/5 border border-emerald-100 dark:border-emerald-500/10 rounded-lg p-2 overflow-x-auto text-emerald-900 dark:text-emerald-300">
                        {JSON.stringify(e.after, null, 2)}
                      </pre>
                    ) : <div />}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="btn-outline btn-sm disabled:opacity-40">Previous</button>
          <span className="text-xs text-slate-400">Page {page + 1} of {Math.ceil(total / PAGE_SIZE)}</span>
          <button disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage((p) => p + 1)} className="btn-outline btn-sm disabled:opacity-40">Next</button>
        </div>
      )}
    </main>
  );
}
