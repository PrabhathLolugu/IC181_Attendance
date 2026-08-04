import React, { useState } from 'react';
import { cn } from '../../lib/utils';

interface Props {
  src?: string;
  initials: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  status?: 'online' | 'offline' | 'away';
  className?: string;
  ring?: string;
}

const sizeMap = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
  xl: 'h-16 w-16 text-xl',
};

const statusColors = {
  online:  'bg-emerald-500 border-white',
  offline: 'bg-slate-400 border-white',
  away:    'bg-amber-400 border-white',
};

export function Avatar({ src, initials, size = 'md', status, className, ring }: Props) {
  const [imgError, setImgError] = useState(false);
  return (
    <div className={cn('relative flex-shrink-0', className)}>
      <div
        className={cn(
          'rounded-full flex items-center justify-center font-semibold select-none',
          'bg-gradient-to-br from-blue-500 to-blue-700 text-white',
          sizeMap[size],
          ring && 'ring-2 ring-offset-1',
          ring,
        )}
      >
        {src && !imgError ? (
          <img
            src={src} alt={initials}
            className="rounded-full w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <span>{initials}</span>
        )}
      </div>
      {status && (
        <span
          className={cn(
            'absolute bottom-0 right-0 block rounded-full border-2',
            size === 'xs' || size === 'sm' ? 'h-2 w-2' : 'h-2.5 w-2.5',
            statusColors[status],
          )}
        />
      )}
    </div>
  );
}
