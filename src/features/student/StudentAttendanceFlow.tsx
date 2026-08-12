import React, { useEffect, useRef, useState } from 'react';
import { getDeviceFingerprint } from '../../lib/deviceFingerprint';
import { callFunction } from '../../lib/api';
import { CameraScanner } from '../../components/shared/CameraScanner';
import type { Student, Session, AttendanceRecord } from '../../types';

type Step =
  | 'need_token'
  | 'gps'
  | 'roll'
  | 'confirm'
  | 'enroll'
  | 'submitting'
  | 'success'
  | 'duplicate'
  | 'device_blocked'
  | 'override_pending'
  | 'override_code'
  | 'error';

interface Props {
  initialToken?: string | null;
  onBack?: () => void;
}

interface Position {
  lat: number;
  lng: number;
  accuracy: number;
}

interface EnrollForm {
  name: string;
  email: string;
  phone: string;
  department: string;
  program: string;
  semester: string;
  batch: string;
}

const emptyEnrollForm: EnrollForm = {
  name: '', email: '', phone: '', department: '', program: '', semester: '', batch: '',
};

export function StudentAttendanceFlow({ initialToken, onBack }: Props) {
  const [step, setStep] = useState<Step>(initialToken ? 'gps' : 'need_token');
  const [showScanner, setShowScanner] = useState(false);
  const [token, setToken] = useState<string | null>(initialToken ?? null);

  const [gpsLoading, setGpsLoading] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);
  const [gpsDenied, setGpsDenied] = useState(false);

  const [roll, setRoll] = useState('');
  const [rollLoading, setRollLoading] = useState(false);
  const [student, setStudent] = useState<Student | null>(null);
  const [enrollForm, setEnrollForm] = useState<EnrollForm>(emptyEnrollForm);

  const [overrideCode, setOverrideCode] = useState('');
  const [overrideReason, setOverrideReason] = useState<string>('');

  const [error, setError] = useState('');
  const [result, setResult] = useState<{ record?: AttendanceRecord; session?: Session } | null>(null);
  const [duplicateInfo, setDuplicateInfo] = useState<{ markedAt?: string; status?: string } | null>(null);
  const [deviceBlockedRoll, setDeviceBlockedRoll] = useState<string | null>(null);

  const rollRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === 'roll') rollRef.current?.focus();
  }, [step]);

  function extractToken(scanned: string): string {
    try {
      const url = new URL(scanned);
      const t = url.searchParams.get('attend');
      if (t) return t;
    } catch {
      /* not a URL — treat the raw scanned text as the token */
    }
    return scanned.trim();
  }

  function handleScanResult(data: string) {
    setShowScanner(false);
    setToken(extractToken(data));
    setStep('gps');
  }

  function requestGps() {
    setGpsLoading(true);
    setError('');
    if (!navigator.geolocation) {
      setPosition(null);
      setGpsDenied(true);
      setGpsLoading(false);
      setStep('roll');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
        setGpsDenied(false);
        setGpsLoading(false);
        setStep('roll');
      },
      (err) => {
        setPosition(null);
        setGpsDenied(err.code === err.PERMISSION_DENIED);
        setGpsLoading(false);
        setStep('roll');
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  }

  async function handleRollSubmit() {
    const cleaned = roll.trim().toUpperCase();
    if (!cleaned) { setError('Please enter your roll number.'); return; }
    setRoll(cleaned);
    setRollLoading(true);
    setError('');
    try {
      const res = await callFunction<{ exists: boolean; student?: Student }>('student-check', { rollNumber: cleaned });
      if (res.exists && res.student) {
        setStudent(res.student);
        setEnrollForm({
          name: res.student.name,
          email: res.student.email ?? '',
          phone: res.student.phone ?? '',
          department: res.student.department ?? '',
          program: res.student.program ?? '',
          semester: res.student.semester ?? '',
          batch: res.student.batch ?? '',
        });
        setStep('confirm');
      } else {
        setEnrollForm(emptyEnrollForm);
        setStep('enroll');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setRollLoading(false);
    }
  }

  async function handleEnrollSubmit() {
    if (!enrollForm.name.trim()) { setError('Please enter your full name.'); return; }
    setRollLoading(true);
    setError('');
    try {
      const res = await callFunction<{ student?: Student; error?: string; code?: string }>('student-enroll', {
        rollNumber: roll,
        ...enrollForm,
      });
      if (res.student) {
        setStudent(res.student);
        await submitAttendance();
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Registration failed.';
      if (message.includes('already registered')) {
        // someone else registered this roll number a moment ago — fetch and continue
        try {
          const check = await callFunction<{ exists: boolean; student?: Student }>('student-check', { rollNumber: roll });
          if (check.exists && check.student) {
            setStudent(check.student);
            setStep('confirm');
            setRollLoading(false);
            return;
          }
        } catch {
          /* fall through to showing the original error */
        }
      }
      setError(message);
      setRollLoading(false);
    }
  }

  async function submitAttendance() {
    if (!token) return;
    setStep('submitting');
    setError('');
    try {
      const deviceFingerprint = await getDeviceFingerprint();
      const res = await callFunction<{
        record?: AttendanceRecord;
        session?: Session;
        duplicate?: boolean;
        markedAt?: string;
        status?: string;
        overridePending?: boolean;
        reason?: string;
        deviceBlocked?: boolean;
        blockedRoll?: string;
      }>('attendance-submit', {
        qrToken: token,
        rollNumber: roll,
        lat: position?.lat,
        lng: position?.lng,
        accuracy: position?.accuracy,
        gpsDenied,
        deviceFingerprint,
      });

      if (res.deviceBlocked) {
        setDeviceBlockedRoll(res.blockedRoll ?? null);
        setStep('device_blocked');
      } else if (res.duplicate) {
        setDuplicateInfo({ markedAt: res.markedAt, status: res.status });
        setStep('duplicate');
      } else if (res.overridePending) {
        setOverrideReason(res.reason ?? '');
        setStep('override_pending');
      } else if (res.record) {
        setResult({ record: res.record, session: res.session });
        setStep('success');
      } else {
        setError('Something went wrong. Please try again.');
        setStep('error');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
      setStep('error');
    }
  }

  async function handleConfirm() {
    setRollLoading(true);
    await submitAttendance();
    setRollLoading(false);
  }

  async function handleOverrideCodeSubmit() {
    if (!token || !overrideCode.trim()) { setError('Please enter the code your instructor gave you.'); return; }
    setRollLoading(true);
    setError('');
    try {
      const deviceFingerprint = await getDeviceFingerprint();
      const res = await callFunction<{
        record?: AttendanceRecord;
        duplicate?: boolean;
        deviceBlocked?: boolean;
        blockedRoll?: string;
      }>('override-code-redeem', {
        qrToken: token,
        rollNumber: roll,
        code: overrideCode.trim(),
        deviceFingerprint,
      });
      if (res.deviceBlocked) {
        setDeviceBlockedRoll(res.blockedRoll ?? null);
        setStep('device_blocked');
      } else if (res.duplicate) {
        setStep('duplicate');
      } else if (res.record) {
        setResult({ record: res.record });
        setStep('success');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Incorrect or expired code.');
    } finally {
      setRollLoading(false);
    }
  }

  function reset() {
    setRoll('');
    setStudent(null);
    setEnrollForm(emptyEnrollForm);
    setOverrideCode('');
    setError('');
    setResult(null);
    setDuplicateInfo(null);
    setDeviceBlockedRoll(null);
    setStep('roll');
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0d1117] flex flex-col items-center justify-center p-4">
      {showScanner && <CameraScanner onScan={handleScanResult} onClose={() => setShowScanner(false)} />}

      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-8 justify-center">
          <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <span className="font-bold text-slate-900 dark:text-slate-100 text-lg">SmartAttend</span>
        </div>

        {step === 'need_token' && (
          <div className="animate-slide-up text-center">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Mark Attendance</h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Scan the QR code your instructor is showing in class.</p>
            <button onClick={() => setShowScanner(true)} className="btn-primary w-full h-12 mt-6">Scan QR Code</button>
            {onBack && (
              <button onClick={onBack} className="mt-4 w-full text-center text-sm text-slate-400 hover:text-slate-600 transition-colors">
                ← Back to staff login
              </button>
            )}
          </div>
        )}

        {step === 'gps' && (
          <div className="animate-slide-up">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Enable Location</h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
              We use your location once to verify you're physically present in class.
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <button onClick={requestGps} disabled={gpsLoading} className="btn-primary w-full h-12">
                {gpsLoading ? 'Getting your location…' : 'Allow Location & Continue'}
              </button>
              <button onClick={() => { setGpsDenied(true); setPosition(null); setStep('roll'); }} className="btn-ghost w-full text-xs">
                Continue without location
              </button>
            </div>
          </div>
        )}

        {step === 'roll' && (
          <div className="animate-slide-up">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Enter Your Roll Number</h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">We'll fetch your details automatically.</p>
            <div className="mt-6 flex flex-col gap-4">
              <input
                ref={rollRef}
                className="input-base text-lg tracking-widest text-center h-14 font-mono font-bold"
                placeholder="B23CS001"
                value={roll}
                onChange={(e) => { setRoll(e.target.value.toUpperCase()); setError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && handleRollSubmit()}
                autoCapitalize="characters"
                autoFocus
              />
              {error && <ErrorBox message={error} />}
              <button onClick={handleRollSubmit} disabled={rollLoading} className="btn-primary w-full h-12">
                {rollLoading ? 'Finding…' : 'Continue'}
              </button>
            </div>
          </div>
        )}

        {step === 'confirm' && student && (
          <div className="animate-slide-up">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Confirm Your Details</h2>
            <div className="mt-4 card p-4 flex flex-col gap-1.5">
              <p className="font-semibold text-slate-900 dark:text-slate-100">{student.name}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{student.roll_number}</p>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {[student.department, student.program, student.semester && `Sem ${student.semester}`, student.group_label && `Group ${student.group_label}`, student.batch]
                  .filter(Boolean)
                  .map((v) => (
                    <span key={String(v)} className="badge-slate">{v}</span>
                  ))}
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-3">
              <div>
                <label className="label">Email</label>
                <input className="input-base" value={enrollForm.email} onChange={(e) => setEnrollForm((f) => ({ ...f, email: e.target.value }))} />
              </div>
              <div>
                <label className="label">Phone</label>
                <input className="input-base" value={enrollForm.phone} onChange={(e) => setEnrollForm((f) => ({ ...f, phone: e.target.value }))} />
              </div>
            </div>
            {error && <ErrorBox message={error} className="mt-3" />}
            <div className="mt-6 flex flex-col gap-2">
              <button onClick={handleConfirm} disabled={rollLoading} className="btn-primary w-full h-12">
                {rollLoading ? 'Marking attendance…' : 'Confirm & Mark Attendance'}
              </button>
              <button onClick={reset} className="btn-ghost w-full text-xs">Not you? Use a different roll number</button>
            </div>
          </div>
        )}

        {step === 'enroll' && (
          <div className="animate-slide-up">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">First Time Here?</h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
              We don't have a profile for <span className="font-mono font-semibold">{roll}</span> yet — add your details once.
            </p>
            <div className="mt-4 flex flex-col gap-3">
              <div>
                <label className="label">Full Name *</label>
                <input className="input-base" value={enrollForm.name} onChange={(e) => setEnrollForm((f) => ({ ...f, name: e.target.value }))} autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Email</label>
                  <input className="input-base" type="email" value={enrollForm.email} onChange={(e) => setEnrollForm((f) => ({ ...f, email: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Phone</label>
                  <input className="input-base" value={enrollForm.phone} onChange={(e) => setEnrollForm((f) => ({ ...f, phone: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Department</label>
                  <input className="input-base" value={enrollForm.department} onChange={(e) => setEnrollForm((f) => ({ ...f, department: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Program</label>
                  <input className="input-base" value={enrollForm.program} onChange={(e) => setEnrollForm((f) => ({ ...f, program: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Semester</label>
                  <input className="input-base" value={enrollForm.semester} onChange={(e) => setEnrollForm((f) => ({ ...f, semester: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Batch</label>
                  <input className="input-base" value={enrollForm.batch} onChange={(e) => setEnrollForm((f) => ({ ...f, batch: e.target.value }))} />
                </div>
              </div>
            </div>
            {error && <ErrorBox message={error} className="mt-3" />}
            <button onClick={handleEnrollSubmit} disabled={rollLoading} className="btn-primary w-full h-12 mt-5">
              {rollLoading ? 'Saving…' : 'Register & Mark Attendance'}
            </button>
          </div>
        )}

        {step === 'submitting' && (
          <div className="flex flex-col items-center gap-4 py-16 animate-fade-in">
            <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-600 dark:text-slate-400 text-sm font-medium">Verifying your attendance…</p>
          </div>
        )}

        {step === 'success' && (
          <div className="flex flex-col items-center gap-4 py-8 text-center animate-scale-in">
            <div className="w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center">
              <svg className="w-8 h-8 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">Attendance Recorded</p>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">{roll} · {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</p>
            </div>
            <button onClick={reset} className="btn-secondary w-full">Done</button>
          </div>
        )}

        {step === 'duplicate' && (
          <div className="flex flex-col items-center gap-4 py-8 text-center animate-scale-in">
            <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-[#21262d] flex items-center justify-center">
              <svg className="w-8 h-8 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            </div>
            <div>
              <p className="text-xl font-bold text-slate-900 dark:text-slate-100">Attendance Already Submitted</p>
              {duplicateInfo?.markedAt && (
                <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                  Recorded at {new Date(duplicateInfo.markedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
            </div>
            <button onClick={reset} className="btn-secondary w-full">Close</button>
          </div>
        )}

        {step === 'device_blocked' && (
          <div className="flex flex-col items-center gap-4 py-8 text-center animate-scale-in">
            <div className="w-16 h-16 rounded-full bg-red-50 dark:bg-red-500/10 flex items-center justify-center">
              <svg className="w-8 h-8 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m0 0v2m0-2h2m-2 0H10M9 7H7a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V9a2 2 0 00-2-2h-2M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2M9 7h6" />
              </svg>
            </div>
            <div>
              <p className="text-xl font-bold text-slate-900 dark:text-slate-100">Device Already Used</p>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-2">
                This device has already been used to mark attendance
                {deviceBlockedRoll ? (
                  <> for <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">{deviceBlockedRoll}</span></>
                ) : null}{' '}
                in this session.
              </p>
              <p className="text-slate-400 dark:text-slate-500 text-xs mt-2">
                Only one attendance per device is allowed per session.<br />
                If you genuinely need to mark attendance, please ask your instructor to add you manually.
              </p>
            </div>
            <button onClick={reset} className="btn-secondary w-full">Close</button>
          </div>
        )}

        {step === 'override_pending' && (
          <div className="flex flex-col items-center gap-4 py-8 text-center animate-scale-in">
            <div className="w-16 h-16 rounded-full bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center">
              <svg className="w-8 h-8 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
            </div>
            <div>
              <p className="text-xl font-bold text-slate-900 dark:text-slate-100">We Couldn't Verify Your Location</p>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                {overrideReason === 'outside_radius'
                  ? 'You appear to be outside the classroom.'
                  : 'This can happen indoors or with weak GPS signal.'}
                {' '}Your instructor has been notified and can approve you — or give you a code.
              </p>
            </div>
            <div className="flex flex-col gap-2 w-full">
              <button onClick={() => setStep('override_code')} className="btn-primary w-full">Enter Instructor Code</button>
              <button onClick={requestGps} className="btn-outline w-full">Retry Location</button>
              <button onClick={reset} className="btn-ghost w-full text-xs">Close</button>
            </div>
          </div>
        )}

        {step === 'override_code' && (
          <div className="animate-slide-up">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Enter Instructor Code</h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Ask your instructor or TA for the 6-digit code.</p>
            <div className="mt-6 flex flex-col gap-4">
              <input
                className="input-base text-2xl tracking-[0.4em] text-center h-14 font-mono font-bold"
                placeholder="000000"
                inputMode="numeric"
                maxLength={6}
                value={overrideCode}
                onChange={(e) => setOverrideCode(e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => e.key === 'Enter' && handleOverrideCodeSubmit()}
                autoFocus
              />
              {error && <ErrorBox message={error} />}
              <button onClick={handleOverrideCodeSubmit} disabled={rollLoading} className="btn-primary w-full h-12">
                {rollLoading ? 'Checking…' : 'Submit Code'}
              </button>
            </div>
          </div>
        )}

        {step === 'error' && (
          <div className="flex flex-col items-center gap-4 py-8 text-center animate-scale-in">
            <div className="w-16 h-16 rounded-full bg-red-50 dark:bg-red-500/10 flex items-center justify-center">
              <svg className="w-8 h-8 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01"/></svg>
            </div>
            <div>
              <p className="text-xl font-bold text-slate-900 dark:text-slate-100">Something Went Wrong</p>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">{error}</p>
            </div>
            <button onClick={reset} className="btn-secondary w-full">Try Again</button>
          </div>
        )}
      </div>
    </div>
  );
}

function ErrorBox({ message, className = '' }: { message: string; className?: string }) {
  return (
    <div className={`flex items-start gap-2 px-4 py-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl text-red-700 dark:text-red-400 text-xs ${className}`}>
      {message}
    </div>
  );
}
