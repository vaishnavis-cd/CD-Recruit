import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { SessionService } from "./session.service";
import {
  StartSessionDto,
  ResumeSessionDto,
  HeartbeatDto,
} from "@app/common/dto/session.dto";
import { InviteTokenRateLimitGuard } from "@app/common/guards/invite-token-rate-limit.guard";
import { SessionOwnerGuard } from "@app/common/guards/session-owner.guard";
import {
  StartSessionResponse,
  ResumeSessionResponse,
  HeartbeatResponse,
  CloseSessionResponse,
} from "@cd-recruit/shared-types";

/**
 * SessionController — thin HTTP layer for the session lifecycle.
 *
 * All business logic lives in SessionService.  The controller only:
 *   1. Applies guards and validation decorators
 *   2. Extracts route/body params
 *   3. Delegates to the service
 *   4. Returns the result (NestJS serialises it as JSON automatically)
 */
@Controller("sessions")
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  /**
   * POST /api/v1/sessions/start
   *
   * Redeem an invite token and create a new assessment session.
   * Protected by InviteTokenRateLimitGuard to prevent brute-force.
   */
  @Post("start")
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(InviteTokenRateLimitGuard)
  async start(@Body() dto: StartSessionDto): Promise<StartSessionResponse> {
    return this.sessionService.startSession(dto.inviteToken);
  }

  /**
   * POST /api/v1/sessions/:sessionId/begin
   *
   * Begin the assessment session, transitioning NOT_STARTED to IN_PROGRESS.
   */
  @Post(":sessionId/begin")
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionOwnerGuard)
  async begin(
    @Param("sessionId") sessionId: string,
  ): Promise<StartSessionResponse> {
    return this.sessionService.beginSession(sessionId);
  }

  /**
   * POST /api/v1/sessions/:sessionId/selfie
   *
   * Upload baseline selfie before beginning the assessment.
   */
  @Post(":sessionId/selfie")
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionOwnerGuard)
  async selfie(
    @Param("sessionId") sessionId: string,
    @Body("image") image: string,
  ): Promise<{ ok: boolean }> {
    return this.sessionService.uploadSelfie(sessionId, image);
  }

  /**
   * POST /api/v1/sessions/:sessionId/consent
   *
   * Persist candidate consent record in PostgreSQL.
   */
  @Post(":sessionId/consent")
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionOwnerGuard)
  async consent(
    @Param("sessionId") sessionId: string,
    @Body("version") version?: string,
    @Body("ipAddress") ipAddress?: string,
    @Body("consentType") consentType?: string,
  ): Promise<{ ok: boolean; consentRecordId: string }> {
    return this.sessionService.recordConsent(sessionId, version, ipAddress, consentType);
  }


  /**
   * POST /api/v1/sessions/:sessionId/heartbeat
   *
   * Tab-alive signal.  Must be sent every 15 s.
   * Returns 409 SECOND_TAB_DETECTED when a different tab is already active.
   */
  @Post(":sessionId/heartbeat")
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionOwnerGuard)
  async heartbeat(
    @Param("sessionId", ParseUUIDPipe) sessionId: string,
    @Body() dto: HeartbeatDto,
  ): Promise<HeartbeatResponse> {
    return this.sessionService.heartbeat(sessionId, dto.tabId);
  }

  /**
   * POST /api/v1/sessions/:sessionId/resume
   *
   * Reconnect after a DISCONNECTED transition.
   * Only allowed within the grace window and below max disconnects.
   */
  @Post(":sessionId/resume")
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionOwnerGuard)
  async resume(
    @Param("sessionId", ParseUUIDPipe) sessionId: string,
    @Body() dto: ResumeSessionDto,
  ): Promise<ResumeSessionResponse> {
    return this.sessionService.resumeSession(sessionId, dto.tabId);
  }

  /**
   * GET /api/v1/sessions/:sessionId/questions/:questionId
   *
   * Fetch the full details of a question for the active session.
   */
  @Get(":sessionId/questions/:questionId")
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionOwnerGuard)
  async getQuestion(
    @Param("sessionId", ParseUUIDPipe) sessionId: string,
    @Param("questionId") questionId: string,
  ) {
    return this.sessionService.getQuestion(sessionId, questionId);
  }

  /**
   * GET /api/v1/sessions/:sessionId/progress
   *
   * Returns per-question answer status for the free-navigation sidebar.
   * Stub until Phase 3 (question serving).
   */
  @Get(":sessionId/progress")
  @HttpCode(HttpStatus.NOT_IMPLEMENTED)
  @UseGuards(SessionOwnerGuard)
  progress(@Param("sessionId", ParseUUIDPipe) _sessionId: string): {
    message: string;
  } {
    return { message: "Not implemented — Phase 3" };
  }

  /**
   * POST /api/v1/sessions/:sessionId/close
   *
   * Candidate explicitly submits the session.
   */
  @Post(":sessionId/close")
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionOwnerGuard)
  async close(
    @Param("sessionId", ParseUUIDPipe) sessionId: string,
  ): Promise<CloseSessionResponse> {
    return this.sessionService.closeSession(sessionId);
  }

  /**
   * POST /api/v1/sessions/:sessionId/verify-identity
   *
   * Verifies live selfie upload against stored candidate ID proof embedding.
   */
  @Post(":sessionId/verify-identity")
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionOwnerGuard)
  @UseInterceptors(FileInterceptor("file"))
  async verifyIdentity(
    @Param("sessionId", ParseUUIDPipe) sessionId: string,
    @UploadedFile() file: any,
  ) {
    if (!file) {
      throw new BadRequestException("No selfie image uploaded in form field 'file'");
    }
    return this.sessionService.verifyIdentity(sessionId, file);
  }

  /**
   * POST /api/v1/sessions/:sessionId/flag-and-continue
   *
   * Flags session with IDENTITY_MISMATCH IntegrityFlag and allows candidate to proceed.
   */
  @Post(":sessionId/flag-and-continue")
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionOwnerGuard)
  async flagAndContinue(
    @Param("sessionId", ParseUUIDPipe) sessionId: string,
  ) {
    return this.sessionService.flagAndContinueIdentity(sessionId);
  }
}
