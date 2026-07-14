import { FlagSeverity, ReviewDecision, SessionStatus } from './enums';
import { Score } from './score';

export interface SessionListItem {
  sessionId: string;
  candidateName: string;
  roleTemplate: string;
  status: SessionStatus;
  compositeScore: number;
  sayDoConsistencyScore: number;
  humanReviewRequired: boolean;
}

export interface IntegrityFlag {
  category: string;
  severity: FlagSeverity;
  confidence: number;
  evidenceClipUrl: string | null;
}

export interface SessionDetail {
  sessionId: string;
  candidate: { name: string; email: string };
  moduleResponses: Array<{
    moduleType: string;
    responsePayload: unknown;
    executionResult: unknown;
  }>;
  integrityFlags: IntegrityFlag[];
  score: Score;
}

export interface RecordDecisionRequest {
  decision: ReviewDecision;
}

export interface RecordDecisionResponse {
  sessionId: string;
  decision: ReviewDecision;
  decidedAt: string; // ISO8601
}
