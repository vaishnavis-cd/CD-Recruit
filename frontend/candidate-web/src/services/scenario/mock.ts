import type { ScenarioEnginePort } from './port'
import type { ScenarioMessage } from '../../fixtures/scenarios'
import { SCENARIO_SCRIPTS } from '../../fixtures/scenarios'

// Mock plays back the scripted JSON timeline via setTimeout.
// Events fire asynchronously — same shape as a real WebSocket driver.

// Track replies per session to handle triggerCondition logic
const repliedTo = new Map<string, Set<number>>()
const scheduledTimers = new Map<string, ReturnType<typeof setTimeout>[]>()

export const mockScenarioEngineAdapter: ScenarioEnginePort = {
  subscribe(
    sessionId: string,
    scenarioId: string,
    onMessage: (message: ScenarioMessage) => void
  ): () => void {
    const script = SCENARIO_SCRIPTS[scenarioId]
    if (!script) return () => {}

    const key = `${sessionId}:${scenarioId}`
    if (!repliedTo.has(key)) repliedTo.set(key, new Set())

    const timers: ReturnType<typeof setTimeout>[] = []
    scheduledTimers.set(key, timers)

    for (const msg of script.messages) {
      if (msg.triggerCondition) {
        // Handled by sendReply — skip here
        continue
      }

      const timer = setTimeout(() => {
        onMessage(msg)
      }, msg.atSeconds * 1000)
      timers.push(timer)
    }

    // Store onMessage callback for triggered messages
    ;(mockScenarioEngineAdapter as any)[`_cb_${key}`] = onMessage

    return () => {
      timers.forEach(clearTimeout)
      scheduledTimers.delete(key)
      delete (mockScenarioEngineAdapter as any)[`_cb_${key}`]
    }
  },

  async sendReply(messageId: number, _text: string): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 200)) // simulate network

    // Find any messages triggered by replying to this message
    for (const [key, timers] of scheduledTimers) {
      const [sessionId, scenarioId] = key.split(':')
      const script = SCENARIO_SCRIPTS[scenarioId]
      if (!script) continue

      const replied = repliedTo.get(key)!
      replied.add(messageId)

      const onMessage = (mockScenarioEngineAdapter as any)[`_cb_${key}`] as ((m: ScenarioMessage) => void) | undefined
      if (!onMessage) continue

      for (const msg of script.messages) {
        if (!msg.triggerCondition) continue
        const condition = msg.triggerCondition
        if (condition.startsWith('afterReplyTo:')) {
          const requiredId = parseInt(condition.split(':')[1])
          if (replied.has(requiredId)) {
            // Fire this message after a short delay
            const timer = setTimeout(() => {
              onMessage(msg)
            }, 2000) // 2s delay to feel realistic
            timers.push(timer)
          }
        }
      }

      void sessionId // suppress unused warning
    }
  },

  reset(scenarioId: string): void {
    for (const [key, timers] of scheduledTimers) {
      if (key.includes(`:${scenarioId}`)) {
        timers.forEach(clearTimeout)
        scheduledTimers.delete(key)
        const replied = repliedTo.get(key)
        if (replied) replied.clear()
      }
    }
  },
}
