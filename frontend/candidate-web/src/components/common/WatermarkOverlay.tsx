import React, { useEffect, useState } from 'react'
import { useSessionStore } from '../../store/sessionMachine'

export function WatermarkOverlay() {
  const session = useSessionStore(s => s.session)
  const assessment = useSessionStore(s => s.assessment)
  const candidateName = (session as any)?.candidateName || (assessment as any)?.candidateName || 'Candidate'
  const candidateEmail = (session as any)?.candidateEmail || (assessment as any)?.candidateEmail || ''
  const sessionId = session?.id?.slice(0, 8) || (assessment as any)?.sessionId?.slice(0, 8) || ''

  const [timestamp, setTimestamp] = useState(() => new Date().toLocaleTimeString())

  useEffect(() => {
    const interval = setInterval(() => {
      setTimestamp(new Date().toLocaleTimeString())
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  const watermarkText = `${candidateName} ${candidateEmail ? `(${candidateEmail})` : ''} • ID: ${sessionId} • ${timestamp}`

  return (
    <div 
      className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden select-none opacity-[0.06] flex flex-wrap gap-12 p-6"
      aria-hidden="true"
    >
      {Array.from({ length: 24 }).map((_, i) => (
        <div 
          key={i} 
          className="text-xs font-mono font-bold text-[var(--text-primary)] transform -rotate-12 tracking-wider whitespace-nowrap"
        >
          {watermarkText}
        </div>
      ))}
    </div>
  )
}
