import {
  Injectable,
  Logger,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { PlatformStaffRole } from "@cd-recruit/shared-types";
import {
  RecordPlatformAuditEventInput,
  PlatformAuditEventRecord,
  PlatformAuditActor,
} from "./platform-audit.types";
import { sanitizeAuditData } from "./platform-audit.util";

export interface RecordAuditEventDto {
  actorId: string;
  actorRole: string;
  subjectType: string; // e.g. 'STAFF' | 'TENANT' | 'OVERRIDE' | 'IMPERSONATION' | 'ACCOUNT' | 'POOL' | 'REQUEST' | 'PRICE' | 'PAYMENT'
  subjectId: string;
  action: string; // e.g. 'LOGIN_SUCCESS'
  before?: Record<string, any>;
  after?: Record<string, any>;
  reason?: string;
  ticketRef?: string;
  requestId?: string;
  ipAddress?: string;
  targetTenantId?: string;
  executionResult?: string;
  impersonationContext?: Record<string, any>;
}

@Injectable()
export class PlatformAuditService {
  private readonly logger = new Logger(PlatformAuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Authoritative, injectable audit writer.
   * - Append-only to platform.platform_audit_event (no update/delete methods exist).
   * - Strips/redacts sensitive keys (passwords, hashes, tokens, secrets).
   * - Never throws into the caller (fire-and-forget safe).
   */
  async record(event: RecordAuditEventDto): Promise<void> {
    try {
      const sanitizedBefore = event.before ? sanitizeAuditData(event.before) : undefined;
      const sanitizedAfter = event.after ? sanitizeAuditData(event.after) : undefined;
      const sanitizedImpersonation = event.impersonationContext
        ? sanitizeAuditData(event.impersonationContext)
        : undefined;
      const targetTenantId =
        event.targetTenantId ||
        (event.subjectType === "TENANT" ? event.subjectId : undefined);

      await this.prisma.systemAuditEvent.create({
        data: {
          actorId: event.actorId || "system",
          actorRole: event.actorRole || "SYSTEM",
          subjectType: event.subjectType,
          subjectId: event.subjectId,
          action: event.action,
          before: sanitizedBefore as any,
          after: sanitizedAfter as any,
          reason: event.reason,
          ticketRef: event.ticketRef,
          requestId: event.requestId,
          impersonationContext: sanitizedImpersonation as any,
          executionResult: event.executionResult || "SUCCESS",
          targetTenantId: targetTenantId || null,
        },
      });
    } catch (err: any) {
      this.logger.error(
        `Failed to record platform audit event [${event.action}]: ${err?.message || err}`,
        err?.stack,
      );
    }
  }


  /**
   * Validates that the actor is an authentic PlatformStaff identity or 'system'.
   */
  private extractActorInfo(actor: PlatformAuditActor): { actorId: string; actorRole: string } {
    if (!actor) {
      throw new BadRequestException("AUDIT_ACTOR_REQUIRED: Platform audit actor cannot be empty");
    }

    if (actor === "system") {
      return { actorId: "system", actorRole: "system" };
    }

    if (typeof actor === "object") {
      if ((actor as any).isPlatformStaff !== true) {
        throw new ForbiddenException(
          "RECRUITER_IDENTITY_CANNOT_BE_PLATFORM_ACTOR: Only authenticated PlatformStaff can generate platform audit events",
        );
      }

      const role = actor.platformRole || actor.role;
      if (!role || !Object.values(PlatformStaffRole).includes(role as PlatformStaffRole)) {
        throw new BadRequestException(
          `INVALID_PLATFORM_ROLE: Expected SUPPORT, FINANCE, or OWNER; received '${role}'`,
        );
      }

      if (!actor.id || typeof actor.id !== "string" || actor.id.trim() === "") {
        throw new BadRequestException("INVALID_ACTOR_ID: Platform actor must have a valid ID");
      }

      return {
        actorId: actor.id,
        actorRole: role,
      };
    }

    throw new BadRequestException("INVALID_ACTOR_TYPE: Actor must be authenticated PlatformStaff or 'system'");
  }

  /**
   * Legacy / transactional helper for platform event recording.
   */
  async recordEvent(
    input: RecordPlatformAuditEventInput,
    tx?: any,
  ): Promise<PlatformAuditEventRecord> {
    const { actorId, actorRole } = this.extractActorInfo(input.actor);

    if (!input.action || typeof input.action !== "string" || input.action.trim() === "") {
      throw new BadRequestException("AUDIT_ACTION_REQUIRED: Audit action must be specified");
    }

    if (!input.subjectType || typeof input.subjectType !== "string" || input.subjectType.trim() === "") {
      throw new BadRequestException("AUDIT_SUBJECT_TYPE_REQUIRED: Subject type must be specified");
    }

    if (!input.subjectId || typeof input.subjectId !== "string" || input.subjectId.trim() === "") {
      throw new BadRequestException("AUDIT_SUBJECT_ID_REQUIRED: Subject ID must be specified");
    }

    const sanitizedBefore = input.before ? sanitizeAuditData(input.before) : null;
    const sanitizedAfter = input.after ? sanitizeAuditData(input.after) : null;
    const sanitizedImpersonation = input.impersonationContext
      ? sanitizeAuditData(input.impersonationContext)
      : null;

    const executionResult = input.executionResult || "SUCCESS";
    const client = tx || this.prisma;

    try {
      const event = await client.systemAuditEvent.create({
        data: {
          actorId,
          actorRole,
          subjectType: input.subjectType,
          subjectId: input.subjectId,
          action: input.action,
          before: sanitizedBefore,
          after: sanitizedAfter,
          reason: input.reason || null,
          ticketRef: input.ticketRef || null,
          impersonationContext: sanitizedImpersonation,
          requestId: input.requestId || null,
          executionResult,
        },
      });

      return {
        id: event.id,
        timestamp: event.timestamp,
        actorId: event.actorId,
        actorRole: event.actorRole,
        subjectType: event.subjectType,
        subjectId: event.subjectId,
        action: event.action,
        before: event.before as Record<string, any> | null,
        after: event.after as Record<string, any> | null,
        reason: event.reason,
        ticketRef: event.ticketRef,
        impersonationContext: event.impersonationContext as any,
        requestId: event.requestId,
        executionResult: event.executionResult,
      };
    } catch (error) {
      this.logger.error(
        `Failed to persist audit event [${input.action}] for subject ${input.subjectType}:${input.subjectId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Protected read-only audit log retrieval.
   */
  async findEvents(params?: {
    limit?: number;
    subjectType?: string;
    subjectId?: string;
    actorId?: string;
  }): Promise<PlatformAuditEventRecord[]> {
    const where: any = {};
    if (params?.subjectType) where.subjectType = params.subjectType;
    if (params?.subjectId) where.subjectId = params.subjectId;
    if (params?.actorId) where.actorId = params.actorId;

    const events = await this.prisma.platformAuditEvent.findMany({
      where,
      orderBy: { timestamp: "desc" },
      take: params?.limit || 50,
    });

    return events.map((e) => ({
      id: e.id,
      timestamp: e.timestamp,
      actorId: e.actorId,
      actorRole: e.actorRole,
      subjectType: e.subjectType,
      subjectId: e.subjectId,
      action: e.action,
      before: e.before as Record<string, any> | null,
      after: e.after as Record<string, any> | null,
      reason: e.reason,
      ticketRef: e.ticketRef,
      impersonationContext: e.impersonationContext as any,
      requestId: e.requestId,
      executionResult: e.executionResult,
    }));
  }

  /**
   * Protected read-only tenant audit log retrieval.
   */
  async findTenantEvents(
    tenantId: string,
    params?: { page?: number; pageSize?: number },
  ): Promise<{ items: PlatformAuditEventRecord[]; total: number; page: number; pageSize: number }> {
    const page = Math.max(1, params?.page || 1);
    const pageSize = Math.min(100, Math.max(1, params?.pageSize || 20));
    const skip = (page - 1) * pageSize;
    const take = pageSize;

    const where: any = {
      OR: [
        { targetTenantId: tenantId },
        { subjectType: "TENANT", subjectId: tenantId },
      ],
    };

    const [total, events] = await this.prisma.$transaction([
      this.prisma.systemAuditEvent.count({ where }),
      this.prisma.systemAuditEvent.findMany({
        where,
        orderBy: { timestamp: "desc" },
        skip,
        take,
      }),
    ]);

    const items = events.map((e) => ({
      id: e.id,
      timestamp: e.timestamp,
      actorId: e.actorId,
      actorRole: e.actorRole,
      subjectType: e.subjectType,
      subjectId: e.subjectId,
      action: e.action,
      before: e.before as Record<string, any> | null,
      after: e.after as Record<string, any> | null,
      reason: e.reason,
      ticketRef: e.ticketRef,
      impersonationContext: e.impersonationContext as any,
      requestId: e.requestId,
      executionResult: e.executionResult,
    }));

    return { items, total, page, pageSize };
  }
}

