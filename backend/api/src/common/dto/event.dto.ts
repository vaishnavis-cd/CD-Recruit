import { IsISO8601, IsNotEmpty, IsObject, IsString } from "class-validator";
import { EventType } from "@cd-recruit/shared-types";

export class LogEventDto {
  @IsString()
  @IsNotEmpty()
  eventType: EventType;

  @IsObject()
  payload: Record<string, unknown>;

  @IsISO8601()
  occurredAt: string;
}
