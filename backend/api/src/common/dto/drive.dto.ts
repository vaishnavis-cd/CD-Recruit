import {
  IsString,
  IsNotEmpty,
  IsUUID,
  IsOptional,
  IsEnum,
  IsDateString,
  IsArray,
  ValidateNested,
  IsEmail,
  IsInt,
  Min,
  Max,
} from "class-validator";
import { Type } from "class-transformer";
import { DriveStatus } from "@cd-recruit/shared-types";

export class DriveCandidateDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  candidateEmail: string;
}

export class CreateDriveDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsUUID()
  roleTemplateId: string;

  @IsOptional()
  moduleConfig?: any; // We validate internally in service for structure

  @IsOptional()
  @IsEnum(DriveStatus)
  status?: DriveStatus;

  @IsOptional()
  @IsDateString()
  scheduleStart?: string;

  @IsOptional()
  @IsDateString()
  scheduleEnd?: string;

  @IsOptional()
  @IsArray()
  @IsUUID("4", { each: true })
  questionIds?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DriveCandidateDto)
  candidates?: DriveCandidateDto[];
}

export class UpdateDriveDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsUUID()
  roleTemplateId?: string;

  @IsOptional()
  moduleConfig?: any;

  @IsOptional()
  @IsEnum(DriveStatus)
  status?: DriveStatus;

  @IsOptional()
  @IsDateString()
  scheduleStart?: string;

  @IsOptional()
  @IsDateString()
  scheduleEnd?: string;
}

export class SaveDriveQuestionsDto {
  @IsArray()
  @IsString({ each: true })
  questionIds: string[];
}

export class AddCandidatesBulkDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DriveCandidateDto)
  candidates: DriveCandidateDto[];
}

export class ListDrivesQueryDto {
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
  @IsEnum(DriveStatus)
  status?: DriveStatus;

  @IsOptional()
  @IsString()
  search?: string;
}
