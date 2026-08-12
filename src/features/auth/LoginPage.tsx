import React, { useState } from 'react';
import { supabase } from '../../services/supabase';
import { toast } from '../../components/ui/Toast';

interface Props {
  onLoggedIn: () => void;
}

export function LoginPage({ onLoggedIn }: Props) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPwd, setShowPwd] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!email.trim()) { setError('Please enter your email address.'); return; }
    if (!password) { setError('Please enter your password.'); return; }

    setLoading(true);

    if (mode === 'signup') {
      if (!name.trim()) { setError('Please enter your name.'); setLoading(false); return; }
      const cleanEmail = email.trim().toLowerCase();
      const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: { name: name.trim() },
        },
      });

      if (signUpErr) {
        setLoading(false);
        setError(signUpErr.message);
        return;
      }

      if (signUpData.session) {
        setLoading(false);
        toast('success', 'Account created! Welcome to SmartAttend.');
        onLoggedIn();
      } else {
        // Automatically sign in directly with password (no email confirmation needed)
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        setLoading(false);
        if (signInErr) {
          setError(signInErr.message);
        } else {
          toast('success', 'Account created! Welcome to SmartAttend.');
          onLoggedIn();
        }
      }
      return;
    }

    const { error: authErr } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    setLoading(false);

    if (authErr) {
      setError('Incorrect email or password.');
      return;
    }
    toast('success', 'Welcome back!');
    onLoggedIn();
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0d1117] flex">
      <div className="hidden lg:flex flex-col w-[480px] bg-gradient-to-br from-blue-600 via-blue-700 to-blue-900 relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-white/5" />
        <div className="absolute -bottom-16 -left-16 w-56 h-56 rounded-full bg-white/5" />
        <div className="absolute top-1/3 right-8 w-36 h-36 rounded-full bg-white/5" />

        <div className="relative z-10 flex flex-col h-full p-12">
          <div className="flex items-center gap-3 mb-auto">
            <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center">
              <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 012-2h2a2 2 0 012-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <div>
              <p className="text-white font-bold text-lg tracking-tight">SmartAttend</p>
              <p className="text-blue-200 text-xs">General Attendance System</p>
            </div>
          </div>

          <div className="my-auto">
            <h1 className="text-4xl font-bold text-white leading-tight tracking-tight">
              Attendance,<br /><span className="text-blue-200">made effortless.</span>
            </h1>
            <p className="text-blue-100 mt-4 text-base leading-relaxed max-w-xs">
              Host your own classes, colloquiums, workshops & special sessions with GPS + dynamic QR verification.
            </p>
            <div className="mt-8 flex flex-col gap-3">
              {[
                'Create and manage your own classes & courses',
                'Support for Lectures, Colloquiums, Seminars & Workshops',
                'Server-verified GPS + dynamic rotating QR codes',
                'Real-time live check-ins and instant Excel/CSV exports',
              ].map((f) => (
                <div key={f} className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-full bg-emerald-400/20 flex items-center justify-center flex-shrink-0">
                    <svg className="w-3 h-3 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-blue-100 text-sm">{f}</p>
                </div>
              ))}
            </div>
          </div>

          <p className="text-blue-300 text-xs mt-auto">© {new Date().getFullYear()} SmartAttend</p>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md animate-slide-up">
          <div className="flex items-center gap-2 mb-8 lg:hidden justify-center">
            <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <span className="font-bold text-slate-900 dark:text-slate-100 text-lg">SmartAttend</span>
          </div>

          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {mode === 'signin' ? 'Sign In to SmartAttend' : 'Create an Account'}
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
            {mode === 'signin'
              ? 'Sign in to manage your classes and run live attendance sessions.'
              : 'Register now to host your own classes, colloquiums, or events.'}
          </p>

          <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
            {mode === 'signup' && (
              <div>
                <label htmlFor="name" className="label">Full Name</label>
                <input
                  id="name" type="text" required
                  value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="Dr. Alex Rivera"
                  className="input-base"
                />
              </div>
            )}

            <div>
              <label htmlFor="email" className="label">Email Address</label>
              <input
                id="email" type="email" autoComplete="email" required
                value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@institution.edu"
                className="input-base"
              />
            </div>

            <div>
              <label htmlFor="password" className="label">Password</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPwd ? 'text' : 'password'}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input-base pr-10"
                />
                <button
                  type="button" tabIndex={-1}
                  onClick={() => setShowPwd((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPwd ? (
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/></svg>
                  ) : (
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 px-4 py-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl text-red-700 dark:text-red-400 text-sm animate-slide-down">
                <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01"/></svg>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full mt-2 h-11 text-sm font-semibold">
              {loading ? (mode === 'signup' ? 'Creating Account…' : 'Signing in…') : (mode === 'signup' ? 'Create Account' : 'Sign in')}
            </button>
          </form>

          <div className="mt-6 text-center">
            {mode === 'signin' ? (
              <p className="text-xs text-slate-500">
                Don't have an account yet?{' '}
                <button onClick={() => { setMode('signup'); setError(''); }} className="text-blue-600 hover:underline font-semibold">
                  Create Account
                </button>
              </p>
            ) : (
              <p className="text-xs text-slate-500">
                Already have an account?{' '}
                <button onClick={() => { setMode('signin'); setError(''); }} className="text-blue-600 hover:underline font-semibold">
                  Sign In
                </button>
              </p>
            )}
          </div>

          <div className="mt-6 p-4 bg-slate-50 dark:bg-[#21262d] border border-slate-200 dark:border-[#30363d] rounded-xl text-center">
            <p className="text-xs text-slate-500 dark:text-slate-400">Are you a student?</p>
            <p className="text-xs text-slate-700 dark:text-slate-300 mt-0.5 font-medium">Scan the QR code shown in class — no account required.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
