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

export class PartnerCandidateInputDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsNumber()
  ai_score?: number;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class PushPartnerCandidatesDto {
  @IsString()
  @IsNotEmpty()
  department_code: string;

  @IsString()
  @IsNotEmpty()
  level: string;

  @IsString()
  @IsNotEmpty()
  requisition_ref: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PartnerCandidateInputDto)
  candidates: PartnerCandidateInputDto[];
}
