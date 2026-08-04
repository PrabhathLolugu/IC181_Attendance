import React, { useState } from 'react';
import { Avatar } from '../ui/Avatar';
import { statusLabel } from '../../lib/utils';
import type { Staff } from '../../types';

interface Props {
  staff: Staff;
  courseName: string;
  onLogout: () => void;
}

export function TopBar({ staff, courseName, onLogout }: Props) {
  const [showUser, setShowUser] = useState(false);

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
        <span className="hidden sm:block text-xs text-slate-500 dark:text-slate-400 truncate">{courseName}</span>
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
    </header>
  );
}
