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

import { Loader2 } from 'lucide-react'

// Resolving skeleton
function ResolvingScreen() {
  return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center" aria-label="Loading" aria-busy="true">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)]" />
        <p className="text-sm font-medium text-[var(--text-secondary)] tracking-wide">Loading your assessment…</p>
      </div>
    </div>
  )
}

export function SessionRouter({ token: propToken }: { token?: string }) {
  const { token: pathToken } = useParams<{ token?: string }>()
  const activeToken = propToken || pathToken || new URLSearchParams(window.location.search).get('token') || ''
  const screen = useSessionStore(s => s.screen)

  // Store scheduled time in localStorage for tutorial/waiting-room usage
  useEffect(() => {
    if (!localStorage.getItem('cd-recruit-scheduled-ms')) {
      const scheduledMs = new Date(FIXTURE_INVITE.scheduledTime).getTime()
      localStorage.setItem('cd-recruit-scheduled-ms', String(scheduledMs))
    }
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
      {screen.type === 'resolving' && <InviteResolver token={activeToken} />}

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
