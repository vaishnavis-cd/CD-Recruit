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
          bg: 'bg-[#ecfdf3]',
          text: 'text-[#12b76a]',
          border: 'border-[#a6f4c5]',
          dotBg: 'bg-[#12b76a]',
        };

      // Amber / Warning / Pending
      case 'PENDING':
      case 'RESTRICTED':
      case 'EXPIRED':
      case 'REPLAY_QUEUED':
      case 'TRIAL':
        return {
          bg: 'bg-[#fffbeb]',
          text: 'text-[#d97706]',
          border: 'border-[#fde68a]',
          dotBg: 'bg-[#d97706]',
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
          bg: 'bg-[#fef3f2]',
          text: 'text-[#f04438]',
          border: 'border-[#fecdca]',
          dotBg: 'bg-[#f04438]',
        };

      // Indigo / Purple / Informational
      case 'QUEUED':
      case 'EXECUTED':
      case 'REVERSAL':
      case 'CONTRACT':
      case 'GOODWILL':
      case 'REFUND':
        return {
          bg: 'bg-[#f5f3ff]',
          text: 'text-[#7c3aed]',
          border: 'border-[#ddd6fe]',
          dotBg: 'bg-[#7c3aed]',
        };

      // Blue / Reversals / Tech
      case 'WAIVE':
      case 'COURTESY_WAIVER':
      case 'PURCHASE':
        return {
          bg: 'bg-[#eff6ff]',
          text: 'text-[#2f68ff]',
          border: 'border-[#bfdbfe]',
          dotBg: 'bg-[#2f68ff]',
        };

      // Neutral / Muted / Default
      case 'CONSUME':
      case 'EXHAUSTED':
      case 'CANCELLED':
      case 'OFFBOARDED':
      default:
        return {
          bg: 'bg-[#f1f5f9]',
          text: 'text-[#64748b]',
          border: 'border-[#e2e8f0]',
          dotBg: 'bg-slate-400',
        };
    }
  };

  const palette = getPalette();

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-mono text-[10px] font-semibold border tracking-wide uppercase transition-colors',
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
