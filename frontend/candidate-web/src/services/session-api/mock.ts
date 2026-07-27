import type { CandidateSessionApiPort, Invite, Drive, Session, ModuleResponse, IntegritySignalType, SyncEventPayload } from './port'
import { FIXTURE_INVITE } from '../../fixtures/invite'
import { FIXTURE_DRIVE } from '../../fixtures/drive'
import { ALL_QUESTIONS } from '../../fixtures/questions'
import { realSessionApiAdapter } from './real'

const MOCK_QUESTIONS = (() => {
  const counts: Record<string, number> = {}
  return ALL_QUESTIONS.map(q => {
    const type = q.type.toUpperCase() as any
    if (counts[type] === undefined) {
      counts[type] = 0
    } else {
      counts[type]++
    }
    return {
      questionId: q.id,
      moduleType: type,
      moduleIndex: counts[type]
    }
  })
})()


// Configurable failure rate for retry-path testing (0 = never fail, 1 = always fail)
const MOCK_FAILURE_RATE = 0.1

function randomLatency(minMs = 300, maxMs = 800): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, minMs + Math.random() * (maxMs - minMs)))
}

function maybeFail(rate = MOCK_FAILURE_RATE): void {
  if (Math.random() < rate) {
    throw new Error('Mock simulated network failure — retry to proceed')
  }
}

let mockSession: Session | null = null

export const mockSessionApiAdapter: CandidateSessionApiPort = {
  async resolveInvite(token: string): Promise<{ invite: Invite; drive: Drive; session: Session | null }> {
    await randomLatency()
    maybeFail(0.05) // low failure rate on resolve

    // Return fixture data — all tokens resolve to the same fixture in mock mode
    const invite: Invite = { ...FIXTURE_INVITE, token }

    // Check if token matches stored session token
    const storedToken = localStorage.getItem('cd-recruit-session-token')
    if (storedToken !== token) {
      console.log('[mockSessionApiAdapter] New token detected. Clearing stale session state.')
      localStorage.removeItem('cd-recruit-session')
      localStorage.removeItem('cd-recruit-autosave')
      localStorage.removeItem('cd-recruit-selfie-data')
      localStorage.setItem('cd-recruit-session-token', token)
      mockSession = null
    } else {
      const stored = localStorage.getItem('cd-recruit-session')
      if (stored) {
        try {
          mockSession = JSON.parse(stored) as Session
        } catch {
          mockSession = null
        }
      }
    }

    return { invite, drive: FIXTURE_DRIVE, session: mockSession }
  },

  async createSession(token: string, cvMode: 'full' | 'reduced', tutorialMode: 'full' | 'condensed', selfieDataUrl?: string | null): Promise<Session> {
    if (selfieDataUrl) {
      console.log('[mockSessionApiAdapter] Baseline selfie received, sanitizing local storage.');
      localStorage.removeItem('cd-recruit-selfie-data');
    }
    const session: Session = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'd58c2ef4-e546-4a17-947c-77f47adfc651',
      cvMode,
      tutorialMode,
      startedAt: new Date().toISOString(),
      submittedAt: null,
      status: 'active',
      questions: MOCK_QUESTIONS,
      durationMinutes: 60,
    }
    mockSession = session
    localStorage.setItem('cd-recruit-session', JSON.stringify(session))
    return Promise.resolve(session)
  },

  async recordConsent(sessionId: string, version = '1.0'): Promise<{ ok: boolean }> {
    console.log('[mockSessionApiAdapter] Candidate consent recorded:', sessionId, version)
    return Promise.resolve({ ok: true })
  },

  async submitModuleResponse(response: ModuleResponse): Promise<void> {
    await randomLatency(100, 300)
    // Silently store — mock doesn't actually need to do anything
    const key = `cd-recruit-resp-${response.sessionId}-${response.questionId}`
    localStorage.setItem(key, JSON.stringify(response))
  },

  async submitFinalAssessment(sessionId: string): Promise<{ referenceId: string }> {
    await randomLatency(500, 1200)
    maybeFail(MOCK_FAILURE_RATE)

    if (mockSession) {
      mockSession = { ...mockSession, submittedAt: new Date().toISOString(), status: 'submitted' }
      localStorage.setItem('cd-recruit-session', JSON.stringify(mockSession))
    }

    return { referenceId: `REF-${sessionId.slice(-6).toUpperCase()}-${Date.now().toString(36).toUpperCase()}` }
  },

  async reportIntegritySignal(_signal: IntegritySignalType): Promise<void> {
    // Client-side no-op per spec — just needs to exist for components to call
    // In production, this would POST to the integrity logging service
    await Promise.resolve()
  },

  async syncEventLog(payload: SyncEventPayload): Promise<{ success: boolean; retryAfterMs?: number }> {
    await randomLatency(600, 1500)
    maybeFail(0.15) // slightly higher failure rate to exercise retry UI

    // Simulate occasional retry-after
    if (Math.random() < 0.05) {
      return { success: false, retryAfterMs: 3000 }
    }
    return { success: true }
  },

  async runAiPrompt(payload: { sessionId: string; questionId: string; prompt: string }): Promise<string> {
    return realSessionApiAdapter.runAiPrompt(payload)
  },
}
