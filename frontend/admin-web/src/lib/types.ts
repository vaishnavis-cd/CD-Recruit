export type DriveStatus = "DRAFT" | "SCHEDULED" | "ACTIVE" | "CLOSED";

export interface DriveModuleConfigItem {
  enabled: boolean;
  durationMinutes: number;
  weight: number;
}

export type DriveModuleConfig = Record<string, DriveModuleConfigItem>;

export interface Drive {
  id: string;
  name: string;
  roleTemplateId: string;
  roleTemplateName: string;
  moduleConfig: DriveModuleConfig;
  status: DriveStatus;
  scheduleStart: string | null;
  scheduleEnd: string | null;
  createdById: string;
  createdByName: string;
  createdAt: string;
  invitedCount: number;
  startedCount: number;
  completedCount: number;
}

export interface DriveCandidateRosterItem {
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  inviteId: string;
  inviteStatus: string;
  inviteLink: string;
  sessionId: string | null;
  sessionStatus: string | null;
  compositeScore: number | null;
  submittedAt: string | null;
  isGenerated: boolean;
}

export interface DriveDetail extends Drive {
  roster: DriveCandidateRosterItem[];
  questionIds?: string[];
}

export interface Question {
  id: string;
  moduleType: string;
  role: string;
  content: any;
  scoringConfig: any;
  difficulty: string;
  tags: string[];
  version: number;
  status: string;
  usageCount: number;
  avgScore: number | null;
}

export interface ActionQueueItemReview {
  sessionId: string;
  candidateName: string;
  candidateEmail: string;
  roleTemplateName: string;
  submittedAt: string | null;
  aiConfidence: number | null;
}

export interface ActionQueueItemInvite {
  inviteId: string;
  candidateName: string;
  candidateEmail: string;
  roleTemplateName: string;
  expiresAt: string;
}

export interface ActionQueueItemDrive {
  driveId: string;
  driveName: string;
  roleTemplateName: string;
  scheduleEnd: string | null;
}

export interface ActionQueue {
  pendingReviews: ActionQueueItemReview[];
  expiringInvites: ActionQueueItemInvite[];
  closingDrives: ActionQueueItemDrive[];
}

export interface AuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata: any;
  occurredAt: string;
  staff: {
    id: string;
    name: string;
    email: string;
  };
}

export interface SessionResultItem {
  id: string;
  sessionId: string;
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  driveId?: string | null;
  driveName?: string;
  roleTemplateName?: string;
  status: string;
  submittedAt: string | null;
  compositeScore: number | null;
  moduleScores?: Record<string, number>;
  aiConfidence?: number | null;
  humanReviewed?: boolean;
  integrityFlagsCount?: number;
  decision?: {
    outcome: "PASS" | "FAIL";
    decidedAt: string;
    decidedBy: string;
    note?: string;
  };
}

export interface CandidateSessionDetail {
  id: string;
  candidateName: string;
  candidateEmail: string;
  driveName: string;
  roleTemplateName: string;
  status: string;
  startedAt: string | null;
  submittedAt: string | null;
  deadlineAt: string | null;
  disconnectCount: number;
  moduleResponses: Array<{
    id: string;
    questionId: string;
    responsePayload: any;
  }>;
  integrityFlags: Array<{
    id: string;
    category: string;
    severity: string;
    confidence: number;
    flaggedAt: string;
  }>;
  score: {
    compositeScore: number;
    moduleScores: Record<string, number>;
    sayDoConsistencyScore: number;
    aiConfidence: number;
    humanReviewed: boolean;
  } | null;
  decision?: {
    outcome: "PASS" | "FAIL";
    decidedAt: string;
    decidedBy: string;
    note?: string;
  };
}
