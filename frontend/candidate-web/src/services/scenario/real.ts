import type { ScenarioEnginePort } from './port'
import type { ScenarioMessage } from '../../fixtures/scenarios'
import { useSessionStore } from '../../store/sessionMachine'
import axios from 'axios'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'

const apiClient = axios.create({
  baseURL: apiBaseUrl,
  headers: {
    'Content-Type': 'application/json',
  },
})

export const realScenarioEngineAdapter: ScenarioEnginePort = {
  subscribe(
    sessionId: string,
    _scenarioId: string,
    onMessage: (message: ScenarioMessage) => void
  ): () => void {
    let active = true

    async function pollCurrent() {
      if (!active) return
      try {
        const res = await apiClient.get(`/sessions/${sessionId}/simulation/current`)
        if (res.data && res.data.event && active) {
          const evt = res.data.event
          onMessage({
            id: Number(evt.id) || 1,
            atSeconds: 0,
            channel: 'slack',
            from: evt.sender || '#eng-alerts',
            subject: evt.title || 'Outage Alert',
            body: evt.prompt || evt.description || 'System outage alert received.',
            expectsReply: true,
          })
        }
      } catch (err) {
        console.warn('[realScenarioEngineAdapter] Poll current event skipped/failed:', err)
      }
    }

    // Start simulation session on backend if not yet started
    apiClient.post(`/sessions/${sessionId}/simulation/start`).catch((err) => {
      console.warn('[realScenarioEngineAdapter] Start simulation skipped/already started:', err)
    }).finally(() => {
      pollCurrent()
    })

    const intervalId = setInterval(pollCurrent, 5000)

    return () => {
      active = false
      clearInterval(intervalId)
    }
  },

  async sendReply(messageId: number, text: string): Promise<void> {
    // Get sessionId from assessment store (guaranteed to exist during simulation)
    const assessment = useSessionStore.getState().assessment
    const sessionId = assessment?.sessionId
    
    if (!sessionId) {
      console.error('[realScenarioEngineAdapter] No active session ID available for reply')
      throw new Error('No active assessment session')
    }

    await apiClient.post(`/sessions/${sessionId}/simulation/submit`, {
      eventId: String(messageId),
      action: 'REPLY',
      replyText: text,
    })
  },

  reset(_scenarioId: string): void {},
}
