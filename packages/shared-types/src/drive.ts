import { DriveStatus } from "./enums";

export interface DriveModuleConfigItem {
  enabled: boolean;
  durationMinutes: number;
  weight: number;
}

export type DriveModuleConfig = Record<string, DriveModuleConfigItem>;

export interface DriveListItem {
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
