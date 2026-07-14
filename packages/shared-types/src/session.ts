import { CvMode, SessionStatus } from './enums';

export interface StartSessionRequest {
  inviteToken: string;
}

export interface StartSessionResponse {
  sessionId: string;
  candidateId: string;
  roleTemplate: string;
  cvMode: CvMode;
  status: SessionStatus;
  startedAt: string; // ISO8601
}

export interface CloseSessionResponse {
  sessionId: string;
  status: SessionStatus;
  submittedAt: string; // ISO8601
}
