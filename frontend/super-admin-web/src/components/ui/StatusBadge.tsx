import React from 'react';
import { cn } from '@/lib/utils';

export interface StatusBadgeProps {
  status: string;
  variant?: 'solid' | 'subtle' | 'outline';
  className?: string;
  dot?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  variant = 'subtle',
  className,
  dot = false,
}) => {
  const normalized = (status || '').toUpperCase();

  // Mapping from domain state to semantic palette
  const getPalette = () => {
    switch (normalized) {
      // Positive / Active / Green
      case 'ACTIVE':
      case 'APPROVED':
      case 'GRANT':
      case 'CAPTURED':
      case 'PASSED':
      case 'PROMOTIONAL_SEED_GRANT':
        return {
          bg: 'bg-emerald-500/10',
          text: 'text-emerald-400',
          border: 'border-emerald-500/30',
          dotBg: 'bg-emerald-400',
        };

      // Amber / Warning / Pending
      case 'PENDING':
      case 'RESTRICTED':
      case 'EXPIRED':
      case 'REPLAY_QUEUED':
      case 'TRIAL':
        return {
          bg: 'bg-amber-500/10',
          text: 'text-amber-400',
          border: 'border-amber-500/30',
          dotBg: 'bg-amber-400',
          pulse: normalized === 'PENDING',
        };

      // Rose / Destructive / Critical
      case 'SUSPENDED':
      case 'REJECTED':
      case 'OVERDRAFT':
      case 'FAILED':
      case 'DRIFT_DETECTED':
      case 'DISPUTED':
        return {
          bg: 'bg-rose-500/10',
          text: 'text-rose-400',
          border: 'border-rose-500/30',
          dotBg: 'bg-rose-400',
        };

      // Indigo / Purple / Informational
      case 'QUEUED':
      case 'EXECUTED':
      case 'REVERSAL':
      case 'CONTRACT':
      case 'GOODWILL':
      case 'REFUND':
        return {
          bg: 'bg-indigo-500/10',
          text: 'text-indigo-400',
          border: 'border-indigo-500/30',
          dotBg: 'bg-indigo-400',
        };

      // Blue / Reversals / Tech
      case 'WAIVE':
      case 'COURTESY_WAIVER':
      case 'PURCHASE':
        return {
          bg: 'bg-cyan-500/10',
          text: 'text-cyan-400',
          border: 'border-cyan-500/30',
          dotBg: 'bg-cyan-400',
        };

      // Neutral / Muted / Default
      case 'CONSUME':
      case 'EXHAUSTED':
      case 'CANCELLED':
      case 'OFFBOARDED':
      default:
        return {
          bg: 'bg-slate-800/60',
          text: 'text-slate-300',
          border: 'border-slate-700/60',
          dotBg: 'bg-slate-400',
        };
    }
  };

  const palette = getPalette();

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md font-mono text-[10px] font-semibold border tracking-wide uppercase',
        palette.bg,
        palette.text,
        palette.border,
        className
      )}
    >
      {dot && (
        <span
          className={cn(
            'w-1.5 h-1.5 rounded-full shrink-0',
            palette.dotBg,
            palette.pulse && 'animate-pulse'
          )}
        />
      )}
      <span>{normalized.replace(/_/g, ' ')}</span>
    </span>
  );
};
