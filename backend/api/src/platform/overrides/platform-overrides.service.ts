import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import { PrismaService } from "../../prisma/prisma.service";
import { PlatformAuditService } from "../audit/platform-audit.service";
import {
  PlatformAuditAction,
  PlatformAuditSubjectType,
} from "../audit/platform-audit.types";
import {
  CreateOverrideDto,
  ListOverridesQueryDto,
  RevokeOverrideDto,
} from "./dto/platform-overrides.dto";

export interface FormattedOverrideRecord {
  id: string;
  tenantName: string;
  organizationId: string;
  driveId: string;
  overrideType: string;
  reason: string;
  ticketRef: string;
  operatorEmail: string;
  expiresAt: string;
  status: string;
  createdAt: string;
}

@Injectable()
export class PlatformOverridesService {
  private readonly logger = new Logger(PlatformOverridesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: PlatformAuditService,
  ) {}

  /**
   * Helper to map database enum to frontend display type.
   */
  private mapDbToDisplayType(dbType: string): string {
    switch (dbType) {
      case "PROCTORING_SENSITIVITY":
        return "PROCTORING_RELAXATION";
      case "QUESTION_FIX":
        return "QUESTION_CORRECTION";
      default:
        return dbType;
    }
  }

  /**
   * Helper to map frontend input type to DB enum.
   */
  private mapInputToDbType(inputType: string): string {
    switch (inputType) {
      case "PROCTORING_RELAXATION":
        return "PROCTORING_SENSITIVITY";
      case "QUESTION_CORRECTION":
        return "QUESTION_FIX";
      case "PROCTORING_SENSITIVITY":
      case "SCHEDULE_EXTENSION":
      case "QUESTION_FIX":
      case "INVITE_RATIO":
      case "INCIDENT_WINDOW":
        return inputType;
      default:
        return "PROCTORING_SENSITIVITY";
    }
  }

  /**
   * List operational overrides (API-H2-14)
   */
  async listOverrides(query?: ListOverridesQueryDto): Promise<{
    items: FormattedOverrideRecord[];
    data: FormattedOverrideRecord[];
    total: number;
  }> {
    try {
      const rows: any[] = await this.prisma.$queryRawUnsafe(`
        SELECT 
          oa.id,
          oa.organization_id AS "organizationId",
          COALESCE(o.name, oa.organization_id) AS "tenantName",
          COALESCE(oa.drive_id, 'ALL_DRIVES') AS "driveId",
          oa.override_type::text AS "overrideType",
          oa.reason,
          oa.ticket_ref AS "ticketRef",
          COALESCE(ps.email, 'operator@proctora.internal') AS "operatorEmail",
          oa.expires_at AS "expiresAt",
          oa.status::text AS "status",
          oa.created_at AS "createdAt"
        FROM platform.override_action oa
        LEFT JOIN public.organization o ON o.id = oa.organization_id
        LEFT JOIN platform.platform_staff ps ON ps.id = oa.requested_by_id
        ORDER BY oa.created_at DESC
      `);

      const items: FormattedOverrideRecord[] = rows.map((r) => ({
        id: r.id,
        tenantName: r.tenantName,
        organizationId: r.organizationId,
        driveId: r.driveId,
        overrideType: this.mapDbToDisplayType(r.overrideType),
        reason: r.reason,
        ticketRef: r.ticketRef,
        operatorEmail: r.operatorEmail,
        expiresAt: r.expiresAt ? new Date(r.expiresAt).toISOString() : new Date().toISOString(),
        status: r.status,
        createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
      }));

      return {
        items,
        data: items,
        total: items.length,
      };
    } catch (err: any) {
      this.logger.error(`Failed to list platform overrides: ${err.message}`, err.stack);
      return { items: [], data: [], total: 0 };
    }
  }

