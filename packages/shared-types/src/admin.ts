import {
  FlagSeverity,
  ModuleType,
  ReviewDecision,
  SessionStatus,
} from "./enums";
import { ResponsePayload } from "./response";
import { Score } from "./score";

// ---------------------------------------------------------------------------
// Admin session list
// ---------------------------------------------------------------------------

export interface SessionListItem {
  sessionId: string;
  candidateName: string;
  candidateEmail: string;
  roleTemplateName: string;
  status: SessionStatus;
  startedAt: string | null; // ISO-8601
  submittedAt: string | null; // ISO-8601 — null if not yet submitted
  deadlineAt: string | null; // ISO-8601
  /** How many times this session transitioned to DISCONNECTED. */
  disconnectCount: number;
  /** Available once Correlation Engine has scored the session; null before that. */
  compositeScore: number | null;
  sayDoConsistencyScore: number | null;
  humanReviewRequired: boolean;
}

export interface SessionListResponse {
  items: SessionListItem[];
  total: number;
  page: number;
  pageSize: number;
}

// ---------------------------------------------------------------------------
// Admin session detail
// ---------------------------------------------------------------------------

export interface IntegrityFlag {
  flagId: string;
  category: string;
  severity: FlagSeverity;
  confidence: number;
  flaggedAt: string; // ISO-8601
  evidenceClipUrl: string | null;
}

export interface ModuleResponseDetail {
  moduleResponseId: string;
  questionId: string;
  moduleType: ModuleType;
  responsePayload: ResponsePayload;
  timeSpentSeconds: number | null;
  isDraft: boolean;
  lastAutosavedAt: string | null; // ISO-8601
}

export interface SessionDetail {
  sessionId: string;
  candidate: {
    id: string;
    name: string;
    email: string;
  };
  roleTemplateName: string;
  status: SessionStatus;
  cvMode: string;
  startedAt: string | null;
  submittedAt: string | null;
  deadlineAt: string | null;
  disconnectCount: number;
  moduleResponses: ModuleResponseDetail[];
  integrityFlags: IntegrityFlag[];
  score: Score | null;
}

// ---------------------------------------------------------------------------
// Reviewer decision
// ---------------------------------------------------------------------------

export interface RecordDecisionRequest {
  decision: ReviewDecision;
}

export interface RecordDecisionResponse {
  sessionId: string;
  decision: ReviewDecision;
  decidedAt: string; // ISO-8601
}
