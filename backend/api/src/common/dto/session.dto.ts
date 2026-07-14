import { IsString, IsNotEmpty, IsUUID } from "class-validator";

export class StartSessionDto {
  @IsString()
  @IsNotEmpty()
  inviteToken: string;
}

export class ResumeSessionDto {
  @IsUUID()
  sessionId: string;

  @IsString()
  @IsNotEmpty()
  /** Browser-generated tab identifier for single-active-session enforcement. */
  tabId: string;
}

export class HeartbeatDto {
  @IsUUID()
  sessionId: string;

  @IsString()
  @IsNotEmpty()
  tabId: string;
}
