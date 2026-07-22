// SERVICE FACTORY — single injection point for all port adapters.
// Checks environment variables to switch between mock and real adapters.

import { mockSessionApiAdapter } from './session-api/mock'
import { realSessionApiAdapter } from './session-api/real'
import { mockTimeAuthorityAdapter } from './time/mock'
import { realTimeAuthorityAdapter } from './time/real'
import { mockScenarioEngineAdapter } from './scenario/mock'
import { realScenarioEngineAdapter } from './scenario/real'
import { mockCvDetectionAdapter } from './cv/mock'
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

export function createServices(): Services {
  const sessionApiMode = import.meta.env.VITE_SESSION_API_MODE ?? 'real'
  const timeMode = import.meta.env.VITE_TIME_MODE ?? 'real'
  const scenarioMode = import.meta.env.VITE_SCENARIO_MODE ?? 'real'
  const cvMode = import.meta.env.VITE_CV_MODE ?? 'real'

  const isRealToken = typeof window !== 'undefined' && (
    window.location.search.includes('token=inv_') ||
    window.location.search.includes('token=eyJ') ||
    window.location.pathname.includes('/inv_') ||
    window.location.pathname.includes('/eyJ')
  )
  const useRealApi = sessionApiMode === 'real' || (sessionApiMode === 'auto' && isRealToken) || isRealToken

  return {
    sessionApi: useRealApi ? realSessionApiAdapter : mockSessionApiAdapter,
    time: timeMode === 'real' ? realTimeAuthorityAdapter : mockTimeAuthorityAdapter,
    scenario: scenarioMode === 'real' ? realScenarioEngineAdapter : mockScenarioEngineAdapter,
    cv: cvMode === 'real' ? realCvDetectionAdapter : mockCvDetectionAdapter,
  }
}

// Singleton services instance — components use this via context
export const services = createServices()
