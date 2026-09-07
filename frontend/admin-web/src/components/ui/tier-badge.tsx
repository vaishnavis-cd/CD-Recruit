import React from 'react';

export type ExperienceTierKey =
  | '0-1'
  | '2-5'
  | '6-10'
  | '11+'
  | 'FRESHER'
  | 'LEVEL_1'
  | 'LEVEL_2'
  | 'LEVEL_3';

interface TierBadgeProps {
  tier: ExperienceTierKey | string;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}

export function TierBadge({ tier, size = 'sm', className = '' }: TierBadgeProps) {
  const normalizedTier = tier?.toUpperCase();

  let label = 'Fresher (0–1 yrs)';
  let styleClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';

  if (tier === '0-1' || normalizedTier === 'FRESHER') {
    label = 'Fresher (0–1 yrs)';
    styleClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
  } else if (tier === '2-5' || normalizedTier === 'LEVEL_1') {
    label = 'Level 1 (2–5 yrs)';
    styleClass = 'bg-blue-50 text-blue-700 border-blue-200';
  } else if (tier === '6-10' || normalizedTier === 'LEVEL_2') {
    label = 'Level 2 (6–10 yrs)';
    styleClass = 'bg-purple-50 text-purple-700 border-purple-200';
  } else if (tier === '11+' || normalizedTier === 'LEVEL_3') {
    label = 'Level 3 (11+ yrs)';
    styleClass = 'bg-amber-50 text-amber-800 border-amber-200';
  }

  const sizeClass =
    size === 'xs'
      ? 'px-2 py-0.5 text-2xs font-semibold'
      : size === 'md'
      ? 'px-3 py-1 text-sm font-semibold'
      : 'px-2.5 py-0.5 text-xs font-semibold';

  return (
    <span className={`inline-flex items-center rounded-full border ${styleClass} ${sizeClass} ${className}`}>
      {label}
    </span>
  );
}
