export interface ScenarioMessage {
  id: number
  atSeconds: number
  channel: 'slack' | 'email' | 'ticket'
  from: string
  subject: string
  body: string
  expectsReply: boolean
}

export interface ScenarioEnginePort {
  /**
   * Subscribe to scenario events for the given session and scenario ID.
   * The callback fires asynchronously (never synchronously) to match WebSocket behavior.
   * Returns an unsubscribe function.
   */
  subscribe(
    sessionId: string,
    scenarioId: string,
    onMessage: (message: ScenarioMessage) => void
  ): () => void

  /**
   * Send a reply to a message in the scenario.
   */
  sendReply(messageId: number, text: string): Promise<void>

  /**
   * Execute a candidate terminal command in the isolated sandbox container.
   */
  executeTerminalCommand?(command: string): Promise<{ stdout: string; stderr: string; exitCode: number; infraError?: boolean }>

  /**
   * Reset the scenario (for dev panel use).
   */
  reset(scenarioId: string): void
}
