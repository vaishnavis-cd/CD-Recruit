import { IsEnum, IsObject, IsUUID } from "class-validator";
import { ModuleType } from "@cd-recruit/shared-types";

export class DraftResponseDto {
  @IsUUID()
  questionId: string;

  @IsEnum(ModuleType)
  moduleType: ModuleType;

  /** Raw content payload — shape validated by the service based on moduleType. */
  @IsObject()
  content: Record<string, unknown>;
}

export class SubmitResponseDto {
  @IsUUID()
  questionId: string;

  @IsEnum(ModuleType)
  moduleType: ModuleType;

  /** Raw content payload — shape validated by the service based on moduleType. */
  @IsObject()
  content: Record<string, unknown>;
}
