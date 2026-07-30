import React from 'react'
import { RotateCcw } from 'lucide-react'

interface RetryButtonProps {
  onClick: () => void
  label?: string
  className?: string
}

export function RetryButton({ onClick, label = 'Retry', className = '' }: RetryButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`group relative inline-flex items-center gap-0 hover:gap-2 px-2.5 hover:px-4 py-2 rounded-full border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-hover)] text-[var(--foreground)] transition-all duration-300 ease-in-out cursor-pointer shadow-sm overflow-hidden select-none ${className}`}
    >
      <RotateCcw className="w-4 h-4 shrink-0 text-[var(--accent)] transition-transform duration-300 group-hover:-rotate-180" />
      <span className="max-w-0 opacity-0 group-hover:max-w-[70px] group-hover:opacity-100 transition-all duration-300 ease-in-out whitespace-nowrap text-xs font-semibold tracking-wide text-[var(--foreground)] overflow-hidden">
        {label}
      </span>
    </button>
  )
}
