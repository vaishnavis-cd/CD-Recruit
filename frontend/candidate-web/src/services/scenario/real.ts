import type { ScenarioEnginePort, ScenarioMessage } from './port'
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
        const [currRes, trigRes] = await Promise.allSettled([
          apiClient.get(`/sessions/${sessionId}/simulation/current`),
          apiClient.get(`/sessions/${sessionId}/simulation/triggered-messages`),
        ]);

        if (trigRes.status === "fulfilled" && Array.isArray(trigRes.value.data)) {
          for (const msg of trigRes.value.data) {
            if (!active) break;
            const numericId = typeof msg.id === "string" 
              ? Math.abs(msg.id.split("-").reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0)) 
              : (Number(msg.id) || 1);
            onMessage({
              id: numericId,
              atSeconds: msg.timeOffsetSeconds || 0,
              channel: msg.type || "slack",
              from: msg.from || "Engineering Lead",
              subject: msg.subject || "Scenario Message",
              body: msg.body || "",
              expectsReply: true,
            });
          }
        }

        if (currRes.status === "fulfilled" && currRes.value.data && currRes.value.data.event && active) {
          const evt = currRes.value.data.event;
          const enriched = evt.enrichedContent || {};
          const channelType: any = evt.type === "ticket" ? "ticket" : evt.type === "email" ? "email" : "slack";

          onMessage({
            id: typeof evt.id === "string" ? Math.abs(evt.id.split("-").reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0)) : (Number(evt.id) || 1),
            atSeconds: 0,
            channel: channelType,
            from: evt.sender || enriched.from || (channelType === "ticket" ? "Jira System" : channelType === "email" ? "Account Manager" : "#eng-alerts"),
            subject: evt.title || enriched.context || "Assessment Incident Scenario",
            body: enriched.messages || enriched.tickets || enriched.emails || enriched.alerts || evt.prompt || evt.description || "System outage scenario event.",
            expectsReply: true,
          });
        }
      } catch (err) {
        console.warn("[realScenarioEngineAdapter] Poll current event skipped/failed:", err);
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

    await apiClient.post(`/sessions/${sessionId}/simulation/email-reply`, {
      messageId,
      replyText: text,
      text,
    })
  },

  async executeTerminalCommand(command: string): Promise<{ stdout: string; stderr: string; exitCode: number; infraError?: boolean }> {
    const assessment = useSessionStore.getState().assessment
    const sessionId = assessment?.sessionId

    if (!sessionId) {
      throw new Error('No active assessment session available for terminal execution')
    }

    const res = await apiClient.post(`/sessions/${sessionId}/simulation/execute`, { command })
    return res.data
  },

  reset(_scenarioId: string): void {},
}
