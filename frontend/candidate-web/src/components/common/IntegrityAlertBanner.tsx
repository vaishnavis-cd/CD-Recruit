import React, { useEffect, useState } from 'react'
import { AlertTriangle, ShieldAlert, X } from 'lucide-react'

export interface IntegrityAlert {
  id: string
  message: string
  type: 'tab-switch' | 'fullscreen-exit'
  timestamp: number
}

interface IntegrityAlertBannerProps {
  alerts: IntegrityAlert[]
  onDismiss: (id: string) => void
}

export function IntegrityAlertBanner({ alerts, onDismiss }: IntegrityAlertBannerProps) {
  if (alerts.length === 0) return null

  const activeAlert = alerts[alerts.length - 1]

  return (
    <div 
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[10000] max-w-md w-full px-4 animate-in fade-in slide-in-from-top-2 duration-200"
      role="alert"
      aria-live="assertive"
    >
      <div className="bg-[var(--surface)] border border-[var(--warning)]/40 rounded-xl p-3.5 shadow-[var(--shadow-lg)] flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-[var(--warning-subtle)] text-[var(--warning)] flex items-center justify-center shrink-0 border border-[var(--warning)]/20">
            <ShieldAlert size={16} />
          </div>
          <div>
            <div className="font-bold text-[var(--text-primary)]">Integrity Notice</div>
            <div className="text-[var(--text-secondary)] font-medium">{activeAlert.message}</div>
          </div>
        </div>

        <button
          onClick={() => onDismiss(activeAlert.id)}
          className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-md hover:bg-[var(--bg)] transition-colors cursor-pointer"
          aria-label="Dismiss alert"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
