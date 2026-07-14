import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { ModuleType } from "@cd-recruit/shared-types";

// ── Response payload shapes ──────────────────────────────────────────────────

export class McqResponsePayloadDto {
  @IsEnum(ModuleType)
  moduleType: ModuleType.MCQ;

  /** 0-based index of the selected option. */
  @IsInt()
  @Min(0)
  selectedIndex: number;
}

export class SqlResponsePayloadDto {
  @IsEnum(ModuleType)
  moduleType: ModuleType.SQL;

  @IsString()
  @IsNotEmpty()
  query: string;
}

export class CodingResponsePayloadDto {
  @IsEnum(ModuleType)
  moduleType: ModuleType.CODING;

  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsNotEmpty()
  language: string;
}

export class AiPromptingResponsePayloadDto {
  @IsEnum(ModuleType)
  moduleType: ModuleType.AI_PROMPTING;

  @IsString()
  @IsNotEmpty()
  prompt: string;
}

export class ActionLogEntryDto {
  @IsString()
  @IsNotEmpty()
  type: string;

  payload: Record<string, unknown>;

  @IsString()
  @IsNotEmpty()
  timestamp: string; // ISO-8601
}

export class SimulationResponsePayloadDto {
  @IsEnum(ModuleType)
  moduleType: ModuleType.SIMULATION;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ActionLogEntryDto)
  actionLog: ActionLogEntryDto[];
}

// ── Save Draft ───────────────────────────────────────────────────────────────

export class SaveDraftDto {
  @IsUUID()
  sessionId: string;

  @IsUUID()
  questionId: string;

  /**
   * Polymorphic payload — validated by the service layer using moduleType discriminant.
   * The controller accepts `unknown` here; service narrows via moduleType.
   */
  responsePayload: unknown;

  @IsNumber()
  @Min(0)
  timeSpentSeconds: number;
}

// ── Submit Response ──────────────────────────────────────────────────────────

export class SubmitResponseDto {
  @IsUUID()
  sessionId: string;

  @IsUUID()
  questionId: string;

  responsePayload: unknown;

  @IsNumber()
  @Min(0)
  timeSpentSeconds: number;
}
