import React, { useEffect, useRef } from 'react';
import { cn } from '../../lib/utils';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  children: React.ReactNode;
  footer?: React.ReactNode;
  hideClose?: boolean;
}

const sizeMap = {
  sm:   'max-w-md',
  md:   'max-w-lg',
  lg:   'max-w-2xl',
  xl:   'max-w-4xl',
  full: 'max-w-[92vw] max-h-[92vh]',
};

export function Modal({ open, onClose, title, subtitle, size = 'md', children, footer, hideClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog" aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={ref}
        className={cn(
          'relative z-10 w-full bg-white dark:bg-[#161b22]',
          'border border-slate-200/80 dark:border-[#30363d]',
          'rounded-t-3xl sm:rounded-2xl shadow-modal',
          'flex flex-col max-h-[90vh] sm:max-h-[85vh]',
          'animate-slide-up',
          sizeMap[size],
        )}
      >
        {/* Header */}
        {(title || !hideClose) && (
          <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-slate-100 dark:border-[#21262d] flex-shrink-0">
            <div>
              {title && <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h2>}
              {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>}
            </div>
            {!hideClose && (
              <button
                onClick={onClose}
                aria-label="Close modal"
                className="flex-shrink-0 ml-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-[#21262d] transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="flex-shrink-0 px-6 py-4 border-t border-slate-100 dark:border-[#21262d] flex items-center justify-end gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
