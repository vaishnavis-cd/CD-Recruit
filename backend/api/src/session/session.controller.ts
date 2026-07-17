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
} from "@nestjs/common";
import { SessionService } from "./session.service";
import {
  StartSessionDto,
  ResumeSessionDto,
  HeartbeatDto,
} from "@app/common/dto/session.dto";
import { InviteTokenRateLimitGuard } from "@app/common/guards/invite-token-rate-limit.guard";
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
  async begin(
    @Param("sessionId", ParseUUIDPipe) sessionId: string,
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
  async selfie(
    @Param("sessionId", ParseUUIDPipe) sessionId: string,
    @Body("image") image: string,
  ): Promise<{ ok: boolean }> {
    return this.sessionService.uploadSelfie(sessionId, image);
  }

  /**
   * POST /api/v1/sessions/:sessionId/heartbeat
   *
   * Tab-alive signal.  Must be sent every 15 s.
   * Returns 409 SECOND_TAB_DETECTED when a different tab is already active.
   */
  @Post(":sessionId/heartbeat")
  @HttpCode(HttpStatus.OK)
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
  async resume(
    @Param("sessionId", ParseUUIDPipe) sessionId: string,
    @Body() dto: ResumeSessionDto,
  ): Promise<ResumeSessionResponse> {
    return this.sessionService.resumeSession(sessionId, dto.tabId);
  }

  /**
   * GET /api/v1/sessions/:sessionId/questions/:questionId
   *
   * Fetch a single question for the session, with answer keys stripped.
   * Returns existing draft response if available.
   */
  @Get(":sessionId/questions/:questionId")
  @HttpCode(HttpStatus.OK)
  async getQuestion(
    @Param("sessionId", ParseUUIDPipe) sessionId: string,
    @Param("questionId", ParseUUIDPipe) questionId: string,
  ) {
    return this.sessionService.getQuestionForSession(sessionId, questionId);
  }

  /**
   * GET /api/v1/sessions/:sessionId/progress
   *
   * Returns per-question answer status for the free-navigation sidebar.
   */
  @Get(":sessionId/progress")
  @HttpCode(HttpStatus.OK)
  async progress(@Param("sessionId", ParseUUIDPipe) sessionId: string) {
    return this.sessionService.getProgress(sessionId);
  }

  /**
   * POST /api/v1/sessions/:sessionId/close
   *
   * Candidate explicitly submits the session.
   */
  @Post(":sessionId/close")
  @HttpCode(HttpStatus.OK)
  async close(
    @Param("sessionId", ParseUUIDPipe) sessionId: string,
  ): Promise<CloseSessionResponse> {
    return this.sessionService.closeSession(sessionId);
  }
}
