import { DriveStatus } from "./enums.js";

export interface QuestionWeightConfig {
  mode: "equal" | "difficulty";
}

export interface DriveModuleConfigEntry {
  enabled: boolean;
  durationMinutes: number;
  weight: number; // points, for CORE modules only — must sum to 100
  isBonus?: boolean; // false/undefined = core, true = bonus
  maxBonusPoints?: number; // for bonus modules — max sum capped at 20
  isFixed?: boolean;
  questionWeighting?: QuestionWeightConfig;
}

export type DriveModuleConfigItem = DriveModuleConfigEntry;

export type DriveModuleConfig = Record<string, DriveModuleConfigEntry>;

export interface ModuleWeightValidationResult {
  valid: boolean;
  coreSum: number;
  bonusSum: number;
  error?: string;
}

export function validateDriveModuleWeights(
  moduleConfig: Record<string, DriveModuleConfigEntry>
): ModuleWeightValidationResult {
  let coreSum = 0;
  let bonusSum = 0;
  for (const [modKey, conf] of Object.entries(moduleConfig)) {
    if (!conf || !conf.enabled) continue;
    if (conf.isBonus) {
      bonusSum += Number(conf.maxBonusPoints) || 0;
    } else {
      coreSum += Number(conf.weight) || 0;
    }
  }
  if (coreSum !== 100) {
    return {
      valid: false,
      coreSum,
      bonusSum,
      error: `Core module score weights currently sum to ${coreSum} pts. Core modules must sum to exactly 100 pts.`,
    };
  }
  if (bonusSum > 20) {
    return {
      valid: false,
      coreSum,
      bonusSum,
      error: `Total bonus points (${bonusSum} pts) exceed the maximum allowed limit of 20 pts.`,
    };
  }
  return { valid: true, coreSum, bonusSum };
}

export interface DriveListItem {
  id: string;
  name: string;
  roleTemplateId: string;
  roleTemplateName: string;
  moduleConfig: DriveModuleConfig;
  status: DriveStatus;
  originChannel?: string;
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
}

export interface DriveDetail {
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
  roster: DriveCandidateRosterItem[];
  invitedCount: number;
  startedCount: number;
  completedCount: number;
}

export interface DriveListResponse {
  items: DriveListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateDriveRequest {
  name: string;
  roleTemplateId: string;
  moduleConfig: DriveModuleConfig;
  status?: DriveStatus;
  scheduleStart?: string; // ISO-8601
  scheduleEnd?: string; // ISO-8601
  candidates?: Array<{
    name: string;
    email: string;
  }>;
}

export interface UpdateDriveRequest {
  name?: string;
  roleTemplateId?: string;
  moduleConfig?: DriveModuleConfig;
  scheduleStart?: string;
  scheduleEnd?: string;
}
