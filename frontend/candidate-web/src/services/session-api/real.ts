import type { CandidateSessionApiPort, Invite, Drive, Session, ModuleResponse, IntegritySignalType, SyncEventPayload } from './port'
import axios from 'axios'
import { FIXTURE_INVITE } from '../../fixtures/invite'
import { FIXTURE_DRIVE } from '../../fixtures/drive'
import { CODING_QUESTIONS } from '../../fixtures/questions'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'

const apiClient = axios.create({
  baseURL: apiBaseUrl,
  headers: {
    'Content-Type': 'application/json',
  },
})

export const realSessionApiAdapter: CandidateSessionApiPort = {
  async resolveInvite(token: string): Promise<{ invite: Invite; drive: Drive; session: Session | null }> {
    // Stays mock per spec: no endpoint exists to resolve/decrypt invite token without starting a session
    const invite: Invite = { ...FIXTURE_INVITE, token }
    return { invite, drive: FIXTURE_DRIVE, session: null }
  },

  async createSession(token: string, cvMode: 'full' | 'reduced', tutorialMode: 'full' | 'condensed'): Promise<Session> {
    // 1. Redeem invite token and create session on the backend
    const startRes = await apiClient.post('/sessions/start', { inviteToken: token })
    const { sessionId, startedAt } = startRes.data

    // 2. Begin the session to transition its status to IN_PROGRESS
    const beginRes = await apiClient.post(`/sessions/${sessionId}/begin`)

    return {
      id: sessionId,
      cvMode,
      tutorialMode,
      startedAt: beginRes.data.startedAt || startedAt || new Date().toISOString(),
      submittedAt: null,
      status: 'active',
    }
  },

  async submitModuleResponse(response: ModuleResponse): Promise<void> {
    const { sessionId, questionId, response: val } = response

    // Look up question type to see if it is SQL or Coding
    const codingQ = CODING_QUESTIONS.find((q) => q.id === questionId)

    if (codingQ) {
      // For coding questions: call draft/submit endpoint
      await apiClient.post('/coding/submit', {
        sessionId,
        questionId,
        language: codingQ.language,
        sourceCode: typeof val === 'string' ? val : (val as any)?.code || '',
        timeSpentSeconds: 0,
      })
      return
    }

    // Check if it is a SQL question
    // (If the question is SQL, the value in Zustand responses is a string containing the query)
    if (typeof val === 'string' && (val.toLowerCase().includes('select') || val.toLowerCase().includes('insert') || val.toLowerCase().includes('update'))) {
      await apiClient.post('/sql/submit', {
        sessionId,
        questionId,
        query: val,
        timeSpentSeconds: 0,
      })
      return
    }

    // MCQ and AI Prompting are mock/no-ops
    return Promise.resolve()
  },

  async submitFinalAssessment(sessionId: string): Promise<{ referenceId: string }> {
    const res = await apiClient.post(`/sessions/${sessionId}/close`)
    const submittedAt = res.data.submittedAt || new Date().toISOString()
    const referenceId = `REF-${sessionId.slice(-6).toUpperCase()}-${new Date(submittedAt).getTime().toString(36).toUpperCase()}`
    return { referenceId }
  },

  async reportIntegritySignal(_signal: IntegritySignalType): Promise<void> {
    // Proctoring evidence pipeline is unbuilt: stays mock
    return Promise.resolve()
  },

  async syncEventLog(_payload: SyncEventPayload): Promise<{ success: boolean; retryAfterMs?: number }> {
    // Event log syncing is mock
    return Promise.resolve({ success: true })
  },
}
