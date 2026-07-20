import React, { useRef } from 'react'
import { useSessionStore } from '../store/sessionMachine'

export function SessionConflictScreen() {
  const { inviteToken, devForceJump, assessment } = useSessionStore()
  const myId = useRef(Math.random().toString(36).slice(2))

  function handleContinueHere() {
    // Broadcast to other tabs that this one is claiming the session
    const channelName = `cd-recruit-session-${inviteToken}`
    if (typeof BroadcastChannel !== 'undefined') {
      const ch = new BroadcastChannel(channelName)
      ch.postMessage({ type: 'continue-here', from: myId.current })
      ch.close()
    }

    // Restore to assessment state
    if (assessment) {
      devForceJump({
        type: 'assessment',
        moduleIndex: assessment.currentModuleIndex,
        sessionId: assessment.sessionId,
      })
    } else {
      // Fall back to resolving
      window.location.reload()
    }
  }

  return (
    <div
      className="min-h-screen bg-[var(--bg)] flex flex-col items-center justify-center px-4"
      role="main"
      aria-labelledby="conflict-heading"
    >
      <div className="max-w-md w-full text-center">
        <div className="text-6xl mb-6 opacity-60" aria-hidden>⚠️</div>

        <h1 id="conflict-heading" className="text-2xl font-semibold text-[var(--text-primary)] mb-3">
          Session active elsewhere
        </h1>

        <p className="text-[var(--text-secondary)] text-sm mb-8 leading-relaxed">
          This assessment session is open in another tab or window. To avoid data conflicts, only one tab should be active at a time.
        </p>

        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-5 mb-6 text-left text-sm text-[var(--text-secondary)] space-y-2">
          <p>• Close the other tab/window and continue here, or</p>
          <p>• Switch back to the other tab and close this one</p>
          <p className="text-xs mt-3">Your progress is preserved — whichever tab you continue in will pick up exactly where you left off.</p>
        </div>

        <button
          onClick={handleContinueHere}
          className="w-full py-3 rounded-lg text-sm font-semibold bg-[var(--accent)] text-white hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 mb-3"
        >
          Continue in this tab →
        </button>
      </div>
    </div>
  )
}
