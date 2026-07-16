# CD-Recruit NestJS DTOs

> These DTO classes live in `backend/api/src/common/dto/`.  
> All use `class-validator` decorators for request validation and `class-transformer` for serialization.  
> Import shared types from `@cd-recruit/shared-types` — do NOT re-declare the interfaces.

## Files

| File              | Contents                                        |
| ----------------- | ----------------------------------------------- |
| `session.dto.ts`  | StartSession, Resume, Heartbeat, Progress DTOs  |
| `question.dto.ts` | GetQuestion response DTO                        |
| `response.dto.ts` | SaveDraft, SubmitResponse DTOs + payload unions |
| `event.dto.ts`    | LogEvent DTO                                    |
| `admin.dto.ts`    | Admin list/detail/decision DTOs                 |

---

## session.dto.ts

```typescript
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
  tabId: string;
}

export class HeartbeatDto {
  @IsUUID()
  sessionId: string;

  @IsString()
  @IsNotEmpty()
  tabId: string;
}
```

---

## response.dto.ts

```typescript
import {
  IsString,
  IsNotEmpty,
  IsUUID,
  IsNumber,
  Min,
  IsEnum,
  IsArray,
  ValidateNested,
  IsInt,
  IsOptional,
} from "class-validator";
import { Type } from "class-transformer";
import { ModuleType } from "@cd-recruit/shared-types";

// ── Payload shapes ──────────────────────────────────────────────────────────

export class McqResponsePayloadDto {
  @IsEnum(ModuleType) moduleType: ModuleType.MCQ;
  @IsInt() @Min(0) selectedIndex: number;
}

export class SqlResponsePayloadDto {
  @IsEnum(ModuleType) moduleType: ModuleType.SQL;
  @IsString() @IsNotEmpty() query: string;
}

export class CodingResponsePayloadDto {
  @IsEnum(ModuleType) moduleType: ModuleType.CODING;
  @IsString() @IsNotEmpty() code: string;
  @IsString() @IsNotEmpty() language: string;
}

export class AiPromptingResponsePayloadDto {
  @IsEnum(ModuleType) moduleType: ModuleType.AI_PROMPTING;
  @IsString() @IsNotEmpty() prompt: string;
}

export class ActionLogEntryDto {
  @IsString() @IsNotEmpty() type: string;
  payload: Record<string, unknown>;
  @IsString() @IsNotEmpty() timestamp: string;
}

export class SimulationResponsePayloadDto {
  @IsEnum(ModuleType) moduleType: ModuleType.SIMULATION;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ActionLogEntryDto)
  actionLog: ActionLogEntryDto[];
}

// ── Request DTOs ─────────────────────────────────────────────────────────────

export class SaveDraftDto {
  @IsUUID() sessionId: string;
  @IsUUID() questionId: string;
  /** Validated polymorphically by the service layer using moduleType discriminant. */
  responsePayload: unknown;
  @IsNumber() @Min(0) timeSpentSeconds: number;
}

export class SubmitResponseDto {
  @IsUUID() sessionId: string;
  @IsUUID() questionId: string;
  responsePayload: unknown;
  @IsNumber() @Min(0) timeSpentSeconds: number;
}
```

---

## event.dto.ts

```typescript
import { IsString, IsNotEmpty, IsObject, IsISO8601 } from "class-validator";

export class LogEventDto {
  @IsString()
  @IsNotEmpty()
  eventType: string;

  @IsObject()
  payload: Record<string, unknown>;

  @IsISO8601()
  occurredAt: string;
}
```

---

## admin.dto.ts

```typescript
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import { ReviewDecision, SessionStatus } from "@cd-recruit/shared-types";

export class ListSessionsQueryDto {
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
  @IsEnum(SessionStatus)
  status?: SessionStatus;

  @IsOptional()
  @IsUUID()
  roleTemplateId?: string;
}

export class RecordDecisionDto {
  @IsEnum(ReviewDecision)
  decision: ReviewDecision;
}
```

---

## Validation pipe setup (main.ts or AppModule)

```typescript
// backend/api/src/main.ts — add to bootstrap():
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true, // strip unknown properties
    forbidNonWhitelisted: true,
    transform: true, // auto-transform query params to correct types
  }),
);
```
