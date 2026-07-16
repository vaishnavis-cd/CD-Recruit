import { IsEnum, IsNotEmpty, IsString, IsUUID } from "class-validator";
import { CvMode } from "@cd-recruit/shared-types";

// ── Requests ─────────────────────────────────────────────────────────────────

export class StartSessionDto {
  @IsString()
  @IsNotEmpty()
  inviteToken: string;
}

export class ResumeSessionDto {
  /**
   * sessionId is in the route param, but the contract also sends it in the body.
   * We accept it from the body to match the API contract exactly; the controller
   * validates both agree via the route param.
   */
  @IsUUID()
  sessionId: string;

  @IsString()
  @IsNotEmpty()
  /** Browser-generated tab identifier — see docs/DECISIONS.md Decision 6. */
  tabId: string;
}

export class HeartbeatDto {
  @IsUUID()
  sessionId: string;

  @IsString()
  @IsNotEmpty()
  tabId: string;
}
