import { IsString, IsNotEmpty, IsUUID, IsNumber, IsOptional, Min, IsObject } from "class-validator";

export class StartNosqlDto {
  @IsUUID()
  @IsNotEmpty()
  sessionId: string;

  @IsUUID()
  @IsNotEmpty()
  questionId: string;
}

export class RunNosqlDto {
  @IsUUID()
  @IsNotEmpty()
  sessionId: string;

  @IsUUID()
  @IsNotEmpty()
  questionId: string;

  @IsObject()
  @IsNotEmpty()
  operation: any;
}

export class ResetNosqlDto {
  @IsUUID()
  @IsNotEmpty()
  sessionId: string;

  @IsUUID()
  @IsNotEmpty()
  questionId: string;
}

export class SubmitNosqlDto {
  @IsUUID()
  @IsNotEmpty()
  sessionId: string;

  @IsUUID()
  @IsNotEmpty()
  questionId: string;

  @IsObject()
  @IsNotEmpty()
  operation: any;

  @IsString()
  @IsOptional()
  query?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  timeSpentSeconds?: number;
}
