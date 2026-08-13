import { IsString, IsUUID, IsOptional, IsNumber } from "class-validator";

export class SubmitTestScenarioDto {
  @IsUUID()
  sessionId: string;

  @IsString()
  questionId: string;

  @IsString()
  answer: string;

  @IsOptional()
  @IsNumber()
  timeSpentSeconds?: number;
}
