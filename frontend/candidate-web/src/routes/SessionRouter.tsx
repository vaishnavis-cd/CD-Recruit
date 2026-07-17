import React, { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useSessionStore } from '../store/sessionMachine'
import { InviteResolver } from './InviteResolver'
import { TooEarlyScreen } from './TooEarlyScreen'
import { ExpiredScreen } from './ExpiredScreen'
import { SystemCheckScreen } from './SystemCheckScreen'
import { ConsentScreen } from './ConsentScreen'
import { TutorialScreen } from './TutorialScreen'
import { WaitingRoomScreen } from './WaitingRoomScreen'
import { AssessmentScreen } from './AssessmentScreen'
import { PreSubmitReview } from './PreSubmitReview'
import { SyncingScreen } from './SyncingScreen'
import { DoneScreen } from './DoneScreen'
import { SessionConflictScreen } from './SessionConflictScreen'
import { services } from '../services'
import { FIXTURE_INVITE } from '../fixtures/invite'

// Resolving skeleton
function ResolvingScreen() {
  return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center" aria-label="Loading" aria-busy="true">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" aria-hidden />
        <p className="text-sm text-[var(--text-secondary)]">Loading your assessment…</p>
      </div>
    </div>
  )
}

export function SessionRouter() {
  const { token = 'demo-token-2024' } = useParams<{ token: string }>()
  const screen = useSessionStore(s => s.screen)

  // Store scheduled time in localStorage for tutorial/waiting-room usage
  useEffect(() => {
    const scheduledMs = new Date(FIXTURE_INVITE.scheduledTime).getTime()
    // Apply any dev time offset
    const nowMs = services.time.getServerNow()
    const adjustedScheduled = scheduledMs
    localStorage.setItem('cd-recruit-scheduled-ms', String(adjustedScheduled))
  }, [])

  // Store system check mode for consent/tutorial
  useEffect(() => {
    if (screen.type === 'system-check') {
      localStorage.setItem('cd-recruit-check-mode', screen.mode)
    }
  }, [screen])

  return (
    <>
      {/* Resolver always runs — drives transitions, renders nothing */}
      {screen.type === 'resolving' && <InviteResolver />}

      {/* Screen rendering based on current state */}
      {screen.type === 'resolving' && <ResolvingScreen />}
      {screen.type === 'too-early' && (
        <TooEarlyScreen scheduledTimeMs={screen.scheduledTimeMs} inviteToken={screen.inviteToken} />
      )}
      {screen.type === 'expired' && <ExpiredScreen reason={screen.reason} />}
      {screen.type === 'system-check' && (
        <SystemCheckScreen mode={screen.mode} inviteToken={screen.inviteToken} />
      )}
      {screen.type === 'consent' && (
        <ConsentScreen step={screen.step} inviteToken={screen.inviteToken} />
      )}
      {screen.type === 'tutorial' && (
        <TutorialScreen mode={screen.mode} inviteToken={screen.inviteToken} />
      )}
      {screen.type === 'waiting-room' && (
        <WaitingRoomScreen scheduledTimeMs={screen.scheduledTimeMs} inviteToken={screen.inviteToken} />
      )}
      {screen.type === 'assessment' && (
        <AssessmentScreen moduleIndex={screen.moduleIndex} sessionId={screen.sessionId} />
      )}
      {screen.type === 'pre-submit-review' && <PreSubmitReview />}
      {screen.type === 'syncing' && (
        <SyncingScreen sessionId={screen.sessionId} auto={screen.auto} />
      )}
      {screen.type === 'done' && (
        <DoneScreen referenceId={screen.referenceId} sessionId={screen.sessionId} auto={screen.auto} />
      )}
      {screen.type === 'session-conflict' && <SessionConflictScreen />}
    </>
  )
}
