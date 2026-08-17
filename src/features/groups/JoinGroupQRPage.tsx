import React, { useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from '../../components/ui/Toast';

export function JoinGroupQRPage() {
  const [fullscreen, setFullscreen] = useState(false);

  const joinUrl = useMemo(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('join_group', '1');
    return url.toString();
  }, []);

  function handleCopy() {
    navigator.clipboard.writeText(joinUrl);
    toast('success', 'Join Group link copied to clipboard!');
  }

  if (fullscreen) {
    return (
      <main className="fixed inset-0 z-50 bg-white dark:bg-[#0d1117] flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-300">
        <button
          onClick={() => setFullscreen(false)}
          className="absolute top-6 right-6 p-2 rounded-xl bg-slate-100 dark:bg-[#21262d] text-slate-600 dark:text-slate-300 hover:bg-slate-200 transition-colors"
          title="Exit Fullscreen"
        >
          <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>

        <h1 className="text-4xl sm:text-5xl font-black text-slate-900 dark:text-white tracking-tight mb-3">
          Join Your Group
        </h1>
        <p className="text-lg sm:text-xl text-slate-500 dark:text-slate-400 mb-8 max-w-lg">
          Scan the QR code, enter your roll number, and connect to your assigned MyItihas group.
        </p>

        <div className="p-8 bg-white rounded-[2.5rem] shadow-2xl border-4 border-slate-200 dark:border-[#30363d] transition-transform hover:scale-[1.01]">
          <QRCodeSVG
            value={joinUrl}
            size={400}
            level="H"
            fgColor="#0f172a"
            bgColor="#ffffff"
          />
        </div>

        <p className="mt-8 text-sm text-slate-400 font-mono tracking-wider max-w-md break-all">
          {joinUrl}
        </p>
      </main>
    );
  }

  return (
    <main className="page flex flex-col items-center justify-center min-h-[82vh] text-center">
      <div className="max-w-xl w-full bg-white dark:bg-[#161b22] rounded-3xl shadow-xl overflow-hidden border border-slate-200/80 dark:border-[#30363d] p-8 sm:p-10 flex flex-col items-center relative">
        <div className="w-12 h-12 rounded-2xl bg-blue-600/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400 flex items-center justify-center mb-4">
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
          </svg>
        </div>

        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight mb-2">
          Join Communication Groups
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mb-8 text-sm sm:text-base max-w-md">
          Students can scan this QR code to check their group assignment and join the dedicated chat channel.
        </p>

        <div className="bg-white p-6 rounded-3xl shadow-inner border border-slate-100 dark:border-slate-800">
          <QRCodeSVG
            value={joinUrl}
            size={280}
            level="H"
            fgColor="#0f172a"
            bgColor="#ffffff"
          />
        </div>

        <div className="flex items-center gap-3 mt-8 flex-wrap justify-center">
          <button
            onClick={() => setFullscreen(true)}
            className="btn-primary btn-sm inline-flex items-center gap-1.5 px-4 py-2"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
            Full Screen QR
          </button>
          <button
            onClick={handleCopy}
            className="btn-secondary btn-sm inline-flex items-center gap-1.5 px-4 py-2"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            Copy Link
          </button>
          <a
            href={joinUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost btn-sm inline-flex items-center gap-1.5 px-4 py-2 text-slate-500 hover:text-slate-900 dark:hover:text-white"
          >
            Test Flow ↗
          </a>
        </div>

        <p className="mt-6 text-xs text-slate-400 font-mono tracking-wider break-all max-w-sm">
          {joinUrl}
        </p>
      </div>
    </main>
  );
}
