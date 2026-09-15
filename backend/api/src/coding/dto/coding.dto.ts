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
import { Type, Transform } from "class-transformer";
import { SUPPORTED_CODING_LANGUAGES } from "@cd-recruit/shared-types";

const normalizeLanguage = ({ value }: { value: any }) => {
  if (!value || typeof value !== "string") return value;
  const clean = value.toLowerCase().trim();
  if (clean.includes("cpp") || clean.includes("c++")) return "cpp";
  if (clean.includes("python")) return "python";
  if (clean.includes("javascript") || clean.includes("js") || clean.includes("node")) return "javascript";
  if (clean.includes("typescript") || clean.includes("ts")) return "typescript";
  if (clean.includes("java")) return "java";
  if (clean.includes("go")) return "go";
  return clean;
};

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
  @Transform(normalizeLanguage)
  @IsIn([...SUPPORTED_CODING_LANGUAGES, "python3", "python 3", "c++", "c++ (gcc)", "cpp (gcc)", "javascript (node.js)", "java (jdk)", "typescript", "go"])
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
  @Transform(normalizeLanguage)
  @IsIn([...SUPPORTED_CODING_LANGUAGES, "python3", "python 3", "c++", "c++ (gcc)", "cpp (gcc)", "javascript (node.js)", "java (jdk)", "typescript", "go"])
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
  @Transform(normalizeLanguage)
  @IsIn([...SUPPORTED_CODING_LANGUAGES, "python3", "python 3", "c++", "c++ (gcc)", "cpp (gcc)", "javascript (node.js)", "java (jdk)", "typescript", "go"])
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