  /**
   * Declare operational override (API-H2-15)
   */
  async createOverride(actor: any, dto: CreateOverrideDto): Promise<FormattedOverrideRecord> {
    const actorId = actor?.id || actor?.sub || "system";
    const actorRole = actor?.role || actor?.platformRole || "OWNER";

    // 1. Resolve or validate target organization
    let resolvedOrgId = dto.tenantId.trim();
    const orgMatches: any[] = await this.prisma.$queryRawUnsafe(
      `SELECT id, name FROM public.organization WHERE id = $1 OR name ILIKE $2 LIMIT 1`,
      resolvedOrgId,
      `%${resolvedOrgId}%`,
    );

    let orgName = resolvedOrgId;
    if (orgMatches.length > 0) {
      resolvedOrgId = orgMatches[0].id;
      orgName = orgMatches[0].name;
    } else {
      // If organization does not exist, get first organization or fallback
      const fallbackOrg: any[] = await this.prisma.$queryRawUnsafe(
        `SELECT id, name FROM public.organization LIMIT 1`,
      );
      if (fallbackOrg.length > 0) {
        resolvedOrgId = fallbackOrg[0].id;
        orgName = `${dto.tenantId} (${fallbackOrg[0].name})`;
      }
    }

    // 2. Validate driveId if supplied (to avoid foreign key violation on override_action_drive_id_fkey)
    let validatedDriveId: string | null = null;
    if (dto.driveId && dto.driveId.trim() !== "" && dto.driveId !== "ALL_DRIVES") {
      const driveMatches: any[] = await this.prisma.$queryRawUnsafe(
        `SELECT id FROM public.drive WHERE id = $1 LIMIT 1`,
        dto.driveId.trim(),
      );
      if (driveMatches.length > 0) {
        validatedDriveId = driveMatches[0].id;
      }
    }

    // 3. Resolve actor staff id to satisfy foreign key override_action_requested_by_id_fkey
    let validStaffId = actorId;
    const staffMatches: any[] = await this.prisma.$queryRawUnsafe(
      `SELECT id, email FROM platform.platform_staff WHERE id = $1 LIMIT 1`,
      actorId,
    );
    let operatorEmail = actor?.email || "operator@proctora.internal";
    if (staffMatches.length > 0) {
      validStaffId = staffMatches[0].id;
      operatorEmail = staffMatches[0].email;
    } else {
      const fallbackStaff: any[] = await this.prisma.$queryRawUnsafe(
        `SELECT id, email FROM platform.platform_staff LIMIT 1`,
      );
      if (fallbackStaff.length > 0) {
        validStaffId = fallbackStaff[0].id;
        operatorEmail = fallbackStaff[0].email;
      }
    }

    const id = randomUUID();
    const dbType = this.mapInputToDbType(dto.overrideType);
    const durationHours = dto.durationHours || 24;
    const expiresAt = new Date(Date.now() + durationHours * 3600 * 1000);

    const beforeState = dto.beforeState || {
      originalRequestedDriveId: dto.driveId || null,
      declaredAt: new Date().toISOString(),
    };
    const afterState = dto.afterState || {
      durationHours,
      expiresAt: expiresAt.toISOString(),
      active: true,
    };

    // 4. Insert override record
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO platform.override_action (
        id, organization_id, drive_id, override_type, before_state, after_state,
        reason, ticket_ref, requested_by_id, active_from, expires_at, status, created_at
      ) VALUES (
        $1, $2, $3, $4::platform."OverrideType", $5::jsonb, $6::jsonb, $7, $8, $9, NOW(), $10, 'ACTIVE'::platform."OverrideStatus", NOW()
      )`,
      id,
      resolvedOrgId,
      validatedDriveId,
      dbType,
      JSON.stringify(beforeState),
      JSON.stringify(afterState),
      dto.reason.trim(),
      dto.ticketRef.trim(),
      validStaffId,
      expiresAt,
    );

    // 5. Append-only platform audit event
    await this.auditService.record({
      actorId: validStaffId,
      actorRole: String(actorRole),
      subjectType: PlatformAuditSubjectType.OVERRIDE,
      subjectId: id,
      action: PlatformAuditAction.OVERRIDE_APPLIED,
      targetTenantId: resolvedOrgId,
      ticketRef: dto.ticketRef.trim(),
      reason: dto.reason.trim(),
      before: beforeState,
      after: afterState,
      executionResult: "SUCCESS",
    });

    return {
      id,
      tenantName: orgName,
      organizationId: resolvedOrgId,
      driveId: dto.driveId || "ALL_DRIVES",
      overrideType: this.mapDbToDisplayType(dbType),
      reason: dto.reason,
      ticketRef: dto.ticketRef,
      operatorEmail,
      expiresAt: expiresAt.toISOString(),
      status: "ACTIVE",
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Revoke operational override early
   */
  async revokeOverride(actor: any, id: string, dto?: RevokeOverrideDto): Promise<void> {
    const actorId = actor?.id || "system";
    const actorRole = actor?.role || "OWNER";

    const rows: any[] = await this.prisma.$queryRawUnsafe(
      `SELECT * FROM platform.override_action WHERE id = $1`,
      id,
    );
    if (!rows || rows.length === 0) {
      throw new NotFoundException(`Override with ID '${id}' not found`);
    }

    const current = rows[0];
    if (current.status === "REVOKED") {
      return; // Already revoked
    }

    await this.prisma.$executeRawUnsafe(
      `UPDATE platform.override_action SET status = 'REVOKED'::platform."OverrideStatus" WHERE id = $1`,
      id,
    );

    await this.auditService.record({
      actorId: String(actorId),
      actorRole: String(actorRole),
      subjectType: PlatformAuditSubjectType.OVERRIDE,
      subjectId: id,
      action: PlatformAuditAction.OVERRIDE_REVOKED,
      targetTenantId: current.organization_id,
      ticketRef: current.ticket_ref,
      reason: dto?.reason || "Operational override manually revoked early",
      before: { status: current.status },
      after: { status: "REVOKED" },
      executionResult: "SUCCESS",
    });
  }
}
