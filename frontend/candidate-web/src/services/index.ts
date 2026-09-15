import { mockSessionApiAdapter } from './session-api/mock'
import { realSessionApiAdapter } from './session-api/real'
import { realTimeAuthorityAdapter } from './time/real'
import { realScenarioEngineAdapter } from './scenario/real'
import { realCvDetectionAdapter } from './cv/real'

import type { CandidateSessionApiPort } from './session-api/port'
import type { TimeAuthorityPort } from './time/port'
import type { ScenarioEnginePort } from './scenario/port'
import type { CvDetectionPort } from './cv/port'

export interface Services {
  sessionApi: CandidateSessionApiPort
  time: TimeAuthorityPort
  scenario: ScenarioEnginePort
  cv: CvDetectionPort
}

const dynamicSessionApi: CandidateSessionApiPort = {
  async resolveInvite(token: string) {
    const sessionApiMode = import.meta.env.VITE_SESSION_API_MODE ?? 'auto'
    if (sessionApiMode === 'mock' || token === 'demo' || token === 'test') {
      return mockSessionApiAdapter.resolveInvite(token)
    }
    try {
      return await realSessionApiAdapter.resolveInvite(token)
    } catch (err) {
      console.warn('[SessionApi] Real backend resolveInvite failed, falling back:', err)
      if (sessionApiMode === 'real') throw err
      return await mockSessionApiAdapter.resolveInvite(token)
    }
  },

  async createSession(token: string, cvMode: 'full' | 'reduced', tutorialMode: 'full' | 'condensed', selfieDataUrl?: string | null) {
    const sessionApiMode = import.meta.env.VITE_SESSION_API_MODE ?? 'auto'
    if (sessionApiMode === 'mock' || token === 'demo') {
      return mockSessionApiAdapter.createSession(token, cvMode, tutorialMode, selfieDataUrl)
    }
    try {
      return await realSessionApiAdapter.createSession(token, cvMode, tutorialMode, selfieDataUrl)
    } catch (err) {
      if (sessionApiMode === 'real') throw err
      return await mockSessionApiAdapter.createSession(token, cvMode, tutorialMode, selfieDataUrl)
    }
  },

  async recordConsent(sessionId: string, version?: string) {
    try {
      return await realSessionApiAdapter.recordConsent(sessionId, version)
    } catch {
      return await mockSessionApiAdapter.recordConsent(sessionId, version)
    }
  },

  async submitModuleResponse(response) {
    try {
      return await realSessionApiAdapter.submitModuleResponse(response)
    } catch {
      return await mockSessionApiAdapter.submitModuleResponse(response)
    }
  },

  async runAiPrompt(payload) {
    try {
      return await realSessionApiAdapter.runAiPrompt(payload)
    } catch {
      return await mockSessionApiAdapter.runAiPrompt(payload)
    }
  },

  async submitFinalAssessment(sessionId: string) {
    try {
      return await realSessionApiAdapter.submitFinalAssessment(sessionId)
    } catch {
      return await mockSessionApiAdapter.submitFinalAssessment(sessionId)
    }
  },

  async reportIntegritySignal(signal) {
    try {
      return await realSessionApiAdapter.reportIntegritySignal(signal)
    } catch {
      return await mockSessionApiAdapter.reportIntegritySignal(signal)
    }
  },

  async syncEventLog(payload) {
    try {
      return await realSessionApiAdapter.syncEventLog(payload)
    } catch {
      return await mockSessionApiAdapter.syncEventLog(payload)
    }
  },
}

export function createServices(): Services {
  return {
    sessionApi: dynamicSessionApi,
    time: realTimeAuthorityAdapter,
    scenario: realScenarioEngineAdapter,
    cv: realCvDetectionAdapter,
  }
}

// Singleton services instance — components use this via context
export const services = createServices()
