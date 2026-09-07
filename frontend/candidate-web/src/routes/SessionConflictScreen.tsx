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
      className="min-h-screen px-6 py-12 flex items-center justify-center"
      role="main"
      aria-labelledby="conflict-heading"
    >
      <div className="w-full max-w-md text-center space-y-6 animate-cd-fade-in">
        <div className="w-14 h-14 rounded-2xl bg-[var(--surface)] text-[var(--warning)] border border-[var(--border)] flex items-center justify-center mx-auto shadow-xs">
          <AlertTriangle size={28} />
        </div>

        <div>
          <h1 id="conflict-heading" className="text-3xl-plus font-semibold tracking-tight text-[var(--foreground)] mb-2">
            Session Active Elsewhere
          </h1>

          <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">
            This assessment session is currently open in another browser tab. Only one session tab can be active at a time to prevent response conflicts.
          </p>
        </div>

        <div className="card-base p-5 text-left text-xs text-[var(--muted-foreground)] space-y-2">
          <div className="font-semibold text-[var(--foreground)] mb-1">Options to proceed:</div>
          <p>• Claim and continue session in this tab below</p>
          <p>• Return to your original tab and close this window</p>
          <p className="text-xs-plus pt-2 border-t border-[var(--border)] leading-relaxed font-mono-data">
            Your progress is continuously autosaved. Claiming session control in this tab will resume your state safely.
          </p>
        </div>

        <button
          onClick={handleContinueHere}
          className="btn-primary w-full inline-flex items-center justify-center gap-2 text-xs cursor-pointer"
        >
          <span>Continue Session in This Tab</span>
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  )
}

