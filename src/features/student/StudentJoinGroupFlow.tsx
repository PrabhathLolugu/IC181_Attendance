import React, { useState } from 'react';
import { supabase } from '../../services/supabase';
import { GROUP_LINKS, FALLBACK_JOIN_FORM_LINK } from '../../lib/groupLinks';
import { toast } from '../../components/ui/Toast';
import type { Student } from '../../types';

interface Props {
  onBack?: () => void;
}

export function StudentJoinGroupFlow({ onBack }: Props) {
  const [rollNumber, setRollNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<'idle' | 'found' | 'not-found'>('idle');
  const [student, setStudent] = useState<Student | null>(null);

  // Normalize group label (e.g. "Group A", "group a", "a" -> "A")
  const getNormalizedGroup = (groupLabel?: string | null): string => {
    if (!groupLabel) return '';
    return groupLabel.trim().replace(/^group\s*/i, '').toUpperCase();
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const finalRoll = rollNumber.trim();
    if (!finalRoll) return;

    setLoading(true);
    setResult('idle');
    try {
      const { data, error } = await supabase
        .from('students')
        .select('*')
        .ilike('roll_number', finalRoll)
        .eq('status', 'active')
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        setResult('not-found');
      } else {
        setStudent(data);
        setResult('found');
      }
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'An error occurred.');
    } finally {
      setLoading(false);
    }
  }

  const assignedGroup = getNormalizedGroup(student?.group_label);
  const groupLink = GROUP_LINKS[assignedGroup];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0d1117] flex flex-col text-slate-900 dark:text-slate-100">
      <header className="bg-white dark:bg-[#161b22] border-b border-slate-200 dark:border-[#30363d] px-6 py-4 flex items-center justify-between shadow-sm shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-600/20">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900 dark:text-white leading-tight">MyItihas</h1>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Group Connect</p>
          </div>
        </div>
        {onBack && (
          <button onClick={onBack} className="text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#30363d]">
            Close
          </button>
        )}
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md bg-white dark:bg-[#161b22] rounded-3xl shadow-xl border border-slate-200/80 dark:border-[#30363d] p-6 sm:p-8">
          
          {result === 'idle' && (
            <form onSubmit={handleSubmit} className="flex flex-col gap-6">
              <div className="text-center">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                  </svg>
                </div>
                <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Find Your Group</h2>
                <p className="text-slate-500 text-xs sm:text-sm mt-1">Enter your Roll Number to find your group and join the chat.</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                  Roll / Participant ID
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="e.g. B26135 or IM26006"
                  value={rollNumber}
                  onChange={(e) => setRollNumber(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-[#0d1117] border border-slate-200 dark:border-[#30363d] rounded-2xl px-4 py-3.5 text-base sm:text-lg font-mono font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all placeholder:text-slate-400 uppercase"
                />
              </div>

              <button
                type="submit"
                disabled={loading || !rollNumber.trim()}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 text-white font-semibold py-3.5 rounded-2xl transition-all shadow-md shadow-blue-600/20 active:scale-[0.98]"
              >
                {loading ? 'Checking Directory…' : 'Find My Group →'}
              </button>
            </form>
          )}

          {result === 'found' && student && (
            <div className="flex flex-col gap-5 text-center animate-in fade-in duration-300">
              <div className="w-16 h-16 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto">
                <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                  <polyline points="22 4 12 14.01 9 11.01"></polyline>
                </svg>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Student Verified</p>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mt-0.5">{student.name}</h2>
                <p className="text-xs font-mono text-slate-500 mt-0.5">{student.roll_number}{student.department ? ` · ${student.department}` : ''}</p>
              </div>

              {groupLink ? (
                <div className="bg-slate-50 dark:bg-[#0d1117] border border-slate-200 dark:border-[#30363d] rounded-2xl p-5 sm:p-6 text-center">
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-2">You are assigned to</p>
                  <div className="inline-flex items-center justify-center px-4 py-2 rounded-2xl bg-blue-600/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 text-2xl sm:text-3xl font-black mb-5">
                    Group {assignedGroup}
                  </div>
                  
                  <a
                    href={groupLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-blue-600/20 active:scale-[0.98]"
                  >
                    <span>Join Group {assignedGroup} Chat</span>
                    <svg className="w-4 h-4 ml-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                      <polyline points="15 3 21 3 21 9"></polyline>
                      <line x1="10" y1="14" x2="21" y2="3"></line>
                    </svg>
                  </a>
                </div>
              ) : (
                <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-2xl p-5 sm:p-6 text-center">
                  <div className="w-10 h-10 bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-full flex items-center justify-center mx-auto mb-3">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"></circle>
                      <line x1="12" y1="8" x2="12" y2="12"></line>
                      <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                  </div>
                  <p className="text-amber-800 dark:text-amber-300 font-bold text-sm">No Group Assigned</p>
                  <p className="text-amber-700/80 dark:text-amber-400/80 text-xs mt-1 mb-4">You have not been assigned to a group yet. Please fill out the group assignment form below.</p>
                  
                  <a
                    href={FALLBACK_JOIN_FORM_LINK}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center w-full bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm py-3.5 rounded-xl transition-all shadow-md active:scale-[0.98]"
                  >
                    Request Group Assignment ↗
                  </a>
                </div>
              )}

              <button
                type="button"
                onClick={() => { setResult('idle'); setRollNumber(''); setStudent(null); }}
                className="text-xs font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              >
                ← Check another roll number
              </button>
            </div>
          )}

          {result === 'not-found' && (
            <div className="flex flex-col gap-5 text-center animate-in fade-in duration-300">
              <div className="w-16 h-16 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center mx-auto">
                <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="15" y1="9" x2="9" y2="15"></line>
                  <line x1="9" y1="9" x2="15" y2="15"></line>
                </svg>
              </div>

              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Roll Number Not Found</h2>
                <p className="text-slate-500 text-xs mt-1">
                  Roll <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{rollNumber}</span> is not registered in the active directory.
                </p>
              </div>

              <div className="bg-slate-50 dark:bg-[#0d1117] border border-slate-200 dark:border-[#30363d] rounded-2xl p-5 text-center">
                <p className="text-xs text-slate-600 dark:text-slate-400 mb-4">
                  If you have just enrolled or have not been added yet, please submit your details through the group request form:
                </p>
                <a
                  href={FALLBACK_JOIN_FORM_LINK}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm py-3.5 rounded-xl transition-all shadow-md active:scale-[0.98]"
                >
                  Open Group Request Form ↗
                </a>
              </div>

              <button
                type="button"
                onClick={() => { setResult('idle'); setRollNumber(''); }}
                className="text-xs font-semibold text-blue-600 hover:text-blue-700"
              >
                ← Try another Roll Number
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
