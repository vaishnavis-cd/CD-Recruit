import React, { useEffect, useState } from 'react'
import { services } from '../services'
import type { DetectionEvent } from '../services/cv/port'

interface ProctoringIndicatorProps {
  cvMode: 'full' | 'reduced'
}

export function ProctoringIndicator({ cvMode }: ProctoringIndicatorProps) {
  const [active, setActive] = useState(false)

  useEffect(() => {
    if (cvMode !== 'full') return

    const unsub = services.cv.onDetectionEvent((event: DetectionEvent) => {
      if (event.type === 'face-detected') setActive(true)
      else if (event.type === 'face-lost') setActive(false)
    })

    setActive(true) // start as active — mock will emit events

    return unsub
  }, [cvMode])

  if (cvMode === 'reduced') {
    return (
      <div
        aria-label="Reduced proctoring mode active"
        title="Reduced proctoring mode"
        className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-[var(--surface)] border border-[var(--border)] text-xs text-[var(--text-secondary)]"
      >
        {/* Neutral, non-red dot — same color in both themes per spec */}
        <span
          className="w-2 h-2 rounded-full bg-blue-400"
          aria-hidden
        />
        <span className="sr-only">Proctoring: reduced mode</span>
      </div>
    )
  }

  return (
    <div
      aria-label={`Integrity monitoring ${active ? 'active' : 'standby'}`}
      title="Integrity monitoring is active"
      className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-[var(--surface)] border border-[var(--border)] text-xs text-[var(--text-secondary)]"
    >
      {/* Spec: neutral color, never red, same in both themes */}
      <span
        className={`w-2 h-2 rounded-full bg-blue-400 ${active ? 'opacity-100' : 'opacity-40'}`}
        aria-hidden
      />
      <span className="hidden sm:inline">Monitoring</span>
      <span className="sr-only">Integrity monitoring is {active ? 'active' : 'on standby'}</span>
    </div>
  )
}
