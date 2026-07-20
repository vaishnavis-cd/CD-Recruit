import { IsString, IsNotEmpty, IsUUID, IsEnum, IsISO8601, IsOptional } from "class-validator";
import { ProctoringEventType, ProctoringUploadStatus } from "@prisma/client";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateProctoringEventDto {
  @ApiProperty({
    description: "Session ID (UUID) linked to the assessment session",
    example: "f7d79b94-8173-45c1-9d10-3882775a2d04",
  })
  @IsUUID()
  @IsNotEmpty()
  sessionId: string;

  @ApiProperty({
    enum: ProctoringEventType,
    description: "Type of proctoring event violation detected",
    example: "PHONE_DETECTED",
  })
  @IsEnum(ProctoringEventType)
  @IsNotEmpty()
  eventType: ProctoringEventType;

  @ApiProperty({
    description: "Severity of the violation (MEDIUM or HIGH)",
    example: "HIGH",
  })
  @IsString()
  @IsNotEmpty()
  severity: string;

  @ApiProperty({
    description: "ISO 8601 Timestamp of when the event was captured",
    example: "2026-07-17T12:00:00.000Z",
  })
  @IsISO8601()
  @IsNotEmpty()
  timestamp: string;

  @ApiPropertyOptional({
    description: "Storage reference path key for the video evidence",
    example: "proctoring/f7d79b94-8173-45c1-9d10-3882775a2d04/phone_detected_1712345678.webm",
  })
  @IsString()
  @IsOptional()
  clipUrl?: string;

  @ApiPropertyOptional({
    description: "The name/version of the computer vision model generating this event",
    example: "object-detector-v1",
  })
  @IsString()
  @IsOptional()
  modelVersion?: string;

  @ApiPropertyOptional({
    enum: ProctoringUploadStatus,
    description: "Current upload availability status of the video evidence clip",
    default: ProctoringUploadStatus.PENDING,
  })
  @IsEnum(ProctoringUploadStatus)
  @IsOptional()
  uploadStatus?: ProctoringUploadStatus;
}

export interface ProctoringEventResponse {
  id: string;
  sessionId: string;
  eventType: ProctoringEventType;
  severity: string;
  timestamp: Date;
  clipUrl: string | null;
  modelVersion: string | null;
  uploadStatus: ProctoringUploadStatus;
  createdAt: Date;
}

export interface ProctoringSummaryResponse {
  faceMissing: number;
  multipleFaces: number;
  lookingAway: number;
  seatExit: number;
  excessiveMovement: number;
  phoneDetected: number;
  headphonesDetected: number;
  bookDetected: number;
}
