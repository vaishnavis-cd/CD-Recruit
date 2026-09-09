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
  isGenerated?: boolean;
  category?: string | null;
  experienceTier?: string | null;
  level?: string | null;
  roleTemplateId?: string | null;
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

/**
 * Compute real-time lifecycle status of a drive.
 * Lifecycle: DRAFT -> SCHEDULED -> ACTIVE -> CLOSED
 *
 * Rules:
 * 1. CLOSED: Explicitly closed, or now > scheduleEnd + (bufferMinutes + graceMinutes) [default 35m].
 * 2. ACTIVE: Candidate invite links generated AND pre-flight window opened (now >= scheduleStart - 15m).
 * 3. SCHEDULED: Candidate invite links generated, but now < scheduleStart - 15m.
 * 4. DRAFT: Links have not been generated yet.
 */
export function computeDriveStatus(
  drive: {
    status?: DriveStatus | string;
    scheduleStart?: Date | string | null;
    scheduleEnd?: Date | string | null;
    bufferMinutes?: number | null;
    graceMinutes?: number | null;
    invites?: Array<{ token?: string | null; isGenerated?: boolean; status?: string }>;
    hasGeneratedLinks?: boolean;
  },
  now: Date = new Date(),
): DriveStatus {
  // If explicitly closed or manually closed early, always remain CLOSED
  if (drive.status === DriveStatus.CLOSED) {
    return DriveStatus.CLOSED;
  }

  const hasGeneratedLinks =
    drive.hasGeneratedLinks ??
    (drive.invites?.some(
      (i) =>
        Boolean(i.token) ||
        i.isGenerated === true ||
        i.status === "DELIVERED" ||
        i.status === "INVITED" ||
        i.status === "REDEEMED",
    ) ?? false);

  // 1. DRAFT: Links not generated yet and current status is DRAFT
  if (!hasGeneratedLinks && drive.status === DriveStatus.DRAFT) {
    return DriveStatus.DRAFT;
  }

  // If schedule dates exist:
  if (drive.scheduleStart && drive.scheduleEnd) {
    const startMs = new Date(drive.scheduleStart).getTime();
    const endMs = new Date(drive.scheduleEnd).getTime();

    if (!isNaN(startMs) && !isNaN(endMs)) {
      // 20m start grace/buffer + 15m late entry = 35m total cutoff buffer (fallback defaults)
      const grace = drive.graceMinutes ?? 20;
      const buffer = drive.bufferMinutes ?? 15;
      const bufferMs = (grace + buffer) * 60 * 1000;
      const nowMs = now.getTime();

      // 4. CLOSED: Passed scheduleEnd + buffers
      if (nowMs > endMs + bufferMs) {
        return DriveStatus.CLOSED;
      }

      // 3. ACTIVE: Schedule window open (with 15-minute candidate pre-flight waiting room buffer before startMs)
      const preflightStartMs = startMs - 15 * 60 * 1000;
      if (nowMs >= preflightStartMs) {
        return DriveStatus.ACTIVE;
      }

      // 2. SCHEDULED: Links generated, but scheduled window is still in the future
      return DriveStatus.SCHEDULED;
    }
  }

  // Fallback: If links generated but no schedule dates set, consider ACTIVE, otherwise DRAFT
  return hasGeneratedLinks ? DriveStatus.ACTIVE : DriveStatus.DRAFT;
}

