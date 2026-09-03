import {
  FlagSeverity,
  ModuleType,
  ReviewDecision,
  SessionStatus,
  FlagDisposition,
  InviteStatus,
} from "./enums.js";
import { ResponsePayload } from "./response.js";
import { Score } from "./score.js";

// ---------------------------------------------------------------------------
// Admin session list
// ---------------------------------------------------------------------------

export interface SessionListItem {
  sessionId: string;
  referenceId?: string | null;
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
  moduleScores?: Record<string, number> | null;
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
  disposition: FlagDisposition | null;
  dispositionAt: string | null;
  dispositionById: string | null;
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
  referenceId?: string | null;
  id?: string;
  candidateName?: string;
  candidateEmail?: string;
  driveName?: string;
  candidate: {
    id: string;
    name: string;
    email: string;
    identityVerificationResult?: any;
    baselineSelfieRef?: string | null;
    idProofRef?: string | null;
    baselineSelfieUrl?: string | null;
    idProofUrl?: string | null;
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
  identityCaptures?: any[];
  questions?: any[];
  drive?: any;
  simulationSnapshot?: any;
  telemetryActions?: any[];
  score: Score | null;
  decision?: {
    outcome: ReviewDecision;
    decidedAt: string;
    decidedBy: string;
    note?: string;
  };
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

// ---------------------------------------------------------------------------
// Candidate invites
// ---------------------------------------------------------------------------

export interface InviteListItem {
  id: string;
  candidateEmail: string;
  candidateName: string;
  roleTemplateId: string;
  roleTemplateName: string;
  status: InviteStatus;
  token: string;
  createdById: string;
  createdByName: string;
  createdAt: string; // ISO-8601
  expiresAt: string; // ISO-8601
  redeemedAt: string | null;
  revokedAt: string | null;
  sessionId: string | null;
  idProofRef?: string | null;
}

export interface InviteListResponse {
  items: InviteListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateInviteRequest {
  candidateEmail: string;
  candidateName: string;
  roleTemplateId: string;
}

export interface CreateInviteResponse {
  invite: InviteListItem;
  inviteLink: string;
}

// ---------------------------------------------------------------------------
// Dashboard Statistics & Analytics
// ---------------------------------------------------------------------------

export interface DashboardStats {
  funnel: {
    invitesByStatus: Record<InviteStatus, number>;
    conversionRates: {
      invitedToStarted: number;
      startedToCompleted: number;
      overall: number;
    };
    completionByRole: Array<{
      roleTemplateName: string;
      completionRate: number;
      total: number;
    }>;
    avgTimeToStartHours: number | null;
  };
  scores: {
    compositeHistogram: Array<{ bucket: string; count: number }>;
    moduleAverages: Record<string, number>;
    avgCompositeScore: number | null;
    passRate: number | null;
    aiConfidenceDistribution: {
      highConfidence: number;
      lowConfidence: number;
      avgConfidence: number | null;
    };
  };
  sayDo: {
    histogram: Array<{ bucket: string; count: number }>;
    avgScore: number | null;
    correlationWithComposite: number | null;
    sayDoVsDecision: {
      avgScoreAdvanced: number | null;
      avgScoreRejected: number | null;
    };
  };
  timing: {
    avgSessionDurationMinutes: number | null;
    avgTimePerModule: Record<string, number>;
    durationVsAllotted: {
      usedLessThan50Pct: number;
      used50to80Pct: number;
      used80to100Pct: number;
      exceededDeadline: number;
    };
    outlierCount: { fast: number; slow: number };
  };
  integrity: {
    flagsByCategory: Record<string, number>;
    flagsBySeverity: Record<string, number>;
    flagRateByCvMode: {
      full: {
        sessionCount: number;
        totalFlags: number;
        avgFlagsPerSession: number;
      };
      reduced: {
        sessionCount: number;
        totalFlags: number;
        avgFlagsPerSession: number;
      };
    };
    evidenceClipCaptureRate: number | null;
    dispositionBreakdown: {
      confirmed: number;
      falsePositive: number;
      unreviewed: number;
    };
  };
  reviewer: {
    autoVsHumanReviewed: { autoScored: number; humanReviewed: number };
    decisions: { advanced: number; rejected: number; pending: number };
    avgReviewTurnaroundHours: number | null;
    sessionsAwaitingReview: number;
  };
  predictiveValidity: {
    dataAvailable: boolean;
    message: string;
  };
  generatedAt: string;
  totalSessions: number;
  totalCandidates: number;
}

// ---------------------------------------------------------------------------
// Event Timeline
// ---------------------------------------------------------------------------

export interface SessionEventTimeline {
  events: Array<{
    id: string;
    eventType: string;
    payload: Record<string, any>;
    occurredAt: string;
  }>;
}
