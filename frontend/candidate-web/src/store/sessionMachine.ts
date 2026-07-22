import { create } from 'zustand'
import type { Session } from '../services/session-api/port'
import type { QuestionSummary } from '@cd-recruit/shared-types'

// ─── Screen State Discriminated Union ────────────────────────────────────────

export type ScreenState =
  | { type: 'resolving' }
  | { type: 'too-early'; scheduledTimeMs: number; inviteToken: string }
  | { type: 'expired'; reason: 'never-started' | 'drive-closed' }
  | { type: 'system-check'; mode: 'full' | 'expedited'; inviteToken: string }
  | { type: 'consent'; step: 'terms' | 'biometric' | 'liveness' | 'selfie' | 'audio'; inviteToken: string }
  | { type: 'tutorial'; mode: 'full' | 'condensed'; inviteToken: string }
  | { type: 'waiting-room'; scheduledTimeMs: number; inviteToken: string }
  | { type: 'assessment'; moduleIndex: number; sessionId: string }
  | { type: 'pre-submit-review'; sessionId: string }
  | { type: 'syncing'; sessionId: string; auto: boolean }
  | { type: 'done'; auto: boolean; referenceId: string; sessionId: string }
  | { type: 'session-conflict' }

// ─── Legal Transitions ────────────────────────────────────────────────────────

type TransitionKey = `${ScreenState['type']}->${ScreenState['type']}`

const LEGAL_TRANSITIONS: Set<TransitionKey> = new Set([
  'resolving->too-early',
  'resolving->expired',
  'resolving->system-check',
  'resolving->session-conflict',
  'resolving->assessment', // resuming existing session
  'resolving->pre-submit-review', // resuming at review stage
  'too-early->system-check',
  'system-check->consent',
  'system-check->expired', // drive closed during check
  'consent->consent', // step advancement within consent flow (terms→biometric→selfie)
  'consent->tutorial',
  'consent->expired', // drive closed during consent
  'tutorial->waiting-room',
  'tutorial->assessment', // grace path: no waiting room
  'waiting-room->assessment',
  'assessment->assessment', // module navigation
  'assessment->pre-submit-review',
  'assessment->syncing', // auto-submit on timeout
  'pre-submit-review->syncing',
  'pre-submit-review->assessment', // back to assessment
  'syncing->done',
  'syncing->syncing', // retry
])

// ─── Question / Response State ─────────────────────────────────────────────

export type QuestionStatus = 'unvisited' | 'answered' | 'skipped' | 'flagged'

export interface AssessmentState {
  sessionId: string
  responses: Record<string, unknown> // questionId -> response
  questionStatus: Record<string, QuestionStatus>
  currentModuleIndex: number
  currentQuestionIndex: number
  timerStartMs: number | null // when Module 1 actually started
  totalSeconds: number // total assessment time budget in seconds
  questions?: QuestionSummary[]
}

// ─── Store ────────────────────────────────────────────────────────────────────

interface SessionStore {
  screen: ScreenState
  session: Session | null
  assessment: AssessmentState | null
  cvMode: 'full' | 'reduced'
  inviteToken: string

  transitionTo: (next: ScreenState) => void
  devForceJump: (next: ScreenState) => void // bypasses validation — dev panel only

  setSession: (s: Session) => void
  setCvMode: (mode: 'full' | 'reduced') => void
  setInviteToken: (token: string) => void

  initAssessment: (sessionId: string, totalSeconds: number, questions?: QuestionSummary[]) => void
  setTimerStart: (ms: number) => void
  setResponse: (questionId: string, response: unknown) => void
  setQuestionStatus: (questionId: string, status: QuestionStatus) => void
  setCurrentQuestion: (moduleIndex: number, questionIndex: number) => void

  resetSession: () => void
}

const AUTOSAVE_KEY = 'cd-recruit-assessment-state'

