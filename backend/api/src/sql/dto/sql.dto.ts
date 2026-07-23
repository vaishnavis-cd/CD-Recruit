import { IsString, IsNotEmpty, IsUUID, IsNumber, IsOptional, Min } from "class-validator";

export class RunSqlDto {
  @IsUUID()
  @IsNotEmpty()
  sessionId: string;

  @IsUUID()
  @IsNotEmpty()
  questionId: string;

  @IsString()
  @IsNotEmpty()
  query: string;
}

export class SubmitSqlDto {
  @IsUUID()
  @IsNotEmpty()
  sessionId: string;

  @IsUUID()
  @IsNotEmpty()
  questionId: string;

  @IsString()
  @IsOptional()
  query?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  timeSpentSeconds?: number;
}

export class DraftSqlDto {
  @IsUUID()
  @IsNotEmpty()
  sessionId: string;

  @IsUUID()
  @IsNotEmpty()
  questionId: string;

  @IsString()
  @IsOptional()
  query?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  timeSpentSeconds?: number;
}
