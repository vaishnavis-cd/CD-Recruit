import {
  Controller,
  Post,
  Get,
  Req,
  Res,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from "@nestjs/common";
import { Response } from "express";
import { PlatformJwtAuthGuard } from "../auth/guards/platform-jwt-auth.guard";
import { PlatformRolesGuard } from "../auth/guards/platform-roles.guard";
import {
  PlatformRoles,
  PLATFORM_READ_ROLES,
} from "../auth/decorators/platform-roles.decorator";
import { PlatformAuditService } from "./platform-audit.service";
import { PlatformAuditExplorerService } from "./platform-audit-explorer.service";
import { QueryAuditEventsDto } from "./dto/platform-audit-explorer.dto";
import {
  PlatformAuditAction,
  PlatformAuditSubjectType,
} from "./platform-audit.types";

@Controller("platform/audit")
@UseGuards(PlatformJwtAuthGuard, PlatformRolesGuard)
export class PlatformAuditController {
  constructor(
    private readonly platformAuditService: PlatformAuditService,
    private readonly auditExplorerService?: PlatformAuditExplorerService,
  ) {}

  /**
   * GET /api/v1/platform/audit/events
   * Unified Keyset-Cursor Paginated Audit Stream with Multi-Schema Support
   */
  @Get("events")
  @PlatformRoles(...PLATFORM_READ_ROLES)
  async getUnifiedEvents(@Query() query: QueryAuditEventsDto) {
    return this.auditExplorerService!.findUnifiedEvents(query);
  }

  /**
   * GET /api/v1/platform/audit/events/:source/:id
   * Audit event detail with computed dot-path changes diff
   */
  @Get("events/:source/:id")
  @PlatformRoles(...PLATFORM_READ_ROLES)
  async getEventDetail(
    @Param("source") source: string,
    @Param("id") id: string,
  ) {
    return this.auditExplorerService!.getEventDetail(source, id);
  }

  /**
   * GET /api/v1/platform/audit/filters
   * Filter dropdown options (actions, 90-day actors, subjectTypes)
   */
  @Get("filters")
  @PlatformRoles(...PLATFORM_READ_ROLES)
  async getFiltersMetadata() {
    return this.auditExplorerService!.getFiltersMetadata();
  }

  /**
   * GET /api/v1/platform/audit/export
   * Hardened CSV Export capped at 10,000 rows with formula injection mitigation
   */
  @Get("export")
  @PlatformRoles(...PLATFORM_READ_ROLES)
  async exportAuditLogs(
    @Query() query: QueryAuditEventsDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const actor = req.user;
    const { csvContent, isTruncated } = await this.auditExplorerService!.exportCsv(query, actor);

    const filename = `audit-log-${new Date().toISOString().split("T")[0]}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("X-Truncated", isTruncated ? "true" : "false");
    return res.status(HttpStatus.OK).send(csvContent);
  }

  /**
   * GET /api/v1/platform/audit
   *
   * Read-only endpoint for Super Admin Web Audit Explorer.
   */
  @Get()
  @PlatformRoles(...PLATFORM_READ_ROLES)
  async getAuditEvents(
    @Query("limit") limit?: string,
    @Query("subjectType") subjectType?: string,
    @Query("actorId") actorId?: string,
  ) {
    const parsedLimit = limit ? Math.min(parseInt(limit, 10), 100) : 50;
    const events = await this.platformAuditService.findEvents({
      limit: parsedLimit,
      subjectType,
      actorId,
    });

    return {
      ok: true,
      items: events,
      total: events.length,
    };
  }

  /**
   * GET /api/v1/platform/audit/recent
   *
   * Read-only endpoint for Platform Ops to inspect recent audit events.
   */
  @Get("recent")
  @PlatformRoles(...PLATFORM_READ_ROLES)
  async getRecentAuditEvents(
    @Query("limit") limit?: string,
    @Query("subjectType") subjectType?: string,
  ) {
    const parsedLimit = limit ? Math.min(parseInt(limit, 10), 100) : 20;
    const events = await this.platformAuditService.findEvents({
      limit: parsedLimit,
      subjectType,
    });

    return {
      ok: true,
      events,
    };
  }

  /**
   * POST /api/v1/platform/audit/verify
   *
   * Minimal verification endpoint (writes via recordEvent / record).
   */
  @Post("verify")
  @HttpCode(HttpStatus.OK)
  @PlatformRoles(...PLATFORM_READ_ROLES)
  async verifyAuditBoundary(@Req() req: any) {
    const actor = req.user;
    const requestId =
      (req.headers["x-request-id"] as string) ||
      (req.headers["x-correlation-id"] as string) ||
      null;

    const event = await this.platformAuditService.recordEvent({
      actor,
      action: PlatformAuditAction.PLATFORM_VERIFICATION_TEST,
      subjectType: PlatformAuditSubjectType.SYSTEM,
      subjectId: actor.id,
      reason: "Platform audit boundary verification test",
      after: {
        verifiedAt: new Date().toISOString(),
        clientIp: req.ip || "127.0.0.1",
      },
      requestId,
      executionResult: "SUCCESS",
    });

    return {
      ok: true,
      message: "Platform audit boundary verified successfully",
      auditEventId: event.id,
      action: event.action,
      actorId: event.actorId,
      actorRole: event.actorRole,
      timestamp: event.timestamp,
    };
  }
}
