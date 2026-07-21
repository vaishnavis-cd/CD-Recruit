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

        // If active session exists AND we have local assessment state, resume it
        if (session?.status === 'active' && assessment) {
          setSession(session)
          initAssessment(session.id, TOTAL_ASSESSMENT_MINUTES * 60)
          devForceJump({ type: 'assessment', moduleIndex: assessment.currentModuleIndex, sessionId: session.id })
          return
        }

        // Drive closed?
        if (drive.status === 'closed') {
          transitionTo({ type: 'expired', reason: 'drive-closed' })
          return
        }

        const scheduledMs = new Date(invite.scheduledTime).getTime()
        const nowMs = services.time.getServerNow()
        const bufferMs = invite.bufferMinutes * 60 * 1000
        const graceMs = invite.graceMinutes * 60 * 1000

        const tooEarlyBoundary = scheduledMs - bufferMs
        const graceBoundary = scheduledMs + graceMs

        if (nowMs < tooEarlyBoundary) {
          // Too early
          transitionTo({ type: 'too-early', scheduledTimeMs: scheduledMs, inviteToken: token })
        } else if (nowMs < scheduledMs) {
          // Buffer window
          transitionTo({ type: 'system-check', mode: 'full', inviteToken: token })
        } else if (nowMs < graceBoundary) {
          // Grace window
          transitionTo({ type: 'system-check', mode: 'expedited', inviteToken: token })
        } else {
          // Expired
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
