import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../services/supabase';
import { callFunction } from '../../lib/api';
import { Modal } from '../../components/ui/Modal';
import { Avatar } from '../../components/ui/Avatar';
import { toast } from '../../components/ui/Toast';
import { statusLabel } from '../../lib/utils';
import type { Staff, StaffRole } from '../../types';

interface Props { staff: Staff; }

export function AdminPage({ staff }: Props) {
  const [team, setTeam] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('staff').select('*').order('role').order('name');
    setTeam(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleAction(target: Staff, action: 'disable' | 'enable' | 'remove' | 'update_role', role?: StaffRole) {
    if (target.id === staff.id) { toast('error', "You can't modify your own access."); return; }
    if (action === 'remove' && !window.confirm(`Permanently remove ${target.name}'s access?`)) return;
    try {
      await callFunction('staff-manage', { action, staffId: target.id, role });
      toast('success', 'Updated.');
      load();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not update staff.');
    }
  }

  const admins = team.filter((t) => t.role === 'admin');
  const tas = team.filter((t) => t.role === 'ta');

  return (
    <main className="page">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Administration</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Manage admins and TAs for your classes.</p>
        </div>
        <button onClick={() => setShowAddModal(true)} className="btn-primary btn-sm">+ Add Staff Member</button>
      </div>

      {loading ? (
        <div className="card p-10 text-center text-sm text-slate-400">Loading…</div>
      ) : (
        <>
          <TeamGroup title={`Admins (${admins.length})`} members={admins} currentId={staff.id} onAction={handleAction} />
          <TeamGroup title={`TAs (${tas.length})`} members={tas} currentId={staff.id} onAction={handleAction} />
        </>
      )}

      <AddStaffModal open={showAddModal} onClose={() => setShowAddModal(false)} onAdded={() => { setShowAddModal(false); load(); }} />
    </main>
  );
}

function TeamGroup({
  title, members, currentId, onAction,
}: { title: string; members: Staff[]; currentId: string; onAction: (s: Staff, a: 'disable' | 'enable' | 'remove' | 'update_role', role?: StaffRole) => void }) {
  if (members.length === 0) return null;
  return (
    <div className="card">
      <div className="px-5 py-4 border-b border-slate-100 dark:border-[#21262d] font-semibold text-sm text-slate-900 dark:text-slate-100">{title}</div>
      <div className="divide-y divide-slate-50 dark:divide-[#21262d]">
        {members.map((m) => (
          <div key={m.id} className="flex items-center justify-between px-5 py-3.5 gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <Avatar initials={m.name.slice(0, 2).toUpperCase()} size="sm" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                  {m.name} {m.id === currentId && <span className="text-slate-400 font-normal">(you)</span>}
                </p>
                <p className="text-xs text-slate-400 truncate">{m.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <span className={m.status === 'active' ? 'badge-green' : 'badge-slate'}>{statusLabel(m.status)}</span>
              {m.id !== currentId && (
                <div className="flex gap-2">
                  <select
                    value={m.role}
                    onChange={(e) => onAction(m, 'update_role', e.target.value as StaffRole)}
                    className="text-xs border border-slate-200 dark:border-[#30363d] rounded-lg px-2 py-1 bg-white dark:bg-[#0d1117] text-slate-600 dark:text-slate-300"
                  >
                    <option value="ta">TA</option>
                    <option value="admin">Admin</option>
                  </select>
                  {m.status === 'active' ? (
                    <button onClick={() => onAction(m, 'disable')} className="text-xs text-amber-600 hover:text-amber-700 font-medium">Disable</button>
                  ) : (
                    <button onClick={() => onAction(m, 'enable')} className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">Enable</button>
                  )}
                  <button onClick={() => onAction(m, 'remove')} className="text-xs text-red-600 hover:text-red-700 font-medium">Remove</button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AddStaffModal({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<StaffRole>('ta');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleAdd() {
    if (!name.trim() || !email.trim()) { setError('Name and email are required.'); return; }
    if (!password || password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setLoading(true);
    setError('');
    try {
      await callFunction('staff-manage', { action: 'create', name: name.trim(), email: email.trim(), password, role });
      toast('success', `Added ${name} (${role.toUpperCase()}). Account ready immediately.`);
      setName(''); setEmail(''); setPassword(''); setRole('ta');
      onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create staff account.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Staff Member" subtitle="Creates their account immediately with the password you specify. No email confirmation needed.">
      <div className="flex flex-col gap-4">
        <div>
          <label className="label">Full Name</label>
          <input className="input-base" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Dr. Sarah Jenkins" autoFocus />
        </div>
        <div>
          <label className="label">Email Address</label>
          <input className="input-base" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="sarah@institution.edu" />
        </div>
        <div>
          <label className="label">Password (Share this with them personally)</label>
          <input className="input-base" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        </div>
        <div>
          <label className="label">Role</label>
          <select value={role} onChange={(e) => setRole(e.target.value as StaffRole)} className="input-base">
            <option value="ta">TA — run sessions, mark attendance, view students</option>
            <option value="admin">Admin — full control (can add/manage classes and staff)</option>
          </select>
        </div>
        {error && <div className="px-4 py-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl text-red-700 dark:text-red-400 text-xs">{error}</div>}
        <button onClick={handleAdd} disabled={loading} className="btn-primary w-full h-11">{loading ? 'Creating Account…' : 'Create Staff Account'}</button>
      </div>
    </Modal>
  );
}
