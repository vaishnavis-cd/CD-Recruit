import React from 'react'
import { useSessionStore } from '../../store/sessionMachine'

export function WatermarkOverlay() {
  const session = useSessionStore(s => s.session)
  const assessment = useSessionStore(s => s.assessment)
  const inviteToken = useSessionStore(s => s.inviteToken)
  
  const candidateId = session?.id || assessment?.sessionId || inviteToken || ''
  const watermarkText = candidateId ? `clouddestinations ${candidateId}` : 'clouddestinations'

  return (
    <div 
      className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden select-none opacity-[0.18] flex flex-wrap justify-between p-8"
      aria-hidden="true"
    >
      {Array.from({ length: 16 }).map((_, i) => (
        <div 
          key={i} 
          className="text-xs font-mono font-bold text-[var(--text-primary)] transform -rotate-12 tracking-widest whitespace-nowrap drop-shadow-xs"
        >
          {watermarkText}
        </div>
      ))}
    </div>
  )
}

