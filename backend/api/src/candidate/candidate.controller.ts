import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Request } from "express";
import { CandidateService } from "./candidate.service";
import { RecordConsentDto } from "./consent.dto";
import { SessionOwnerGuard } from "@app/common/guards/session-owner.guard";

/**
 * CandidateController — exposes consent persistence endpoints.
 *
 * Consent records are written once per step (TERMS → BIOMETRIC → SELFIE → AUDIO)
 * before the candidate is allowed to advance. This satisfies DPDP Act (2023) §6.
 */
@Controller("sessions")
export class CandidateController {
  constructor(private readonly candidateService: CandidateService) {}

  /**
   * POST /api/v1/sessions/:sessionId/consent
   *
   * Write a ConsentRecord row for the given consent type.
   * The candidate is identified via the session.
   * IP address is captured from the request for audit purposes.
   */
  @Post(":sessionId/consent")
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(SessionOwnerGuard)
  async recordConsent(
    @Param("sessionId", ParseUUIDPipe) sessionId: string,
    @Body() dto: RecordConsentDto,
    @Req() req: Request,
  ): Promise<{ ok: boolean; id: string; consentedAt: string }> {
    const ipAddress =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.socket.remoteAddress ||
      "unknown";

    const result = await this.candidateService.recordConsent(
      sessionId,
      dto.consentType,
      dto.version,
      ipAddress,
    );

    return { ok: true, ...result };
  }
}
