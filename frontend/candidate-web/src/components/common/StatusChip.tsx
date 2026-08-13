import React from 'react'
import type { LucideIcon } from 'lucide-react'

export type StatusChipVariant = 'success' | 'warning' | 'critical' | 'neutral' | 'accent' | 'pending'
export type StatusChipSize = 'sm' | 'md'

interface StatusChipProps {
  variant?: StatusChipVariant
  tone?: StatusChipVariant
  label: string
  icon?: LucideIcon
  size?: StatusChipSize
  pulsing?: boolean
  loading?: boolean
  className?: string
}

const VARIANT_STYLES: Record<StatusChipVariant, { bg: string; text: string; border: string; dot: string }> = {
  success: {
    bg: 'bg-[var(--success-subtle)]',
    text: 'text-[var(--success)]',
    border: 'border-[var(--success)]/20',
    dot: 'bg-[var(--success)]',
  },
  warning: {
    bg: 'bg-[var(--warning-subtle)]',
    text: 'text-[var(--warning)]',
    border: 'border-[var(--warning)]/20',
    dot: 'bg-[var(--warning)]',
  },
  critical: {
    bg: 'bg-[var(--critical-subtle)]',
    text: 'text-[var(--critical)]',
    border: 'border-[var(--critical)]/20',
    dot: 'bg-[var(--critical)]',
  },
  neutral: {
    bg: 'bg-[var(--surface)]',
    text: 'text-[var(--text-secondary)]',
    border: 'border-[var(--border)]',
    dot: 'bg-[var(--text-secondary)]',
  },
  accent: {
    bg: 'bg-[var(--accent-subtle)]',
    text: 'text-[var(--accent)]',
    border: 'border-[var(--accent)]/20',
    dot: 'bg-[var(--accent)]',
  },
  pending: {
    bg: 'bg-[var(--surface)]',
    text: 'text-[var(--muted-foreground)]',
    border: 'border-[var(--border)]',
    dot: 'bg-[var(--accent)]',
  },
}

const SIZE_STYLES: Record<StatusChipSize, { container: string; iconSize: number; text: string }> = {
  sm: {
    container: 'px-2 py-0.5 text-xs gap-1.5 rounded-full',
    iconSize: 12,
    text: 'text-xs',
  },
  md: {
    container: 'px-2.5 py-1 text-xs font-medium gap-2 rounded-full',
    iconSize: 14,
    text: 'text-xs font-medium',
  },
}

export function StatusChip({
  variant,
  tone,
  label,
  icon: Icon,
  size = 'md',
  pulsing = false,
  loading = false,
  className = '',
}: StatusChipProps) {
  const activeVariant = tone || variant || 'neutral'
  const styles = VARIANT_STYLES[activeVariant]
  const sizeStyles = SIZE_STYLES[size]
  const isPulsing = pulsing || loading

  return (
    <span
      className={`
        inline-flex items-center border transition-colors select-none
        ${styles.bg} ${styles.text} ${styles.border} ${sizeStyles.container} ${className}
      `}
    >
      {Icon ? (
        <Icon size={sizeStyles.iconSize} className="shrink-0" />
      ) : (
        <span
          className={`w-1.5 h-1.5 rounded-full ${styles.dot} ${isPulsing ? 'animate-pulse' : ''}`}
          aria-hidden
        />
      )}
      <span className={sizeStyles.text}>{label}</span>
    </span>
  )
}
