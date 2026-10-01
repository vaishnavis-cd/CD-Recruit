import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsString,
  MinLength,
  IsDateString,
  IsOptional,
  IsArray,
  IsUUID,
} from "class-validator";

export class DeclareIncidentWindowDto {
  @ApiProperty({
    description: "Title of infrastructure incident",
    example: "AWS eu-west-1 Network Outage",
  })
  @IsString()
  @MinLength(3)
  title: string;

  @ApiProperty({
    description: "Operational incident reason and justification (min 10 chars, zero PII)",
    example: "Major network disruption causing candidate container disconnects and evaluation timeouts",
  })
  @IsString()
  @MinLength(10)
  reason: string;

  @ApiProperty({
    description: "Incident tracking or Jira ticket reference",
    example: "INC-9912",
  })
  @IsString()
  @MinLength(3)
  ticketRef: string;

  @ApiProperty({
    description: "Start of incident window (ISO-8601)",
    example: "2026-09-28T10:00:00Z",
  })
  @IsDateString()
  startedAt: string;

  @ApiPropertyOptional({
    description: "End of incident window (ISO-8601)",
    example: "2026-09-28T12:00:00Z",
  })
  @IsOptional()
  @IsDateString()
  endedAt?: string;

  @ApiPropertyOptional({
    description: "Optional list of affected campus drive UUIDs",
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsUUID("4", { each: true })
  affectedDrives?: string[];
}
