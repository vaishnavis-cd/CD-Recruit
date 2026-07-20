import { IsString, IsNotEmpty, IsUUID, IsEnum, IsISO8601, IsOptional } from "class-validator";
import { ProctoringEventType, ProctoringUploadStatus } from "@prisma/client";

export { ProctoringEventType, ProctoringUploadStatus };

export class CreateProctoringEventDto {
  @IsUUID()
  @IsNotEmpty()
  sessionId: string;

  @IsEnum(ProctoringEventType)
  @IsNotEmpty()
  eventType: ProctoringEventType;

  @IsString()
  @IsNotEmpty()
  severity: string;

  @IsISO8601()
  @IsNotEmpty()
  timestamp: string;

  @IsString()
  @IsOptional()
  clipUrl?: string;

  @IsString()
  @IsOptional()
  modelVersion?: string;

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
