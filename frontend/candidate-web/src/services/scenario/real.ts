import type { ScenarioEnginePort } from './port'

export const realScenarioEngineAdapter: ScenarioEnginePort = {
  subscribe(_sessionId: string, _scenarioId: string, _onMessage: any): () => void {
    throw new Error('ScenarioEngine WebSocket gateway not supported in production.')
  },
  async sendReply(_messageId: number, _text: string): Promise<void> {
    throw new Error('ScenarioEngine WebSocket gateway not supported in production.')
  },
  reset(_scenarioId: string): void {},
}
