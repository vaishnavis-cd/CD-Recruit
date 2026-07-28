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

        const rawScheduled = invite.scheduledTime ? new Date(invite.scheduledTime).getTime() : Date.now()
        const scheduledMs = isNaN(rawScheduled) ? Date.now() : rawScheduled
        localStorage.setItem('cd-recruit-scheduled-ms', String(scheduledMs))

        const nowMs = services.time.getServerNow()
        const systemCheckUnlockBoundary = scheduledMs - 15 * 60 * 1000 // System check unlocks at T-15m
        const graceBoundary = scheduledMs + (invite.graceMinutes ? invite.graceMinutes * 60 * 1000 : 20 * 60 * 1000) // 20m probation window

        // If active session exists for THIS token AND assessment timer was already started AND NOT EXPIRED, resume it
        const currentAssessment = useSessionStore.getState().assessment
        const persistedSession = useSessionStore.getState().session
        if (
          persistedSession?.status === 'active' &&
          currentAssessment?.timerStartMs !== null &&
          currentAssessment?.timerStartMs !== undefined &&
          localStorage.getItem('cd-recruit-session-token') === token &&
          nowMs >= scheduledMs
        ) {
          const elapsedMs = nowMs - currentAssessment.timerStartMs
          const totalMs = (currentAssessment.totalSeconds || 1800) * 1000
          if (elapsedMs < totalMs) {
            devForceJump({ type: 'assessment', moduleIndex: currentAssessment?.currentModuleIndex ?? 0, sessionId: persistedSession.id })
            return
          }
        }

        if (nowMs < systemCheckUnlockBoundary) {
          // Arrived earlier than T - 15m (e.g. before 9:45 AM for 10:00 AM test)
          transitionTo({ type: 'too-early', scheduledTimeMs: systemCheckUnlockBoundary, inviteToken: token })
        } else if (nowMs < scheduledMs) {
          // 15m preheat window (9:45 AM - 10:00 AM) — complete System Check then enter Waiting Room until T
          const consentDone = localStorage.getItem('cd-recruit-consent-audio') === 'true' || localStorage.getItem('cd-recruit-selfie-data')
          if (consentDone && persistedSession) {
            transitionTo({ type: 'waiting-room', scheduledTimeMs: scheduledMs, inviteToken: token })
          } else {
            transitionTo({ type: 'system-check', mode: 'full', inviteToken: token })
          }
        } else if (nowMs < graceBoundary) {
          // Late arrival within 20-min probation window (10:00 AM - 10:20 AM)
          const consentDone = localStorage.getItem('cd-recruit-consent-audio') === 'true' || localStorage.getItem('cd-recruit-selfie-data')
          if (consentDone && persistedSession) {
            devForceJump({ type: 'assessment', moduleIndex: 0, sessionId: persistedSession.id })
          } else {
            transitionTo({ type: 'system-check', mode: 'expedited', inviteToken: token })
          }
        } else {
          // Expired (arrived after probation window)
          transitionTo({ type: 'expired', reason: 'never-started' })
        }
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
