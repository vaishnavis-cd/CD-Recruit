import React, { useRef } from 'react'
import { useSessionStore } from '../store/sessionMachine'
import { AlertTriangle, ArrowRight } from 'lucide-react'

export function SessionConflictScreen() {
  const { inviteToken, devForceJump, assessment } = useSessionStore()
  const myId = useRef(Math.random().toString(36).slice(2))

  function handleContinueHere() {
    const channelName = `cd-recruit-session-${inviteToken}`
    if (typeof BroadcastChannel !== 'undefined') {
      const ch = new BroadcastChannel(channelName)
      ch.postMessage({ type: 'continue-here', from: myId.current })
      ch.close()
    }

    if (assessment) {
      devForceJump({
        type: 'assessment',
        moduleIndex: assessment.currentModuleIndex,
        sessionId: assessment.sessionId,
      })
    } else {
      window.location.reload()
    }
  }

  return (
    <div
      className="min-h-screen bg-[var(--bg)] flex flex-col items-center justify-center px-4 py-12"
      role="main"
      aria-labelledby="conflict-heading"
    >
      <div className="max-w-md w-full text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-[var(--warning-subtle)] text-[var(--warning)] border border-[var(--warning)]/20 flex items-center justify-center mx-auto shadow-[var(--shadow-sm)]">
          <AlertTriangle size={32} />
        </div>

        <div>
          <h1 id="conflict-heading" className="text-2xl font-bold text-[var(--text-primary)] mb-2">
            Session Active Elsewhere
          </h1>

          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            This assessment session is currently open in another browser tab. Only one session tab can be active at a time to prevent response conflicts.
          </p>
        </div>

        <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-5 text-left text-xs text-[var(--text-secondary)] space-y-2 shadow-[var(--shadow-sm)]">
          <div className="font-semibold text-[var(--text-primary)] mb-1">Options to proceed:</div>
          <p>• Claim and continue session in this tab below</p>
          <p>• Return to your original tab and close this window</p>
          <p className="text-[11px] pt-2 border-t border-[var(--border)] leading-relaxed">
            Your progress is continuously autosaved. Claiming session control in this tab will resume your state safely.
          </p>
        </div>

        <button
          onClick={handleContinueHere}
          className="w-full py-3.5 rounded-xl text-xs font-bold bg-[var(--accent)] text-white hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-[var(--accent)] flex items-center justify-center gap-2 cursor-pointer shadow-[var(--shadow-sm)]"
        >
          <span>Continue Session in This Tab</span>
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  )
}

