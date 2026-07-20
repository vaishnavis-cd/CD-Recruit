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
<<<<<<< HEAD
=======
  UseGuards,
>>>>>>> 596c8f8a88812168880c01880567ac662ad6bc3b
  Logger,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiTags, ApiOperation, ApiResponse, ApiConsumes, ApiBody } from "@nestjs/swagger";
import { ProctoringService } from "./proctoring.service";
import { CreateProctoringEventDto, ProctoringEventResponse, ProctoringSummaryResponse } from "./proctoring.types";
import { SessionOwnerGuard } from "../common/guards/session-owner.guard";

@ApiTags("proctoring")
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
<<<<<<< HEAD
  @ApiOperation({ summary: "Persist proctoring event telemetry metadata" })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: "The proctoring event has been successfully validated and persisted.",
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: "Duplicate event detected within the active cooldown period.",
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: "Session is not active (IN_PROGRESS) or validation filters failed.",
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: "Session ID was not found.",
  })
  async createEvent(@Body() dto: CreateProctoringEventDto) {
    this.logger.log(`[ProctoringController] EVENT_RECEIVED: sessionId=${dto.sessionId}, eventType=${dto.eventType}, severity=${dto.severity}`);
    return this.proctoringService.createEvent(dto);
=======
  @UseGuards(SessionOwnerGuard)
  async createEvent(@Body() dto: CreateProctoringEventDto) {
    const event = await this.proctoringService.createEvent(dto);
    // Asynchronously evaluate correlation & provenance flags
    this.proctoringService.evaluateEvent(dto.sessionId, dto.eventType, dto).catch((err) => {
      this.logger.error(`Error evaluating proctoring event: ${err.message}`);
    });
    return event;
>>>>>>> 596c8f8a88812168880c01880567ac662ad6bc3b
  }

  /**
   * POST /api/v1/proctoring/session/:sessionId/upload
   * Upload evidence clip (WebM) via multipart/form-data
   */
  @Post("session/:sessionId/upload")
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor("file"))
  @ApiOperation({ summary: "Upload WebM evidence video clip using multipart/form-data" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    description: "WebM binary video file to upload as evidence",
    schema: {
      type: "object",
      properties: {
        file: {
          type: "string",
          format: "binary",
        },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Video clip uploaded successfully. Returns internal MinIO storage reference path.",
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: "No file was attached, file type was invalid, or session is not active.",
  })
  async uploadEvidence(
    @Param("sessionId", ParseUUIDPipe) sessionId: string,
    @UploadedFile() file: any,
  ) {
    this.logger.log(`[ProctoringController] UPLOAD_RECEIVED: sessionId=${sessionId}, filename=${file?.originalname || "N/A"}, size=${file?.size || 0} bytes`);
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
  @ApiOperation({
    summary: "Retrieve all session events with temporary presigned GET URLs for evidence clips",
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Array of session events mapped with active presigned clip URLs.",
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: "Session ID was not found.",
  })
  async getSessionEvents(
    @Param("sessionId", ParseUUIDPipe) sessionId: string,
  ): Promise<ProctoringEventResponse[]> {
    this.logger.log(`[ProctoringController] GET_EVENTS_REQUESTED: sessionId=${sessionId}`);
    return this.proctoringService.getSessionEvents(sessionId);
  }

  /**
   * GET /api/v1/proctoring/session/:sessionId/summary
   * Fetch structured proctoring summary for Correlation Engine
   */
  @Get("session/:sessionId/summary")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Fetch structured count statistics of all events for Correlation Engine scoring",
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Dynamic count aggregation of each proctoring event type.",
  })
  async getSessionSummary(
    @Param("sessionId", ParseUUIDPipe) sessionId: string,
  ): Promise<ProctoringSummaryResponse> {
    this.logger.log(`[ProctoringController] GET_SUMMARY_REQUESTED: sessionId=${sessionId}`);
    return this.proctoringService.getSessionSummary(sessionId);
  }
}
