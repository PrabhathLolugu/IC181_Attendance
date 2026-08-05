import React, { useState } from 'react';
import { Avatar } from '../ui/Avatar';
import { Modal } from '../ui/Modal';
import { toast } from '../ui/Toast';
import { statusLabel } from '../../lib/utils';
import { supabase } from '../../services/supabase';
import type { Staff } from '../../types';

interface Props {
  staff: Staff;
  courseName: string;
  knownCourses: string[];
  onCourseChange: (course: string) => void;
  onLogout: () => void;
}

export function TopBar({ staff, courseName, knownCourses, onCourseChange, onLogout }: Props) {
  const [showUser, setShowUser] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showCoursePicker, setShowCoursePicker] = useState(false);
  const [customCourse, setCustomCourse] = useState('');

  function selectCourse(value: string) {
    if (value === '__custom__') return;
    onCourseChange(value);
    setShowCoursePicker(false);
  }

  function submitCustomCourse() {
    if (!customCourse.trim()) return;
    onCourseChange(customCourse.trim());
    setCustomCourse('');
    setShowCoursePicker(false);
  }

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between h-14 px-6 bg-white/90 dark:bg-[#0d1117]/90 backdrop-blur-md border-b border-slate-200/80 dark:border-[#21262d] flex-shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center shadow-sm flex-shrink-0">
            <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <span className="text-sm font-bold text-slate-900 dark:text-slate-100 tracking-tight">SmartAttend</span>
        </div>
        <span className="hidden sm:block text-slate-300 dark:text-slate-700 text-xs">|</span>

        <div className="relative">
          <button
            onClick={() => setShowCoursePicker((v) => !v)}
            className="flex items-center gap-1.5 px-2 py-1 -ml-2 rounded-lg hover:bg-slate-100 dark:hover:bg-[#21262d] transition-colors"
          >
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate max-w-[160px]">{courseName}</span>
            <svg className="w-3 h-3 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
          </button>
          {showCoursePicker && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowCoursePicker(false)} />
              <div className="absolute left-0 top-9 z-50 w-64 bg-white dark:bg-[#161b22] border border-slate-200 dark:border-[#30363d] rounded-2xl shadow-xl animate-scale-in overflow-hidden p-2">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-2 pt-1 pb-2">Viewing course</p>
                {knownCourses.map((c) => (
                  <button
                    key={c}
                    onClick={() => selectCourse(c)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${c === courseName ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 font-medium' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#21262d]'}`}
                  >
                    {c}
                  </button>
                ))}
                <div className="flex gap-1.5 mt-1 px-1">
                  <input
                    value={customCourse}
                    onChange={(e) => setCustomCourse(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && submitCustomCourse()}
                    placeholder="New course / test class…"
                    className="input-base text-xs flex-1"
                  />
                  <button onClick={submitCustomCourse} className="btn-primary btn-sm">Go</button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="relative">
        <button
          onClick={() => setShowUser((v) => !v)}
          className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-[#21262d] transition-colors"
        >
          <Avatar initials={staff.name.slice(0, 2).toUpperCase()} size="sm" />
          <div className="hidden sm:block text-left">
            <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 leading-none">{staff.name.split(' ')[0]}</p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{statusLabel(staff.role)}</p>
          </div>
          <svg className="w-3.5 h-3.5 text-slate-400 hidden sm:block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showUser && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowUser(false)} />
            <div className="absolute right-0 top-10 z-50 w-56 bg-white dark:bg-[#161b22] border border-slate-200 dark:border-[#30363d] rounded-2xl shadow-xl animate-scale-in overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 dark:border-[#21262d]">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{staff.name}</p>
                <p className="text-[11px] text-slate-500 mt-0.5 truncate">{staff.email}</p>
                <span className="badge-blue mt-1.5 inline-flex">{statusLabel(staff.role)}</span>
              </div>
              <div className="p-1.5">
                <button
                  onClick={() => { setShowUser(false); setShowPasswordModal(true); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#21262d] transition-colors"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  Change password
                </button>
                <button onClick={onLogout} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Sign out
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <ChangePasswordModal open={showPasswordModal} onClose={() => setShowPasswordModal(false)} />
    </header>
  );
}

function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    setError('');
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setLoading(true);
    const { error: updateErr } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateErr) { setError(updateErr.message); return; }
    toast('success', 'Password updated.');
    setPassword('');
    setConfirm('');
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Change Password" subtitle="Sets your password immediately — no email needed.">
      <div className="flex flex-col gap-4">
        <div>
          <label className="label">New Password</label>
          <input type="password" className="input-base" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        </div>
        <div>
          <label className="label">Confirm Password</label>
          <input type="password" className="input-base" value={confirm} onChange={(e) => setConfirm(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSave()} />
        </div>
        {error && <div className="px-4 py-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl text-red-700 dark:text-red-400 text-xs">{error}</div>}
        <button onClick={handleSave} disabled={loading} className="btn-primary w-full h-11">{loading ? 'Saving…' : 'Save Password'}</button>
      </div>
    </Modal>
  );
}
