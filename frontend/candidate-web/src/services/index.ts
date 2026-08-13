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

export function createServices(): Services {
  const sessionApiMode = import.meta.env.VITE_SESSION_API_MODE ?? 'real'
  const isRealToken = typeof window !== 'undefined' && (
    window.location.search.includes('token=inv_') ||
    window.location.search.includes('token=eyJ') ||
    window.location.pathname.includes('/inv_') ||
    window.location.pathname.includes('/eyJ')
  )
  const useRealApi = sessionApiMode === 'real' || (sessionApiMode === 'auto' && isRealToken) || isRealToken

  return {
    sessionApi: useRealApi ? realSessionApiAdapter : mockSessionApiAdapter,
    time: realTimeAuthorityAdapter,
    scenario: realScenarioEngineAdapter,
    cv: realCvDetectionAdapter,
  }
}

// Singleton services instance — components use this via context
export const services = createServices()
