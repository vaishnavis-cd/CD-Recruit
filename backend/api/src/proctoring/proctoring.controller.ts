import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UploadedFile,
  UseInterceptors,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UseGuards,
  Logger,
  Res,
  Req,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiTags, ApiOperation, ApiResponse, ApiConsumes } from "@nestjs/swagger";
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
  @UseGuards(SessionOwnerGuard)
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
    const event = await this.proctoringService.createEvent(dto);
    // Asynchronously evaluate correlation & provenance flags
    this.proctoringService.evaluateEvent(dto.sessionId, dto.eventType, dto).catch((err) => {
      this.logger.error(`Error evaluating proctoring event: ${err.message}`);
    });
    return event;
  }

  /**
   * POST /api/v1/proctoring/session/:sessionId/upload-evidence
   * Upload evidence clip (WebM) via multipart/form-data
   */
  @Post("session/:sessionId/upload-evidence")
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor("file"))
  @ApiOperation({
    summary: "Atomically upload proctoring video clip to MinIO and persist ProctoringEvent to database",
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Video clip uploaded to MinIO and ProctoringEvent persisted to database successfully.",
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: "No file attached, file invalid, or session is not active.",
  })
  async uploadEvidence(
    @Param("sessionId") sessionId: string,
    @UploadedFile() file: any,
    @Body() dto: CreateProctoringEventDto,
  ) {
    this.logger.log(`[ProctoringController] ATOMIC_UPLOAD_RECEIVED: sessionId=${sessionId}, eventType=${dto?.eventType || "N/A"}, filename=${file?.originalname || "N/A"}, size=${file?.size || 0} bytes`);
    if (!file) {
      throw new BadRequestException("No video file uploaded in form field 'file'");
    }

    const payloadDto: CreateProctoringEventDto = {
      sessionId,
      eventType: dto.eventType || (file.originalname?.split("_")[0]?.toUpperCase() as any) || ("MULTIPLE_FACES" as any),
      severity: dto.severity || "HIGH",
      timestamp: dto.timestamp || new Date().toISOString(),
      modelVersion: dto.modelVersion,
    };

    return this.proctoringService.uploadEvidenceAndCreateEvent(sessionId, file, payloadDto);
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
    @Param("sessionId") sessionId: string,
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
    @Param("sessionId") sessionId: string,
  ): Promise<ProctoringSummaryResponse> {
    this.logger.log(`[ProctoringController] GET_SUMMARY_REQUESTED: sessionId=${sessionId}`);
    return this.proctoringService.getSessionSummary(sessionId);
  }

  /**
   * GET /api/v1/proctoring/stream/:bucket/*
   * Video clip streaming proxy handling subpath object keys
   */
  @Get("stream/:bucket/*")
  @HttpCode(HttpStatus.OK)
  async streamClip(
    @Param("bucket") bucket: string,
    @Req() req: any,
    @Res() res: any,
  ) {
    try {
      const rawPath = req.params[0] || "";
      const objectKey = decodeURIComponent(rawPath.split("?")[0]).replace(/^\//, "");
      this.logger.log(`[ProctoringController] STREAM_CLIP: bucket=${bucket}, objectKey=${objectKey}`);
      const stream = await this.proctoringService.getObjectStream(bucket, objectKey);
      if (!stream) {
        return res.status(HttpStatus.NOT_FOUND).send("Evidence video clip not found");
      }
      res.setHeader("Content-Type", "video/webm");
      res.setHeader("Cache-Control", "public, max-age=3600");
      stream.pipe(res);
    } catch (err: any) {
      this.logger.error(`[ProctoringController] STREAM_ERROR: ${err.message}`);
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).send(err.message);
    }
  }
}
