// PORT: CandidateSessionApiPort
// All methods go through this interface. Components never import mock/real directly.

import type {
  CandidateInvite,
  CandidateDrive,
  CandidateSession,
  CandidateModuleResponse,
  IntegritySignalType,
  SyncEventPayload,
} from "@cd-recruit/shared-types";

export type Invite = CandidateInvite;
export type Drive = CandidateDrive;
export type Session = CandidateSession;
export type ModuleResponse = CandidateModuleResponse;
export type { IntegritySignalType, SyncEventPayload };

export interface CandidateSessionApiPort {
  resolveInvite(token: string): Promise<{ invite: Invite; drive: Drive; session: Session | null }>
  createSession(token: string, cvMode: 'full' | 'reduced', tutorialMode: 'full' | 'condensed', selfieDataUrl?: string | null): Promise<Session>
  recordConsent(sessionId: string, version?: string): Promise<{ ok: boolean }>
  submitModuleResponse(response: ModuleResponse): Promise<void>
  runAiPrompt(payload: { sessionId: string; questionId: string; prompt: string }): Promise<string>
  submitFinalAssessment(sessionId: string): Promise<{ referenceId: string }>
  reportIntegritySignal(signal: IntegritySignalType): Promise<void>
  syncEventLog(payload: SyncEventPayload): Promise<{ success: boolean; retryAfterMs?: number }>
}
