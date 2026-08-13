export const SessionStatusPort = Symbol("SessionStatusPort");

export interface SessionStatusPort {
  markDisconnected(sessionId: string): Promise<void>;
  autoSubmit(sessionId: string): Promise<void>;
}
