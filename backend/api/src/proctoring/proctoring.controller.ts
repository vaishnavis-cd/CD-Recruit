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
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ProctoringService } from "./proctoring.service";
import { CreateProctoringEventDto, ProctoringEventResponse, ProctoringSummaryResponse } from "./proctoring.types";

@Controller("proctoring")
export class ProctoringController {
  constructor(private readonly proctoringService: ProctoringService) {}

  /**
   * POST /api/v1/proctoring/events
   * Persist Proctoring Event Metadata
   */
  @Post("events")
  @HttpCode(HttpStatus.CREATED)
  async createEvent(@Body() dto: CreateProctoringEventDto) {
    return this.proctoringService.createEvent(dto);
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
