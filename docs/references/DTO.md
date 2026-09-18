# CD-Recruit NestJS DTOs & Validation Schema Reference

> These DTO classes live in `backend/api/src/common/dto/` and specific feature modules.  
> All use `class-validator` decorators for request validation and `class-transformer` for serialization.  
> Shared types and enums are imported from `@cd-recruit/shared-types` — do NOT re-declare the interfaces.

---

## 1. DTO Directory & Module Map

| File / Location | Domain | Contents / Exported DTOs |
| :--- | :--- | :--- |
| `common/dto/auth.dto.ts` | Authentication | `LoginDto`, `RefreshTokenDto`, `ChangePasswordDto` |
| `common/dto/session.dto.ts` | Session Lifecycle | `StartSessionDto`, `ResumeSessionDto`, `HeartbeatDto` |
| `common/dto/question.dto.ts` | Question Bank | `CreateQuestionDto`, `UpdateQuestionDto`, `QuestionQueryDto` |
| `common/dto/response.dto.ts` | Candidate Submissions | `SaveDraftDto`, `SubmitResponseDto` + polymorphic payload unions |
| `common/dto/event.dto.ts` | Proctoring Telemetry | `LogEventDto` |
| `common/dto/drive.dto.ts` | Drive Management | `CreateDriveDto`, `UpdateDriveDto`, `AddCandidatesDto` |
| `common/dto/settings.dto.ts` | Platform Configuration | `UpdateSettingsDto`, `TimeMatrixDto`, `ProctoringThresholdsDto` |
| `common/dto/admin.dto.ts` | Recruiter Review | `ListSessionsQueryDto`, `RecordDecisionDto` |
| `modules/nosql/dto/nosql.dto.ts` | NoSQL Sandbox | `StartNosqlDto`, `RunNosqlDto`, `ResetNosqlDto`, `SubmitNosqlDto` |
| `test-scenarios/dto/test-scenarios.dto.ts` | QA Test Scenarios | `SubmitTestScenarioDto`, `TestCaseEntryDto` |
| `role-template/dto/role-template.dto.ts` | Role Templates | `CreateRoleTemplateDto`, `UpdateRoleTemplateDto` |
| `partner/dto/partner-admin.dto.ts` | Partner Integration | `CreatePartnerDto`, `UpdatePartnerDto`, `PartnerKeyResponseDto` |

---

## 2. Common Authentication DTOs (`auth.dto.ts`)

```typescript
import { IsString, IsNotEmpty, MinLength } from "class-validator";

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  identifier: string; // Email or Username

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;
}

export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  oldPassword: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  newPassword: string;
}
```

---

## 3. Session Lifecycle DTOs (`session.dto.ts`)

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

## 4. Assessment Response & Payload DTOs (`response.dto.ts`)

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
  IsObject,
} from "class-validator";
import { Type } from "class-transformer";
import { ModuleType } from "@cd-recruit/shared-types";

// ── Polymorphic Module Response Payload Shapes ───────────────────────────────

export class McqResponsePayloadDto {
  @IsEnum(ModuleType) moduleType: ModuleType.MCQ;
  @IsInt() @Min(0) selectedIndex: number;
}

export class SqlResponsePayloadDto {
  @IsEnum(ModuleType) moduleType: ModuleType.SQL;
  @IsString() @IsNotEmpty() query: string;
}

export class NosqlResponsePayloadDto {
  @IsEnum(ModuleType) moduleType: ModuleType.NOSQL;
  @IsObject() @IsNotEmpty() operation: {
    collection: string;
    operator: string;
    payload: Record<string, unknown>;
  };
}

export class CodingResponsePayloadDto {
  @IsEnum(ModuleType) moduleType: ModuleType.CODING;
  @IsString() @IsNotEmpty() code: string;
  @IsString() @IsNotEmpty() language: string;
}

export class DebuggingResponsePayloadDto {
  @IsEnum(ModuleType) moduleType: ModuleType.DEBUGGING;
  @IsString() @IsNotEmpty() patchedCode: string;
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

export class TestCaseEntryDto {
  @IsString() @IsNotEmpty() title: string;
  @IsString() @IsNotEmpty() preConditions: string;
  @IsArray() steps: string[];
  @IsString() @IsNotEmpty() expectedResult: string;
  @IsString() severity: string;
}

export class TestScenariosResponsePayloadDto {
  @IsEnum(ModuleType) moduleType: ModuleType.TEST_SCENARIOS;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TestCaseEntryDto)
  testCases: TestCaseEntryDto[];
}

// ── Top-Level Candidate Submissions ──────────────────────────────────────────

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

## 5. Telemetry & Proctoring Event DTOs (`event.dto.ts`)

```typescript
import { IsString, IsNotEmpty, IsObject, IsISO8601 } from "class-validator";

export class LogEventDto {
  @IsString()
  @IsNotEmpty()
  eventType: string; // "TAB_SWITCH" | "BLUR" | "PASTE" | "FULLSCREEN_EXIT" | "HEARTBEAT"

  @IsObject()
  payload: Record<string, unknown>;

  @IsISO8601()
  occurredAt: string;
}
```

---

## 6. Admin & Review DTOs (`admin.dto.ts`)

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
  decision: ReviewDecision; // "ACCEPTED" | "REJECTED" | "NEEDS_FURTHER_REVIEW"

  @IsOptional()
  notes?: string;
}
```

---

## 7. Global Validation Pipe Setup

```typescript
// backend/api/src/main.ts
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true, // Strips non-whitelisted payload properties
    forbidNonWhitelisted: true, // Throws 400 Bad Request if extra fields sent
    transform: true, // Automatically transforms primitives based on DTO types
  }),
);
```
