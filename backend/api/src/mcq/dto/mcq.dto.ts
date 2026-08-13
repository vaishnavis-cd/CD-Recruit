import { IsString, IsNotEmpty, IsUUID, IsNumber, IsOptional, Min, IsArray } from "class-validator";

export class SubmitMcqDto {
  @IsUUID()
  @IsNotEmpty()
  sessionId: string;

  @IsUUID()
  @IsNotEmpty()
  questionId: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  selectedOptions?: string[];

  @IsNumber()
  @IsOptional()
  @Min(0)
  timeSpentSeconds?: number;
}

export class DraftMcqDto {
  @IsUUID()
  @IsNotEmpty()
  sessionId: string;

  @IsUUID()
  @IsNotEmpty()
  questionId: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  selectedOptions?: string[];

  @IsNumber()
  @IsOptional()
  @Min(0)
  timeSpentSeconds?: number;
}
