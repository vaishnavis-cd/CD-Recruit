import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import { ReviewDecision, SessionStatus } from "@cd-recruit/shared-types";

export class ListSessionsQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  pageSize: number = 20;

  @IsOptional()
  @IsEnum(SessionStatus)
  status?: SessionStatus;

  @IsOptional()
  @IsUUID()
  roleTemplateId?: string;
}

export class RecordDecisionDto {
  @IsEnum(ReviewDecision)
  decision: ReviewDecision;
}
