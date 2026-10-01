import {
  Controller,
  Post,
  Get,
  Req,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from "@nestjs/common";
import { PlatformJwtAuthGuard } from "../auth/guards/platform-jwt-auth.guard";
import { PlatformAuditService } from "./platform-audit.service";
import {
  PlatformAuditAction,
  PlatformAuditSubjectType,
} from "./platform-audit.types";

@Controller("platform/audit")
export class PlatformAuditController {
  constructor(private readonly platformAuditService: PlatformAuditService) {}

  /**
   * POST /api/v1/platform/audit/verify
   *
   * Minimal protected Platform Ops verification endpoint (Step 1.6).
   * Server-side generates an immutable platform audit event directly from
   * the authenticated PlatformStaff identity.
   */
  @Post("verify")
  @HttpCode(HttpStatus.OK)
  @UseGuards(PlatformJwtAuthGuard)
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

  /**
   * GET /api/v1/platform/audit/recent
   *
   * Protected read-only endpoint for Platform Ops to inspect recent audit events.
   */
  @Get("recent")
  @UseGuards(PlatformJwtAuthGuard)
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
}
