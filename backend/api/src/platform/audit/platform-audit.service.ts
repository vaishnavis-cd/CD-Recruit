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
  AuthenticatedPlatformActor,
  PlatformAuditActor,
} from "./platform-audit.types";
import { sanitizeAuditData } from "./platform-audit.util";

@Injectable()
export class PlatformAuditService {
  private readonly logger = new Logger(PlatformAuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Validates that the actor is an authentic PlatformStaff identity or 'system'.
   * Structurally prevents recruiter Staff (public.staff) or arbitrary client IDs
   * from acting as platform audit actors.
   */
  private extractActorInfo(actor: PlatformAuditActor): { actorId: string; actorRole: string } {
    if (!actor) {
      throw new BadRequestException("AUDIT_ACTOR_REQUIRED: Platform audit actor cannot be empty");
    }

    if (actor === "system") {
      return { actorId: "system", actorRole: "system" };
    }

    if (typeof actor === "object") {
      // Reject recruiter identities
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
   * Authoritatively records an immutable platform audit event.
   *
   * @param input Audit event parameters
   * @param tx Optional Prisma transaction client to couple audit with business mutations
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

    // Sanitize before and after snapshots (strips passwords, hashes, tokens, secrets)
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

      this.logger.log(
        `[PlatformAudit] Recorded: action=${event.action} subject=${event.subjectType}:${event.subjectId} actor=${event.actorRole}:${event.actorId} reqId=${event.requestId || "none"}`,
      );

      return {
        id: event.id,
        timestamp: event.timestamp,
        actorId: event.actorId,
        actorRole: event.actorRole,
        subjectType: event.subjectType,
        subjectId: event.subjectId,
        action: event.action,
        before: event.before as any,
        after: event.after as any,
        reason: event.reason,
        ticketRef: event.ticketRef,
        impersonationContext: event.impersonationContext as any,
        requestId: event.requestId,
        executionResult: event.executionResult,
      };
    } catch (err: any) {
      this.logger.error(`[PlatformAudit] Persistence failure: ${err.message}`, err.stack);
      // Invariant: NEVER silently swallow audit failures
      throw err;
    }
  }

  /**
   * Read-only audit query helper for Platform Ops inspection.
   */
  async findEvents(query: {
    subjectType?: string;
    subjectId?: string;
    actorId?: string;
    limit?: number;
    offset?: number;
  }): Promise<PlatformAuditEventRecord[]> {
    const where: any = {};
    if (query.subjectType) where.subjectType = query.subjectType;
    if (query.subjectId) where.subjectId = query.subjectId;
    if (query.actorId) where.actorId = query.actorId;

    const events = await this.prisma.systemAuditEvent.findMany({
      where,
      orderBy: { timestamp: "desc" },
      take: query.limit || 50,
      skip: query.offset || 0,
    });

    return events.map((event) => ({
      id: event.id,
      timestamp: event.timestamp,
      actorId: event.actorId,
      actorRole: event.actorRole,
      subjectType: event.subjectType,
      subjectId: event.subjectId,
      action: event.action,
      before: event.before as any,
      after: event.after as any,
      reason: event.reason,
      ticketRef: event.ticketRef,
      impersonationContext: event.impersonationContext as any,
      requestId: event.requestId,
      executionResult: event.executionResult,
    }));
  }
}
