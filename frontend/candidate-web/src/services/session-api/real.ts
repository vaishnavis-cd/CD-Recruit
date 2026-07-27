import type { CandidateSessionApiPort, Invite, Drive, Session, ModuleResponse, IntegritySignalType, SyncEventPayload } from './port'
import axios from 'axios'
import { FIXTURE_INVITE } from '../../fixtures/invite'
import { FIXTURE_DRIVE } from '../../fixtures/drive'
import { CODING_QUESTIONS, PROMPTING_QUESTIONS } from '../../fixtures/questions'
import { useSessionStore } from '../../store/sessionMachine'
import { ProctoringEventService } from '../../proctoring/proctoring-event.service'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'

const apiClient = axios.create({
  baseURL: apiBaseUrl,
  headers: {
    'Content-Type': 'application/json',
  },
})

function parseJwtPayload(token: string): any {
  try {
    const base64Url = token.split('.')[1]
    if (!base64Url) return null
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    )
    return JSON.parse(jsonPayload)
  } catch {
    return null
  }
}

export const realSessionApiAdapter: CandidateSessionApiPort = {
  async resolveInvite(token: string): Promise<{ invite: Invite; drive: Drive; session: Session | null }> {
    localStorage.setItem('cd-recruit-session-token', token)
    const payload = parseJwtPayload(token)
    const invite: Invite = {
      token,
      scheduledTime: payload?.scheduledTime || FIXTURE_INVITE.scheduledTime,
      bufferMinutes: payload?.bufferMinutes || FIXTURE_INVITE.bufferMinutes || 30,
      graceMinutes: payload?.graceMinutes || FIXTURE_INVITE.graceMinutes || 120,
      candidateId: payload?.inviteId || payload?.candidateEmail || token,
      driveId: payload?.driveId || 'drive-001',
    }
    const drive: Drive = {
      ...FIXTURE_DRIVE,
      id: payload?.driveId || FIXTURE_DRIVE.id,
    }

    let realSession: Session | null = null
    try {
      const startRes = await apiClient.post('/sessions/start', { inviteToken: token })
      const data = startRes.data
      if (data.scheduleStart) {
        invite.scheduledTime = data.scheduleStart
      }
      if (data.bufferMinutes) {
        invite.bufferMinutes = data.bufferMinutes
      }
      if (data.graceMinutes) {
        invite.graceMinutes = data.graceMinutes
      }
      realSession = {
        id: data.sessionId,
        cvMode: (data.cvMode as any) || 'full',
        tutorialMode: 'full',
        startedAt: data.startedAt,
        submittedAt: null,
        status: data.status === 'SUBMITTED' ? 'submitted' : 'active',
        questions: data.questions,
        durationMinutes: data.durationMinutes || 60,
      }
    } catch (err: any) {
      const code = err?.response?.data?.code ?? err?.response?.data?.error
      console.warn('[realSessionApiAdapter] resolveInvite start response:', code || err?.message)
    }

    return { invite, drive, session: realSession }
  },

  async createSession(token: string, cvMode: 'full' | 'reduced', tutorialMode: 'full' | 'condensed', selfieDataUrl?: string | null): Promise<Session> {
    // 1. Redeem invite token and create session on the backend
    const startRes = await apiClient.post('/sessions/start', { inviteToken: token })
    const { sessionId, startedAt: startStartedAt, questions: startQuestions, durationMinutes } = startRes.data
    localStorage.setItem('cd-recruit-session-id', sessionId)

    // 2. Upload baseline selfie if provided
    if (selfieDataUrl) {
      try {
        await apiClient.post(`/sessions/${sessionId}/selfie`, { image: selfieDataUrl })
        console.log('[realSessionApiAdapter] Baseline selfie uploaded successfully.')
      } catch (err) {
        console.error('[realSessionApiAdapter] Failed to upload baseline selfie:', err)
      } finally {
        localStorage.removeItem('cd-recruit-selfie-data')
      }
    }

    // 3. Begin the session to transition its status to IN_PROGRESS
    let questions = startQuestions || []
    let startedAt = startStartedAt

    try {
      const beginRes = await apiClient.post(`/sessions/${sessionId}/begin`)
      if (beginRes.data?.questions && beginRes.data.questions.length > 0) {
        questions = beginRes.data.questions
      }
      if (beginRes.data?.startedAt) {
        startedAt = beginRes.data.startedAt
      }
    } catch (err: any) {
      console.warn('[realSessionApiAdapter] /begin call warning:', err?.message)
    }

    return {
      id: sessionId,
      cvMode,
      tutorialMode,
      startedAt: startedAt || new Date().toISOString(),
      submittedAt: null,
      status: 'active',
      questions,
      durationMinutes: durationMinutes || 60,
    }
  },

  async recordConsent(sessionId: string, version = '1.0'): Promise<{ ok: boolean }> {
    const res = await apiClient.post(`/sessions/${sessionId}/consent`, { version })
    return res.data
  },

  async submitModuleResponse(response: ModuleResponse): Promise<void> {
    const { sessionId, questionId, response: val } = response

    // Identify question type from the assessment store (uses real DB UUIDs, not fixture IDs)
    const { assessment } = useSessionStore.getState()
    const questionSummary = assessment?.questions?.find(q => q.questionId === questionId)
    const isCodingQuestion = questionSummary?.moduleType === 'CODING'

    if (isCodingQuestion) {
      const codeVal = typeof val === 'string' ? val : (val as any)?.code || (val as any)?.sourceCode || ''
      const langVal = (val as any)?.language || 'python'
      await apiClient.post('/coding/submit', {
        sessionId,
        questionId,
        language: langVal,
        sourceCode: codeVal,
        timeSpentSeconds: 0,
      })
      return
    }

    // Check if it is a SQL question
    const isSqlQuestion = questionSummary?.moduleType === 'SQL'
    if (isSqlQuestion) {
      const sqlVal = typeof val === 'string' ? val : (val as any)?.query || (val as any)?.code || ''
      await apiClient.post('/sql/submit', {
        sessionId,
        questionId,
        query: sqlVal,
        timeSpentSeconds: 0,
      })
      return
    }

    // Check if it is an AI Prompting question
    const isAiPromptingQuestion = questionSummary?.moduleType === 'AI_PROMPTING'
    if (isAiPromptingQuestion) {
      const promptData = typeof val === 'string' ? val : (val as any)?.prompt || ''
      await apiClient.post('/ai-prompting/submit', {
        sessionId,
        questionId,
        prompt: promptData,
        timeSpentSeconds: 0,
      })
      return
    }

    // Check if it is an MCQ question
    const isMcqQuestion = questionSummary?.moduleType === 'MCQ'
    if (isMcqQuestion) {
      let optionsArray: string[] = []
      if (Array.isArray(val)) {
        optionsArray = val.map(String)
      } else if (typeof val === 'string' && val.trim().length > 0) {
        optionsArray = [val.trim()]
      }
      await apiClient.post('/mcq/submit', {
        sessionId,
        questionId,
        selectedOptions: optionsArray,
        timeSpentSeconds: 0,
      })
      return
    }

    return Promise.resolve()
  },

  async runAiPrompt(payload: { sessionId: string; questionId: string; prompt: string }): Promise<string> {
    const res = await apiClient.post('/ai-prompting/run', payload)
    return res.data.aiResponse || 'No response generated.'
  },

  async submitFinalAssessment(sessionId: string): Promise<{ referenceId: string }> {
    const res = await apiClient.post(`/sessions/${sessionId}/close`)
    const submittedAt = res.data.submittedAt || new Date().toISOString()
    const referenceId = `REF-${sessionId.slice(-6).toUpperCase()}-${new Date(submittedAt).getTime().toString(36).toUpperCase()}`
    return { referenceId }
  },

  async reportIntegritySignal(signal: IntegritySignalType): Promise<void> {
    const sessionId = useSessionStore.getState().session?.id || useSessionStore.getState().assessment?.sessionId || ''
    if (!sessionId) {
      console.warn('[realSessionApiAdapter] reportIntegritySignal: No active sessionId found.')
      return
    }

    let eventType: any = 'TAB_SWITCH'
    let severity: 'MEDIUM' | 'HIGH' = 'MEDIUM'

    if (signal.kind === 'tab-switch' || signal.kind === 'window-blur') {
      eventType = 'TAB_SWITCH'
      severity = 'MEDIUM'
    } else if (signal.kind === 'paste-anomaly') {
      eventType = 'PASTE'
      severity = 'HIGH'
    } else if (signal.kind === 'fullscreen-exit') {
      eventType = 'FULLSCREEN_EXIT'
      severity = 'HIGH'
    }

    await ProctoringEventService.getInstance().createEvent({
      sessionId,
      eventType,
      severity,
      timestamp: signal.timestamp || new Date().toISOString(),
    })
  },

  async syncEventLog(_payload: SyncEventPayload): Promise<{ success: boolean; retryAfterMs?: number }> {
    // Event log syncing is mock
    return Promise.resolve({ success: true })
  },
}
