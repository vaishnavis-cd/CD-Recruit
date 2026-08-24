import {
  IsString,
  IsNotEmpty,
  IsArray,
  ValidateNested,
  IsEmail,
  IsOptional,
  IsNumber,
  IsObject,
} from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class PartnerCandidateInputDto {
  @ApiProperty({ description: "Candidate primary email address", example: "jane.doe@example.com" })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ description: "Candidate full name", example: "Jane Doe" })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    description:
      "Candidate experience level for EXPERIENCED category. Valid options: '0-1' (Fresher), '2-5' (Level 1), '6-10' (Level 2), '11-15' (Level 3)",
    example: "2-5",
  })
  @IsOptional()
  @IsString()
  level?: string;

  @ApiPropertyOptional({ description: "Alternative alias for level", example: "LEVEL_1" })
  @IsOptional()
  @IsString()
  experience_level?: string;

  @ApiPropertyOptional({ description: "External candidate identifier from partner ATS", example: "ext-cand-101" })
  @IsOptional()
  @IsString()
  external_candidate_ref?: string;

  @ApiPropertyOptional({ description: "Candidate phone number in E.164 format", example: "+1234567890" })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ description: "AI screening score from partner pre-evaluation", example: 85.5 })
  @IsOptional()
  @IsNumber()
  ai_score?: number;

  @ApiPropertyOptional({ description: "Custom key-value metadata from partner ATS", example: { jobId: "eng-404" } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class PushPartnerCandidatesDto {
  @ApiProperty({
    description: "Department code (e.g. SOFTWARE_ENGINEERING, DATA_ENGINEERING, QA, PMO, SRE, SYSOPS, ITOPS, SECOPS)",
    example: "SOFTWARE_ENGINEERING",
  })
  @IsString()
  @IsNotEmpty()
  department_code: string;

  @ApiPropertyOptional({
    description: "Candidate category: 'FRESHER' or 'EXPERIENCED'",
    example: "EXPERIENCED",
    enum: ["FRESHER", "EXPERIENCED"],
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    description: "Legacy category field alias ('FRESHER' or 'EXPERIENCED') for backwards compatibility",
    example: "EXPERIENCED",
    enum: ["FRESHER", "EXPERIENCED"],
  })
  @IsOptional()
  @IsString()
  level?: string;

  @ApiProperty({
    description: "Stable requisition reference ID for grouping candidate batches into a Drive",
    example: "REQ-2026-ENG-006",
  })
  @IsString()
  @IsNotEmpty()
  requisition_ref: string;

  @ApiPropertyOptional({
    description: "Optional custom drive title",
    example: "Senior Full-Stack Sprint",
  })
  @IsOptional()
  @IsString()
  drive_name?: string;

  @ApiProperty({
    description: "Array of candidates to ingest (supports up to 1,000 candidates per batch)",
    type: [PartnerCandidateInputDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PartnerCandidateInputDto)
  candidates: PartnerCandidateInputDto[];
}
