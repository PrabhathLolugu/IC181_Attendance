import React from 'react';
import { cn, statusBadgeClass, statusLabel } from '../../lib/utils';

interface Props {
  status: string;
  dot?: boolean;
  className?: string;
}

const dotColors: Record<string, string> = {
  'badge-green':  'bg-emerald-500',
  'badge-amber':  'bg-amber-500',
  'badge-red':    'bg-red-500',
  'badge-blue':   'bg-blue-500',
  'badge-purple': 'bg-purple-500',
  'badge-slate':  'bg-slate-400',
};

export function StatusBadge({ status, dot = true, className }: Props) {
  const cls = statusBadgeClass(status);
  return (
    <span className={cn(cls, className)}>
      {dot && <span className={cn('w-1.5 h-1.5 rounded-full', dotColors[cls] ?? 'bg-slate-400')} />}
      {statusLabel(status)}
    </span>
  );
}
