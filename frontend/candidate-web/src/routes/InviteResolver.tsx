import React, { useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { useSessionStore } from '../store/sessionMachine'
import { services } from '../services'
import { TOTAL_ASSESSMENT_MINUTES } from '../fixtures/questions'

// FIXTURE_INVITE scheduledTime can be overridden by dev panel offset via TimeAuthorityPort
// This component runs once on mount to resolve the invite and determine the time gate.

export function InviteResolver({ token: propToken }: { token?: string }) {
  const { token: pathToken } = useParams<{ token?: string }>()
  const token = propToken || pathToken || new URLSearchParams(window.location.search).get('token') || ''
  const { screen, transitionTo, devForceJump, setSession, setInviteToken, setCvMode, initAssessment, assessment } = useSessionStore()
  const resolved = useRef(false)

  useEffect(() => {
    if (resolved.current) return
    resolved.current = true

    setInviteToken(token)

    // Register for session conflict detection via BroadcastChannel
    setupSessionConflictDetection(token, () => {
      devForceJump({ type: 'session-conflict' })
    })

    async function resolve() {
      try {
        const { invite, drive, session } = await services.sessionApi.resolveInvite(token)

        // If session was already submitted, go straight to done
        if (session?.status === 'submitted') {
          setSession(session)
          // If we have persisted assessment state, try to resume
          devForceJump({ type: 'done', auto: false, referenceId: 'RESTORED', sessionId: session.id })
          return
        }

        // Detect if token changed or new candidate link opened
        const storedToken = localStorage.getItem('cd-recruit-session-token')
        if (!storedToken || storedToken !== token) {
          console.log('[InviteResolver] New candidate token detected! Clearing stale local session.')
          localStorage.removeItem('cd-recruit-session')
          localStorage.removeItem('cd-recruit-assessment-state')
          localStorage.removeItem('cd-recruit-autosave')
          localStorage.setItem('cd-recruit-session-token', token)
          useSessionStore.setState({ session: null, assessment: null })
        } else {
          localStorage.setItem('cd-recruit-session-token', token)
        }

        // Always update session and questions from latest API resolution
        if (session) {
          const persistedSession = useSessionStore.getState().session
          if (persistedSession && persistedSession.id !== session.id) {
            console.log('[InviteResolver] Replacing mismatched local session:', persistedSession.id, 'with:', session.id)
            localStorage.removeItem('cd-recruit-assessment-state')
            localStorage.setItem('cd-recruit-theme', 'light')
            document.documentElement.classList.remove('dark')
            useSessionStore.setState({ assessment: null })
          }
          setSession(session)
          const sessionQuestions = session.questions || []
          const durationSeconds = (session.durationMinutes || 60) * 60
          initAssessment(session.id, durationSeconds, sessionQuestions)
        }

        // Drive closed?
        if (drive.status === 'closed') {
          transitionTo({ type: 'expired', reason: 'drive-closed' })
          return
        }

        // Check if session has ALREADY been started in progress (Resume Case)
        const isSessionAlreadyStarted = session && ((session as any).status === 'active' || (session as any).status === 'IN_PROGRESS' || (session as any).status === 'in_progress') && session.startedAt !== null

        if (isSessionAlreadyStarted) {
          if (session.startedAt) {
            useSessionStore.getState().setTimerStart(new Date(session.startedAt).getTime())
          }
          const currentAssessment = useSessionStore.getState().assessment
          devForceJump({ type: 'assessment', moduleIndex: currentAssessment?.currentModuleIndex ?? 0, sessionId: session.id })
          return
        }

        // Check if scheduled time is in the future (> 15 minutes away) or has expired (> 20 minutes past start)
        const scheduledTimeStr = invite.scheduledTime || (drive as any).scheduleStart || (drive as any).scheduledAt || (drive as any).startsAt
        if (scheduledTimeStr) {
          const scheduledMs = new Date(scheduledTimeStr).getTime()
          const nowMs = services.time.getServerNow()
          const unlockTimeMs = scheduledMs - 15 * 60 * 1000 // System check unlocks 15m prior to test start
          const cutoffMs = scheduledMs + 20 * 60 * 1000 // Grace period is 20m after test start

          if (!isNaN(scheduledMs)) {
            if (nowMs < unlockTimeMs) {
              localStorage.setItem('cd-recruit-scheduled-ms', String(scheduledMs))
              transitionTo({ type: 'too-early', scheduledTimeMs: unlockTimeMs, inviteToken: token })
              return
            } else if (nowMs > cutoffMs) {
              console.log('[InviteResolver] Candidate entered after grace window. Showing expired page.')
              transitionTo({ type: 'expired', reason: 'never-started' })
              return
            }
          }
        }

        // New Session — start at System Check onboarding sequence
        transitionTo({ type: 'system-check', mode: 'full', inviteToken: token })
        return
      } catch (err) {
        console.error('[InviteResolver] Failed to resolve invite:', err)
        // Show a minimal error state — ideally this retries
        transitionTo({ type: 'expired', reason: 'never-started' })
      }
    }

    resolve()
  }, [token])

  // This component renders nothing — it's pure logic that drives state transitions
  return null
}

// ── BroadcastChannel session conflict detection (genuinely real, not mocked) ──

const CONFLICT_CHANNEL_PREFIX = 'cd-recruit-session-'

let conflictChannel: BroadcastChannel | null = null

function setupSessionConflictDetection(token: string, onConflict: () => void) {
  const channelName = `${CONFLICT_CHANNEL_PREFIX}${token}`

  if (conflictChannel) {
    conflictChannel.close()
  }

  if (typeof BroadcastChannel === 'undefined') {
    // Fallback: localStorage storage event
    const storageKey = `cd-recruit-active-tab-${token}`
    const myId = Math.random().toString(36).slice(2)
    localStorage.setItem(storageKey, myId)

    window.addEventListener('storage', (e) => {
      if (e.key === storageKey && e.newValue && e.newValue !== myId) {
        onConflict()
      }
    })
    return
  }

  conflictChannel = new BroadcastChannel(channelName)
  const myId = Math.random().toString(36).slice(2)

  conflictChannel.postMessage({ type: 'tab-opened', id: myId })

  conflictChannel.onmessage = (e) => {
    if (e.data.type === 'tab-opened' && e.data.id !== myId) {
      // Another tab opened — notify it and show conflict on THIS tab
      conflictChannel?.postMessage({ type: 'invalidate', target: e.data.id, from: myId })
      // Also show conflict here if the other tab is newer (we'll just flag all secondary tabs)
    }
    if (e.data.type === 'invalidate' && e.data.target === myId) {
      onConflict()
    }
    if (e.data.type === 'continue-here' && e.data.from !== myId) {
      // Other tab claimed the session, we step aside
      onConflict()
    }
  }
}

export function broadcastContinueHere(token: string, myId: string) {
  const channelName = `${CONFLICT_CHANNEL_PREFIX}${token}`
  if (typeof BroadcastChannel !== 'undefined') {
    const ch = new BroadcastChannel(channelName)
    ch.postMessage({ type: 'continue-here', from: myId })
    ch.close()
  }
}