function loadPersistedAssessment(): AssessmentState | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as AssessmentState
  } catch {
    return null
  }
}

function loadPersistedSession(): Session | null {
  try {
    const raw = localStorage.getItem('cd-recruit-session')
    if (!raw) return null
    return JSON.parse(raw) as Session
  } catch {
    return null
  }
}

function persistAssessment(state: AssessmentState) {
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(state))
  } catch {
    // storage-full — per spec, just continue without persisting
  }
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  screen: { type: 'resolving' },
  session: loadPersistedSession(),  // restore from localStorage so InviteResolver can resume
  assessment: loadPersistedAssessment(),
  cvMode: 'full',
  inviteToken: '',

  transitionTo(next: ScreenState) {
    const current = get().screen
    const key: TransitionKey = `${current.type}->${next.type}` as TransitionKey
    if (!LEGAL_TRANSITIONS.has(key)) {
      console.warn(`[SessionMachine] Illegal transition: ${key}. Ignoring.`)
      return
    }
    set({ screen: next })
  },

  devForceJump(next: ScreenState) {
    // Dev panel bypass — clearly labeled
    console.warn('[DEV] Force-jumping to screen:', next)
    set({ screen: next })
  },

  setSession(s: Session) {
    set({ session: s })
    localStorage.setItem('cd-recruit-session', JSON.stringify(s))
  },

  setCvMode(mode: 'full' | 'reduced') {
    set({ cvMode: mode })
  },

  setInviteToken(token: string) {
    set({ inviteToken: token })
  },

  initAssessment(sessionId: string, totalSeconds: number, questions?: QuestionSummary[]) {
    const existing = get().assessment
    // If resuming an existing session, preserve user progress (responses,
    // question statuses, timer) but always update `questions` with the fresh
    // list from the server. Before Phase 2, persisted state had no `questions`
    // field, so the stale localStorage would starve CodingModule of real UUIDs.
    if (existing && existing.sessionId === sessionId) {
      if (questions && questions.length > 0) {
        const next = { ...existing, questions }
        set({ assessment: next })
        persistAssessment(next)
      }
      return
    }

    const state: AssessmentState = {
      sessionId,
      responses: {},
      questionStatus: {},
      currentModuleIndex: 0,
      currentQuestionIndex: 0,
      timerStartMs: null,
      totalSeconds,
      questions,
    }
    set({ assessment: state })
    persistAssessment(state)
  },

  setTimerStart(ms: number) {
    const current = get().assessment
    if (!current || current.timerStartMs !== null) return // never override once set
    const next = { ...current, timerStartMs: ms }
    set({ assessment: next })
    persistAssessment(next)
  },

  setResponse(questionId: string, response: unknown) {
    const current = get().assessment
    if (!current) return
    const next = {
      ...current,
      responses: { ...current.responses, [questionId]: response },
      questionStatus: {
        ...current.questionStatus,
        [questionId]: (current.questionStatus[questionId] === 'flagged'
          ? 'flagged'
          : 'answered') as QuestionStatus,
      },
    }
    set({ assessment: next })
    persistAssessment(next)
  },

  setQuestionStatus(questionId: string, status: QuestionStatus) {
    const current = get().assessment
    if (!current) return
    const next = {
      ...current,
      questionStatus: { ...current.questionStatus, [questionId]: status },
    }
    set({ assessment: next })
    persistAssessment(next)
  },

  setCurrentQuestion(moduleIndex: number, questionIndex: number) {
    const current = get().assessment
    if (!current) return
    const next = { ...current, currentModuleIndex: moduleIndex, currentQuestionIndex: questionIndex }
    set({ assessment: next })
    persistAssessment(next)
  },

  resetSession() {
    localStorage.removeItem(AUTOSAVE_KEY)
    localStorage.removeItem('cd-recruit-session')
    set({
      screen: { type: 'resolving' },
      session: null,
      assessment: null,
      cvMode: 'full',
    })
  },
}))
