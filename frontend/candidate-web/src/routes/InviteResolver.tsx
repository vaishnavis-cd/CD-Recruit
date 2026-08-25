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

        // If session was already submitted or completed, lock access and show DoneScreen (Thank You page)
        if (session?.status === 'submitted' || (session as any)?.status === 'SUBMITTED' || (session as any)?.status === 'COMPLETED') {
          if (session) setSession(session)
          transitionTo({ type: 'done', referenceId: session?.id || 'COMPLETED', sessionId: session?.id || 'COMPLETED', auto: false })
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

        // Time-Gating Check for Scheduled vs Self-Paced (Rolling) Invites
        // For null scheduledTime (self-paced partner invites): skip Too Early / Buffer / Grace states -> go directly to System Check (full mode)
        const isDemoToken = token === 'demo' || token.startsWith('demo') || token === 'demo-token-2024'
        const scheduledTimeStr = invite.scheduledTime || null
        if (scheduledTimeStr && !isDemoToken) {
          const scheduledMs = new Date(scheduledTimeStr).getTime()
          const nowMs = services.time.getServerNow()
          const unlockTimeMs = scheduledMs - 15 * 60 * 1000 // System check unlocks 15m prior to test start
          const graceMins = invite.graceMinutes || (drive as any)?.graceMinutes || 120
          const cutoffMs = scheduledMs + graceMins * 60 * 1000 // Grace period cutoff

          if (!isNaN(scheduledMs)) {
            if (nowMs < unlockTimeMs) {
              localStorage.setItem('cd-recruit-scheduled-ms', String(scheduledMs))
              transitionTo({ type: 'too-early', scheduledTimeMs: scheduledMs, inviteToken: token })
              return
            } else if (nowMs > cutoffMs && !isSessionAlreadyStarted) {
              console.log('[InviteResolver] Candidate entered after grace window. Showing expired page.')
              transitionTo({ type: 'expired', reason: 'grace-expired' as any })
              return
            } else {
              // Candidate is in the valid active window — clear any stale far-future scheduled-ms
              localStorage.removeItem('cd-recruit-scheduled-ms')
            }
          }
        } else {
          // Self-paced rolling invite (null scheduledTime): clear schedule marker
          localStorage.removeItem('cd-recruit-scheduled-ms')
        }

        // New Session — start directly at System Check (always full tutorial, never condensed)
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
