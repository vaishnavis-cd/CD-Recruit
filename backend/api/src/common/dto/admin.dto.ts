import {
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  IsString,
  IsNotEmpty,
  IsEmail,
} from "class-validator";
import { Type } from "class-transformer";
import {
  ReviewDecision,
  SessionStatus,
  InviteStatus,
} from "@cd-recruit/shared-types";

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

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  sortBy?: "startedAt" | "compositeScore" | "candidateName";

  @IsOptional()
  @IsString()
  sortOrder?: "asc" | "desc";
}

export class RecordDecisionDto {
  @IsEnum(ReviewDecision)
  decision: ReviewDecision;
}

export class CreateInviteDto {
  @IsEmail()
  candidateEmail: string;

  @IsString()
  @IsNotEmpty()
  candidateName: string;

  @IsUUID()
  roleTemplateId: string;
}

export class ListInvitesQueryDto {
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
  @IsEnum(InviteStatus)
  status?: InviteStatus;
}
