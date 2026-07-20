import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UploadedFile,
  UseInterceptors,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UseGuards,
  Logger,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ProctoringService } from "./proctoring.service";
import { CreateProctoringEventDto, ProctoringEventResponse, ProctoringSummaryResponse } from "./proctoring.types";
import { SessionOwnerGuard } from "../common/guards/session-owner.guard";

@Controller("proctoring")
export class ProctoringController {
  private readonly logger = new Logger(ProctoringController.name);

  constructor(private readonly proctoringService: ProctoringService) {}

  /**
   * POST /api/v1/proctoring/events
   * Persist Proctoring Event Metadata
   */
  @Post("events")
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(SessionOwnerGuard)
  async createEvent(@Body() dto: CreateProctoringEventDto) {
    const event = await this.proctoringService.createEvent(dto);
    // Asynchronously evaluate correlation & provenance flags
    this.proctoringService.evaluateEvent(dto.sessionId, dto.eventType, dto).catch((err) => {
      this.logger.error(`Error evaluating proctoring event: ${err.message}`);
    });
    return event;
  }

  /**
   * POST /api/v1/proctoring/session/:sessionId/upload
   * Upload evidence clip (WebM) via multipart/form-data
   */
  @Post("session/:sessionId/upload")
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor("file"))
  async uploadEvidence(
    @Param("sessionId", ParseUUIDPipe) sessionId: string,
    @UploadedFile() file: any,
  ) {
    if (!file) {
      throw new BadRequestException("No video file uploaded in form field 'file'");
    }

    const timestamp = Date.now();
    const eventType = file.originalname.split("_")[0] || "event";
    const filename = `${eventType}_${timestamp}.webm`;

    return this.proctoringService.uploadEvidence(sessionId, filename, file.buffer);
  }

  /**
   * GET /api/v1/proctoring/session/:sessionId
   * Recruiter review of session events
   */
  @Get("session/:sessionId")
  @HttpCode(HttpStatus.OK)
  async getSessionEvents(
    @Param("sessionId", ParseUUIDPipe) sessionId: string,
  ): Promise<ProctoringEventResponse[]> {
    return this.proctoringService.getSessionEvents(sessionId);
  }

  /**
   * GET /api/v1/proctoring/session/:sessionId/summary
   * Fetch structured proctoring summary for Correlation Engine
   */
  @Get("session/:sessionId/summary")
  @HttpCode(HttpStatus.OK)
  async getSessionSummary(
    @Param("sessionId", ParseUUIDPipe) sessionId: string,
  ): Promise<ProctoringSummaryResponse> {
    return this.proctoringService.getSessionSummary(sessionId);
  }
}
