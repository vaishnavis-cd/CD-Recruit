import React from 'react';

export type StatusBadgeVariant =
  | 'brand'
  | 'success'
  | 'warning'
  | 'danger'
  | 'neutral'
  | 'purple'
  | 'active'
  | 'closed'
  | 'draft'
  | 'scheduled';

export type StatusBadgeSize = 'xs' | 'sm' | 'md';

interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: StatusBadgeVariant;
  size?: StatusBadgeSize;
  dot?: boolean;
  pulse?: boolean;
  children: React.ReactNode;
}

const VARIANT_STYLES: Record<StatusBadgeVariant, { bg: string; dot: string }> = {
  brand: {
    bg: 'bg-brand-subtle text-brand-ink border-brand-border',
    dot: 'bg-brand',
  },
  success: {
    bg: 'bg-success-subtle text-emerald-800 border-emerald-200',
    dot: 'bg-success',
  },
  active: {
    bg: 'bg-success-subtle text-emerald-800 border-emerald-200',
    dot: 'bg-success',
  },
  warning: {
    bg: 'bg-warning-subtle text-amber-800 border-amber-200',
    dot: 'bg-warning',
  },
  scheduled: {
    bg: 'bg-blue-50 text-blue-800 border-blue-200',
    dot: 'bg-blue-500',
  },
  danger: {
    bg: 'bg-danger-subtle text-red-800 border-danger-border',
    dot: 'bg-danger',
  },
  closed: {
    bg: 'bg-surface-inset text-ink-secondary border-line',
    dot: 'bg-ink-tertiary',
  },
  draft: {
    bg: 'bg-surface-inset text-ink-secondary border-line',
    dot: 'bg-ink-tertiary',
  },
  neutral: {
    bg: 'bg-surface-inset text-ink-secondary border-line',
    dot: 'bg-ink-tertiary',
  },
  purple: {
    bg: 'bg-purple-50 text-purple-800 border-purple-200',
    dot: 'bg-purple-600',
  },
};

const SIZE_STYLES: Record<StatusBadgeSize, string> = {
  xs: 'px-2 py-0.5 text-2xs font-medium',
  sm: 'px-2.5 py-0.5 text-xs font-semibold',
  md: 'px-3 py-1 text-sm font-semibold',
};

export function StatusBadge({
  variant = 'neutral',
  size = 'sm',
  dot = false,
  pulse = false,
  children,
  className = '',
  ...props
}: StatusBadgeProps) {
  const style = VARIANT_STYLES[variant] || VARIANT_STYLES.neutral;
  const sizeClass = SIZE_STYLES[size];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border transition-colors ${style.bg} ${sizeClass} ${className}`}
      {...props}
    >
      {dot && (
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot} ${pulse ? 'animate-pulse' : ''}`}
        />
      )}
      <span>{children}</span>
    </span>
  );
}
