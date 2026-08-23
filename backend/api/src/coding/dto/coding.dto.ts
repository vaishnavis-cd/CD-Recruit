import {
  IsString,
  IsNotEmpty,
  IsUUID,
  IsNumber,
  IsOptional,
  Min,
  MaxLength,
  IsIn,
  IsArray,
  ArrayMaxSize,
  ValidateNested,
  IsBoolean,
} from "class-validator";
import { Type } from "class-transformer";
import { SUPPORTED_CODING_LANGUAGES } from "@cd-recruit/shared-types";

export class TestCaseDto {
  @IsString()
  @IsOptional()
  @MaxLength(5000)
  input?: string;

  @IsString()
  @IsOptional()
  @MaxLength(5000)
  expectedOutput?: string;

  @IsBoolean()
  @IsOptional()
  isHidden?: boolean;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  label?: string;
}

export class RunCodingDto {
  @IsUUID()
  @IsNotEmpty()
  sessionId: string;

  @IsUUID()
  @IsNotEmpty()
  questionId: string;

  @IsString()
  @IsNotEmpty()
  @IsIn([...SUPPORTED_CODING_LANGUAGES])
  language: string;

  @IsString()
  @IsOptional()
  @MaxLength(20000)
  sourceCode?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20000)
  code?: string;

  @IsArray()
  @IsOptional()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => TestCaseDto)
  testCases?: TestCaseDto[];
}

export class SubmitCodingDto {
  @IsUUID()
  @IsNotEmpty()
  sessionId: string;

  @IsUUID()
  @IsNotEmpty()
  questionId: string;

  @IsString()
  @IsOptional()
  @IsIn([...SUPPORTED_CODING_LANGUAGES])
  language?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20000)
  sourceCode?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20000)
  code?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  timeSpentSeconds?: number;
}

export class DraftCodingDto {
  @IsUUID()
  @IsNotEmpty()
  sessionId: string;

  @IsUUID()
  @IsNotEmpty()
  questionId: string;

  @IsString()
  @IsOptional()
  @IsIn([...SUPPORTED_CODING_LANGUAGES])
  language?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20000)
  sourceCode?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20000)
  code?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  timeSpentSeconds?: number;
}
