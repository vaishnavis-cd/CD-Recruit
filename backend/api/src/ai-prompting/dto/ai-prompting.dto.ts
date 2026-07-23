import { IsString, IsNotEmpty, IsOptional, IsNumber } from "class-validator";

export class RunAiPromptDto {
  @IsString()
  @IsNotEmpty()
  sessionId: string;

  @IsString()
  @IsNotEmpty()
  questionId: string;

  @IsString()
  @IsNotEmpty()
  prompt: string;
}

export class SubmitAiPromptDto {
  @IsString()
  @IsNotEmpty()
  sessionId: string;

  @IsString()
  @IsNotEmpty()
  questionId: string;

  @IsString()
  @IsOptional()
  prompt?: string;

  @IsOptional()
  @IsNumber()
  timeSpentSeconds?: number;
}
