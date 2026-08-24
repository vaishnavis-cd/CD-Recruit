import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsArray,
  IsInt,
  IsBoolean,
  IsNumber,
  ValidateNested,
  Min,
} from "class-validator";
import { Type } from "class-transformer";
import { Department, ExperienceLevel, ModuleType } from "@prisma/client";
import { CandidateCategory } from "../../common/utils/experience-tier.util";

export class RoleTemplateQuestionInputDto {
  @IsString()
  @IsNotEmpty()
  questionId: string;

  @IsEnum(ModuleType)
  moduleType: ModuleType;

  @IsOptional()
  @IsInt()
  @Min(0)
  orderIndex?: number;

  @IsOptional()
  @IsInt()
  questionVersionSnapshot?: number;

  @IsOptional()
  @IsNumber()
  pointShare?: number;
}

export class CreateRoleTemplateDto {
  @IsString()
  @IsNotEmpty()
  roleName: string;

  @IsNotEmpty()
  weightingPreset: Record<string, number>;

  @IsInt()
  @Min(1)
  durationMinutes: number;

  @IsOptional()
  @IsEnum(Department)
  department?: Department;

  @IsOptional()
  @IsEnum(ExperienceLevel)
  level?: ExperienceLevel;

  @IsOptional()
  @IsEnum(CandidateCategory)
  category?: CandidateCategory;

  @IsOptional()
  @IsString()
  experienceTier?: string;

  @IsOptional()
  @IsInt()
  version?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RoleTemplateQuestionInputDto)
  questions?: RoleTemplateQuestionInputDto[];
}

export class UpdateRoleTemplateDto {
  @IsOptional()
  @IsString()
  roleName?: string;

  @IsOptional()
  weightingPreset?: Record<string, number>;

  @IsOptional()
  @IsInt()
  durationMinutes?: number;

  @IsOptional()
  @IsEnum(Department)
  department?: Department;

  @IsOptional()
  @IsEnum(ExperienceLevel)
  level?: ExperienceLevel;

  @IsOptional()
  @IsEnum(CandidateCategory)
  category?: CandidateCategory;

  @IsOptional()
  @IsString()
  experienceTier?: string;

  @IsOptional()
  @IsInt()
  version?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RoleTemplateQuestionInputDto)
  questions?: RoleTemplateQuestionInputDto[];
}
