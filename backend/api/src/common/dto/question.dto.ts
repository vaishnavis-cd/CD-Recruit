import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsArray,
  IsInt,
  Min,
  Max,
} from "class-validator";
import { Type } from "class-transformer";
import { ModuleType, QuestionStatus } from "@cd-recruit/shared-types";

export class CreateQuestionDto {
  @IsEnum(ModuleType)
  moduleType: ModuleType;

  @IsNotEmpty()
  content: any;

  @IsOptional()
  scoringConfig?: any;

  @IsOptional()
  @IsString()
  difficulty?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsEnum(QuestionStatus)
  status?: QuestionStatus;
}

export class UpdateQuestionDto {
  @IsOptional()
  @IsEnum(ModuleType)
  moduleType?: ModuleType;

  @IsOptional()
  content?: any;

  @IsOptional()
  scoringConfig?: any;

  @IsOptional()
  @IsString()
  difficulty?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsEnum(QuestionStatus)
  status?: QuestionStatus;
}

export class ListQuestionsQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  @Type(() => Number)
  pageSize: number = 20;

  @IsOptional()
  @IsEnum(ModuleType)
  moduleType?: ModuleType;

  @IsOptional()
  @IsString()
  difficulty?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsEnum(QuestionStatus)
  status?: QuestionStatus;
}
