import { PlatformStaffRole } from "@cd-recruit/shared-types";

/**
 * Standardized audit subject types for Platform Operations.
 * Conforms to Artifact 03 (Table: platform.platform_audit_event) and Artifact 06 (Section 4).
 */
export enum PlatformAuditSubjectType {
  STAFF = "STAFF",
  OVERRIDE = "OVERRIDE",
  INCIDENT = "INCIDENT",
  TENANT = "TENANT",
  BILLING_ACCOUNT = "BILLING_ACCOUNT",
  POOL = "POOL",
  PRICE_BOOK = "PRICE_BOOK",
  RECONCILIATION = "RECONCILIATION",
  SECURITY = "SECURITY",
  SYSTEM = "SYSTEM",
}

/**
 * Standardized audit actions for Platform Operations.
 */
export enum PlatformAuditAction {
  // Staff Administration
  STAFF_LOGIN = "STAFF_LOGIN",
  STAFF_CREATED = "STAFF_CREATED",
  STAFF_UPDATED = "STAFF_UPDATED",
  STAFF_DEACTIVATED = "STAFF_DEACTIVATED",

  // Operational Overrides
  OVERRIDE_APPLIED = "OVERRIDE_APPLIED",
  OVERRIDE_REVOKED = "OVERRIDE_REVOKED",
  RETENTION_OVERRIDDEN = "RETENTION_OVERRIDDEN",

  // Infrastructure & Incident Operations
  INCIDENT_DECLARED = "INCIDENT_DECLARED",
  INCIDENT_RESOLVED = "INCIDENT_RESOLVED",

  // Tenant Impersonation
  IMPERSONATION_STARTED = "IMPERSONATION_STARTED",
  IMPERSONATION_REVOKED = "IMPERSONATION_REVOKED",

  // Security & Boundary Verification
  SECURITY_CHALLENGE = "SECURITY_CHALLENGE",
  PLATFORM_VERIFICATION_TEST = "PLATFORM_VERIFICATION_TEST",
}

export type PlatformAuditExecutionResult = "SUCCESS" | "FAILED";

export interface ImpersonationAuditContext {
  impersonatingStaffId: string;
  tenantId: string;
  ticketRef?: string;
  sessionTokenHash?: string;
}

/**
 * Validated actor representing an authenticated Platform Staff member.
 * Recruiter staff (public.staff) CANNOT satisfy this interface.
 */
export interface AuthenticatedPlatformActor {
  id: string;
  role: PlatformStaffRole;
  platformRole?: PlatformStaffRole;
  isPlatformStaff: true;
  email?: string;
  name?: string;
}

export type PlatformAuditActor = AuthenticatedPlatformActor | "system";

/**
 * Input contract for recording an audit event.
 */
export interface RecordPlatformAuditEventInput {
  actor: PlatformAuditActor;
  action: PlatformAuditAction | string;
  subjectType: PlatformAuditSubjectType | string;
  subjectId: string;
  before?: Record<string, any> | null;
  after?: Record<string, any> | null;
  reason?: string | null;
  ticketRef?: string | null;
  impersonationContext?: ImpersonationAuditContext | null;
  requestId?: string | null;
  executionResult?: PlatformAuditExecutionResult;
}

/**
 * Formatted output of a persisted platform audit event.
 */
export interface PlatformAuditEventRecord {
  id: string;
  timestamp: Date;
  actorId: string;
  actorRole: string;
  subjectType: string;
  subjectId: string;
  action: string;
  before: Record<string, any> | null;
  after: Record<string, any> | null;
  reason: string | null;
  ticketRef: string | null;
  impersonationContext: ImpersonationAuditContext | null;
  requestId: string | null;
  executionResult: string;
}
