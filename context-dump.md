# CODEBASE CONTEXT DUMP — CD-RECRUIT

This document contains verbatim source code, configuration files, and architectural patterns from the `cd-recruit` codebase, compiled for external architectural review.

---

# SECTION 1: PRISMA SCHEMA

### File Location: `backend/prisma/schema.prisma`

```prisma
// CD-Recruit — Prisma Schema (Phase 1 final)
// Field naming: camelCase in Prisma models (matches packages/shared-types + API contract)
// mapped via @map to snake_case DB columns (standard Postgres convention).
// Table names mapped via @@map to snake_case as well.

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ---------- Enums ----------

enum ModuleType {
  MCQ
  SQL
  CODING
  DEBUGGING
  AI_PROMPTING
  SIMULATION
  NOSQL
}

enum SessionStatus {
  NOT_STARTED
  IN_PROGRESS
  DISCONNECTED
  AUTO_SUBMITTED
  SUBMITTED
  CLOSED
  ABANDONED
}

enum CvMode {
  FULL
  REDUCED
}

enum StaffRole {
  RECRUITER
  ADMIN
}

enum DecisionType {
  ADVANCE
  REJECT
}

enum InviteStatus {
  PENDING
  REDEEMED
  EXPIRED
  REVOKED
}

enum DriveStatus {
  DRAFT
  SCHEDULED
  ACTIVE
  CLOSED
}

enum QuestionStatus {
  DRAFT
  PUBLISHED
  ARCHIVED
}

enum SubmissionType {
  RUN
  SUBMIT
}

enum ExecutionStatus {
  PENDING
  RUNNING
  COMPLETED
  COMPILATION_ERROR
  RUNTIME_ERROR
  TIMEOUT
  MEMORY_LIMIT
  FAILED
}

enum SqlExecutionStatus {
  PENDING
  RUNNING
  COMPLETED
  QUERY_ERROR
  TIMEOUT
  FAILED
}

enum ConsentType {
  TERMS
  BIOMETRIC
  SELFIE
  AUDIO
}



model RoleTemplate {
  id              String   @id @default(uuid())
  roleName        String   @map("role_name")
  weightingPreset Json     @map("weighting_preset")
  durationMinutes Int      @map("duration_minutes") // drives session.deadlineAt

  sessions  Session[]
  invites   Invite[]
  drives    Drive[]

  @@map("role_template")
}

model Drive {
  id             String      @id @default(uuid())
  organizationId String?     @map("organization_id")
  name           String
  roleTemplateId String      @map("role_template_id")
  moduleConfig   Json        @map("module_config")
  status         DriveStatus @default(DRAFT)
  scheduleStart  DateTime?   @map("schedule_start")
  scheduleEnd    DateTime?   @map("schedule_end")
  createdById    String      @map("created_by_id")
  createdAt      DateTime    @default(now()) @map("created_at")
  bufferMinutes  Int         @default(15) @map("buffer_minutes")
  graceMinutes   Int         @default(5) @map("grace_minutes")
  slotDistribution Json?     @map("slot_distribution")

  organization   Organization? @relation(fields: [organizationId], references: [id])
  roleTemplate   RoleTemplate  @relation(fields: [roleTemplateId], references: [id])
  createdBy      Staff         @relation(fields: [createdById], references: [id])
  sessions       Session[]
  invites        Invite[]
  questions      DriveQuestion[]

  @@map("drive")
}

model DriveQuestion {
  id                      String     @id @default(uuid())
  driveId                 String     @map("drive_id")
  questionId              String     @map("question_id")
  moduleType              ModuleType @map("module_type")
  questionVersionSnapshot Int?       @map("question_version_snapshot")
  pointShare              Float?     @map("point_share")

  drive    Drive    @relation(fields: [driveId], references: [id], onDelete: Cascade)
  question Question @relation(fields: [questionId], references: [id], onDelete: Cascade)

  @@unique([driveId, questionId])
  @@map("drive_question")
}

model Question {
  id             String     @id @default(uuid())
  moduleType     ModuleType @map("module_type")
  role           String?    @default("General")
  content        Json
  scoringConfig  Json?      @map("scoring_config")
  difficulty     String?
  tags           String[]
  folderId       String?    @map("folder_id")
  version        Int        @default(1)
  status         QuestionStatus @default(PUBLISHED)

  moduleResponses ModuleResponse[]
  driveQuestions  DriveQuestion[]
  codingExecutions CodingExecution[]
  sqlExecutions    SQLExecution[]

  @@map("question")
}

model Organization {
  id        String   @id @default(uuid())
  name      String
  slug      String   @unique
  createdAt DateTime @default(now()) @map("created_at")

  candidates Candidate[]
  drives     Drive[]
  staff      Staff[]
  sessions   Session[]

  @@map("organization")
}

model Candidate {
  id             String        @id @default(uuid())
  organizationId String?       @map("organization_id")
  email          String        @unique
  name           String
  createdAt      DateTime      @default(now()) @map("created_at")

  organization   Organization? @relation(fields: [organizationId], references: [id])
  sessions       Session[]
  consentRecords ConsentRecord[]

  @@map("candidate")
}

model ConsentRecord {
  id           String      @id @default(uuid())
  candidateId  String      @map("candidate_id")
  consentType  ConsentType @map("consent_type")
  version      String
  consentedAt  DateTime    @default(now()) @map("consented_at")
  ipAddress    String      @map("ip_address")

  candidate Candidate @relation(fields: [candidateId], references: [id])

  @@map("consent_record")
}

model Session {
  id                 String        @id @default(uuid())
  organizationId     String?       @map("organization_id")
  candidateId        String        @map("candidate_id")
  roleTemplateId     String        @map("role_template_id")
  driveId            String?       @map("drive_id")
  cvMode             CvMode        @map("cv_mode")
  status             SessionStatus @default(NOT_STARTED)
  baselineSelfieRef  String?       @map("baseline_selfie_ref")
  tutorialMode       String        @default("full") @map("tutorial_mode")
  actualStartAt      DateTime?     @map("actual_start_at")

  startedAt        DateTime? @map("started_at")
  deadlineAt        DateTime? @map("deadline_at")          // startedAt + roleTemplate.durationMinutes
  submittedAt       DateTime? @map("submitted_at")
  lastActivityAt    DateTime? @map("last_activity_at")
  lastHeartbeatAt   DateTime? @map("last_heartbeat_at")     // tab-alive signal, every 15s
  disconnectedAt    DateTime? @map("disconnected_at")       // set when heartbeat goes stale
  activeTabId       String?   @map("active_tab_id")         // single-active-session enforcement
  disconnectCount   Int       @default(0) @map("disconnect_count") // incremented on each DISCONNECTED event; AUTO_SUBMITTED when ≥ 3
  workspaceStatus   String?   @default("provisioning") @map("workspace_status")
  simulationSnapshot Json?    @map("simulation_snapshot")

  organization Organization? @relation(fields: [organizationId], references: [id])
  candidate    Candidate    @relation(fields: [candidateId], references: [id])
  roleTemplate RoleTemplate @relation(fields: [roleTemplateId], references: [id])
  drive        Drive?       @relation(fields: [driveId], references: [id])

  moduleResponses   ModuleResponse[]
  eventLogs         EventLog[]
  integrityFlags    IntegrityFlag[]
  proctoringEvents  ProctoringEvent[]
  score             Score?
  reviewerDecision  ReviewerDecision?
  invite            Invite?
  codingExecutions  CodingExecution[]
  sqlExecutions     SQLExecution[]

  @@index([candidateId])
  @@index([status])
  @@index([deadlineAt])
  @@index([lastHeartbeatAt])
  @@map("session")
}

model ModuleResponse {
  id                String   @id @default(uuid())
  sessionId         String   @map("session_id")
  questionId        String   @map("question_id")
  responsePayload   Json     @map("response_payload")
  timeSpentSeconds  Int?     @map("time_spent_seconds")
  isDraft           Boolean  @default(true) @map("is_draft") // true until real submit overwrites it
  lastAutosavedAt   DateTime? @map("last_autosaved_at")
  sandboxDbName     String?   @map("sandbox_db_name")
  lastOperation     Json?     @map("last_operation")
  executionCount    Int       @default(0) @map("execution_count")

  session  Session  @relation(fields: [sessionId], references: [id])
  question Question @relation(fields: [questionId], references: [id])

  @@unique([sessionId, questionId])
  @@map("module_response")
}

model EventLog {
  id         String   @id @default(uuid())
  sessionId  String   @map("session_id")
  eventType  String   @map("event_type")
  payload    Json
  occurredAt DateTime @default(now()) @map("occurred_at")

  session Session @relation(fields: [sessionId], references: [id])

  @@map("event_log")
}

model IntegrityFlag {
  id         String   @id @default(uuid())
  sessionId  String   @map("session_id")
  category   String
  confidence Float
  severity   String
  flaggedAt  DateTime @default(now()) @map("flagged_at")

  disposition     String?
  dispositionAt   DateTime? @map("disposition_at")
  dispositionById String?   @map("disposition_by_id")

  session      Session       @relation(fields: [sessionId], references: [id])
  evidenceClip EvidenceClip?

  @@map("integrity_flag")
}

model EvidenceClip {
  id         String   @id @default(uuid())
  flagId     String   @unique @map("flag_id")
  storageRef String   @map("storage_ref")
  expiresAt  DateTime @map("expires_at")

  flag IntegrityFlag @relation(fields: [flagId], references: [id])

  @@map("evidence_clip")
}

model Score {
  id                     String  @id @default(uuid())
  sessionId              String  @unique @map("session_id")
  compositeScore         Float   @map("composite_score")
  coreScore              Float   @default(0) @map("core_score")
  bonusScore             Float   @default(0) @map("bonus_score")
  totalScore             Float   @default(0) @map("total_score")
  moduleScores           Json    @map("module_scores")
  sayDoConsistencyScore  Float   @map("say_do_consistency_score")
  aiConfidence           Float   @map("ai_confidence")
  humanReviewed          Boolean @default(false) @map("human_reviewed")
  sayDoRationale         String? @map("say_do_rationale")
  sayDoMismatches        Json?   @map("say_do_mismatches")
  gradingSource          String  @default("placeholder") @map("grading_source")

  session Session @relation(fields: [sessionId], references: [id])

  @@map("score")
}

model Staff {
  id              String    @id @default(uuid())
  organizationId  String?   @map("organization_id")
  email           String    @unique
  name            String
  role            StaffRole @default(RECRUITER)
  keycloakUserId  String    @unique @map("keycloak_user_id")
  createdAt       DateTime  @default(now()) @map("created_at")

  organization      Organization?    @relation(fields: [organizationId], references: [id])
  reviewerDecisions ReviewerDecision[]
  invites           Invite[]
  drives            Drive[]
  auditLogs         AuditLog[]

  @@map("staff")
}

model ReviewerDecision {
  id         String       @id @default(uuid())
  sessionId  String       @unique @map("session_id")
  staffId    String       @map("staff_id") // renamed from reviewerId to match STAFF table
  decision   DecisionType
  decidedAt  DateTime     @default(now()) @map("decided_at")
  note       String?
  agreedWithAi Boolean?   @map("agreed_with_ai")

  session Session @relation(fields: [sessionId], references: [id])
  staff   Staff   @relation(fields: [staffId], references: [id])

  @@map("reviewer_decision")
}

model Invite {
  id              String       @id @default(uuid())
  candidateEmail  String       @map("candidate_email")
  candidateName   String       @map("candidate_name")
  roleTemplateId  String       @map("role_template_id")
  driveId         String?      @map("drive_id")
  status          InviteStatus @default(PENDING)
  token           String       @unique
  createdById     String       @map("created_by_id")
  createdAt       DateTime     @default(now()) @map("created_at")
  expiresAt       DateTime     @map("expires_at")
  redeemedAt      DateTime?    @map("redeemed_at")
  revokedAt       DateTime?    @map("revoked_at")
  sessionId       String?      @unique @map("session_id")
  isGenerated     Boolean      @default(false) @map("is_generated")
  scheduledTime   DateTime?    @map("scheduled_time")
  bufferMinutes   Int          @default(15) @map("buffer_minutes")
  graceMinutes    Int          @default(5) @map("grace_minutes")

  roleTemplate RoleTemplate @relation(fields: [roleTemplateId], references: [id])
  createdBy    Staff        @relation(fields: [createdById], references: [id])
  session      Session?     @relation(fields: [sessionId], references: [id])
  drive        Drive?       @relation(fields: [driveId], references: [id])

  @@index([candidateEmail])
  @@index([status])
  @@map("invite")
}

model AuditLog {
  id         String   @id @default(uuid())
  staffId    String   @map("staff_id")
  action     String
  entityType String   @map("entity_type")
  entityId   String   @map("entity_id")
  metadata   Json
  occurredAt DateTime @default(now()) @map("occurred_at")

  staff Staff @relation(fields: [staffId], references: [id])

  @@map("audit_log")
}

model CodingExecution {
  id             String          @id @default(uuid())
  sessionId      String          @map("session_id")
  questionId     String          @map("question_id")
  languageId     Int             @map("language_id")
  submissionType SubmissionType  @map("submission_type")
  sourceCode     String          @map("source_code")
  judge0Token    String?         @map("judge0_token")
  status         ExecutionStatus
  stdout         String?
  stderr         String?
  compileOutput  String?         @map("compile_output")
  passedTests    Int             @map("passed_tests")
  totalTests     Int             @map("total_tests")
  executionTime  Float?          @map("execution_time")
  memoryUsage    Int?            @map("memory_usage")
  createdAt      DateTime        @default(now()) @map("created_at")
  completedAt    DateTime?       @map("completed_at")

  session  Session  @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  question Question @relation(fields: [questionId], references: [id], onDelete: Cascade)

  @@map("coding_execution")
}

model SQLExecution {
  id             String             @id @default(uuid())
  sessionId      String             @map("session_id")
  questionId     String             @map("question_id")
  submissionType SubmissionType     @map("submission_type")
  query          String
  status         SqlExecutionStatus
  resultJson     Json?              @map("result_json")
  passed         Boolean
  executionTime  Int?               @map("execution_time")
  createdAt      DateTime           @default(now()) @map("created_at")
  completedAt    DateTime?          @map("completed_at")

  session  Session  @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  question Question @relation(fields: [questionId], references: [id], onDelete: Cascade)

  @@map("sql_execution")
}

enum ProctoringEventType {
  FACE_MISSING
  MULTIPLE_FACES
  LOOKING_AWAY
  SEAT_EXIT
  EXCESSIVE_MOVEMENT
  PHONE_DETECTED
  HEADPHONES_DETECTED
  BOOK_DETECTED
  SPEECH_DETECTED
  SECOND_VOICE_SUSPECTED
  IDENTITY_MISMATCH
  TAB_SWITCH
  PASTE
  FULLSCREEN_EXIT
}

enum ProctoringUploadStatus {
  PENDING
  UPLOADED
  FAILED
}

model ProctoringEvent {
  id           String                 @id @default(uuid())
  sessionId    String                 @map("session_id")
  eventType    ProctoringEventType    @map("event_type")
  severity     String                 @map("severity")
  timestamp    DateTime               @map("timestamp")
  clipUrl      String?                @map("clip_url")
  modelVersion String?                @map("model_version")
  uploadStatus ProctoringUploadStatus @default(PENDING) @map("upload_status")
  createdAt    DateTime               @default(now()) @map("created_at")

  session      Session                @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@index([sessionId])
  @@map("proctoring_event")
}
```

### Specific Model Callouts:

- **Candidate Model**: `model Candidate` (Line 193). Tracks `id`, `organizationId`, `email`, `name`, `createdAt`. Has 1-to-many relationships with `Session` and `ConsentRecord`.
- **Document / Upload Models**:
  - `model ProctoringEvent` (Line 492): Contains `clipUrl` (stores the object key reference for evidence clip files uploaded to MinIO), `uploadStatus` (`PENDING`, `UPLOADED`, `FAILED`).
  - `model EvidenceClip` (Line 318): Stores `storage_ref` for flagged proctoring clips.
  - `model ConsentRecord` (Line 207): Stores DPDP compliance consent audit records (`TERMS`, `BIOMETRIC`, `SELFIE`, `AUDIO`).
- **Session / Attempt Tracking Models**:
  - `model Session` (Line 220): Primary assessment attempt model. Tracks `candidateId`, `roleTemplateId`, `driveId`, `status` (`NOT_STARTED`, `IN_PROGRESS`, `SUBMITTED`, etc.), `baselineSelfieRef` (stores baseline selfie object key), `startedAt`, `deadlineAt`, `lastHeartbeatAt`, `disconnectCount`, `activeTabId`.
  - `model Invite` (Line 382): Tracks candidate invite tokens, redemption status (`PENDING`, `REDEEMED`), and linked `sessionId`.
  - `model ModuleResponse` (Line 265): Tracks individual question attempts/responses per session.

---

# SECTION 2: EXISTING FILE UPLOAD PATTERN

### Storage Overview
- **Storage Target**: S3-compatible MinIO instance (`cd-recruit-biometric` bucket for evidence clips/selfies, `cd-recruit-general` for datasets/artefacts).
- **Upload Pattern**: Express `FileInterceptor("file")` handles `multipart/form-data` uploads in NestJS controllers.
- **Database Saving Pattern**: The raw file buffer is passed to `MinioService.putObject()`. Upon successful MinIO storage, the generated object key path string (e.g. `clients/default-org/candidates/cand_123/sessions/sess_456/events/MULTIPLE_FACES/evt_789.webm`) is saved to the database field (`proctoring_event.clip_url` or `session.baseline_selfie_ref`). When retrieving, presigned URLs are generated via `MinioService.getSignedUrl()`.

### Controller Code: `backend/api/src/proctoring/proctoring.controller.ts`

```typescript
  /**
   * POST /api/v1/proctoring/session/:sessionId/upload-evidence
   * Upload evidence clip (WebM) via multipart/form-data
   */
  @Post("session/:sessionId/upload-evidence")
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor("file"))
  @ApiOperation({
    summary: "Atomically upload proctoring video clip to MinIO and persist ProctoringEvent to database",
  })
  async uploadEvidence(
    @Param("sessionId") sessionId: string,
    @UploadedFile() file: any,
    @Body() dto: CreateProctoringEventDto,
  ) {
    this.logger.log(`[ProctoringController] ATOMIC_UPLOAD_RECEIVED: sessionId=${sessionId}, eventType=${dto?.eventType || "N/A"}, filename=${file?.originalname || "N/A"}, size=${file?.size || 0} bytes`);
    if (!file) {
      throw new BadRequestException("No video file uploaded in form field 'file'");
    }

    const payloadDto: CreateProctoringEventDto = {
      sessionId,
      eventType: dto.eventType || (file.originalname?.split("_")[0]?.toUpperCase() as any) || ("MULTIPLE_FACES" as any),
      severity: dto.severity || "HIGH",
      timestamp: dto.timestamp || new Date().toISOString(),
      modelVersion: dto.modelVersion,
    };

    return this.proctoringService.uploadEvidenceAndCreateEvent(sessionId, file, payloadDto);
  }
```

### Service Code: `backend/api/src/proctoring/proctoring.service.ts`

```typescript
  /**
   * Atomic handler: Upload video clip to MinIO AND create/update ProctoringEvent DB record in a single operation.
   */
  async uploadEvidenceAndCreateEvent(
    sessionId: string,
    file: { originalname: string; buffer: Buffer },
    dto: CreateProctoringEventDto,
  ): Promise<ProctoringEventResponse> {
    const session = await this.resolveSession(sessionId);
    if (!session) {
      throw new NotFoundException(`Session not found with ID ${sessionId}`);
    }

    const activeStatuses: SessionStatus[] = [SessionStatus.IN_PROGRESS, SessionStatus.NOT_STARTED, SessionStatus.DISCONNECTED];
    if (!activeStatuses.includes(session.status)) {
      throw new BadRequestException(
        `Upload rejected: session is in ${session.status} state. Uploads only allowed for active assessments.`,
      );
    }

    const clientSlug = (session as any).candidate?.organization?.slug ?? "default-org";
    const candidateName = (session as any).candidate?.name ?? "unnamed";
    const candidateId = session.candidateId;
    const eventTimestamp = new Date(dto.timestamp || Date.now());

    // Check for duplicate event BEFORE uploading to MinIO using sliding window
    const existingDuplicate = await this.findRecentDuplicateEvent(session.id, dto.eventType, eventTimestamp);

    if (existingDuplicate && existingDuplicate.clipUrl && existingDuplicate.uploadStatus === ProctoringUploadStatus.UPLOADED) {
      const presignedUrl = await this.storage.getSignedUrl(this.bucketBiometric, existingDuplicate.clipUrl);
      return { ...existingDuplicate, clipUrl: presignedUrl };
    }

    const cooldownMs = COOLDOWNS[dto.eventType] ?? 15000;
    const timeBucket = Math.floor(eventTimestamp.getTime() / Math.max(cooldownMs, 1000));
    const eventId = dto.id ?? (existingDuplicate ? existingDuplicate.id : `evt_${session.id.slice(0, 8)}_${dto.eventType.toLowerCase()}_${timeBucket}`);

    // Build standardized MinIO key
    const objectKey = buildEvidenceKey({
      clientSlug,
      candidateId,
      candidateName,
      sessionId: session.id,
      eventType: dto.eventType,
      eventId,
      timestamp: eventTimestamp,
    });

    // Put object in MinIO
    const success = await this.storage.putObject(
      this.bucketBiometric,
      objectKey,
      file.buffer,
      { "Content-Type": "video/webm" },
    );

    const uploadStatus = success ? ProctoringUploadStatus.UPLOADED : ProctoringUploadStatus.FAILED;

    const eventRecord = await this.prisma.proctoringEvent.upsert({
      where: { id: eventId },
      update: {
        eventType: dto.eventType,
        severity: dto.severity,
        timestamp: eventTimestamp,
        clipUrl: objectKey,
        uploadStatus,
      },
      create: {
        id: eventId,
        sessionId: session.id,
        eventType: dto.eventType,
        severity: dto.severity,
        timestamp: eventTimestamp,
        clipUrl: objectKey,
        uploadStatus,
      },
    });

    const presignedUrl = success ? await this.storage.getSignedUrl(this.bucketBiometric, objectKey) : null;
    return { ...eventRecord, clipUrl: presignedUrl };
  }
```

### Storage Module Code: `backend/api/src/integrations/minio/minio.service.ts`

```typescript
import { Injectable, OnModuleInit, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as Minio from "minio";

@Injectable()
export class MinioService implements OnModuleInit {
  private readonly logger = new Logger(MinioService.name);
  private minioClient: Minio.Client | null = null;
  private bucketBiometric: string;
  private bucketGeneral: string;
  public storageHealthy = false;

  constructor(private readonly configService: ConfigService) {
    this.bucketBiometric =
      this.configService.get<string>("minio.bucketBiometric") ??
      this.configService.get<string>("app.minio.bucketBiometric") ??
      "cd-recruit-biometric";
    this.bucketGeneral =
      this.configService.get<string>("minio.bucketGeneral") ??
      this.configService.get<string>("app.minio.bucketGeneral") ??
      "cd-recruit-general";
  }

  async onModuleInit() {
    try {
      const endPoint =
        this.configService.get<string>("minio.endpoint") ??
        "localhost";
      const port =
        this.configService.get<number>("minio.port") ??
        9000;
      const useSSL = false;
      const accessKey =
        this.configService.get<string>("minio.accessKey") ??
        "minioadmin";
      const secretKey =
        this.configService.get<string>("minio.secretKey") ??
        "minioadmin";

      this.minioClient = new Minio.Client({
        endPoint,
        port,
        useSSL,
        accessKey,
        secretKey,
        region: "us-east-1",
      });

      await this.ensureBucketsExist();
      this.storageHealthy = true;
    } catch (error: any) {
      this.storageHealthy = false;
    }
  }

  async putObject(
    bucketName: string,
    objectKey: string,
    buffer: Buffer,
    metaData?: Minio.ItemBucketMetadata,
  ): Promise<boolean> {
    if (!this.minioClient || !this.storageHealthy) {
      return false;
    }
    try {
      await this.minioClient.putObject(
        bucketName,
        objectKey,
        buffer,
        buffer.length,
        metaData,
      );
      return true;
    } catch (error: any) {
      return false;
    }
  }

  async getSignedUrl(
    bucketName: string,
    objectKey: string,
    ttlSeconds?: number,
  ): Promise<string | null> {
    if (!this.minioClient || !this.storageHealthy) return null;
    try {
      return await this.minioClient.presignedGetObject(
        bucketName,
        objectKey,
        ttlSeconds ?? 3600,
      );
    } catch (error: any) {
      return null;
    }
  }
}
```

---

# SECTION 3: EXISTING PYTHON SIDECAR INTEGRATION PATTERN

### Pattern Summary
- NestJS communicates with Python microservices using native `fetch` or HTTP clients with JSON payload bodies.
- Python services run in standalone Docker containers on internal Docker networks or localhost ports.

### Client Code 1: `backend/api/src/common/correlation-engine.client.ts`

```typescript
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class CorrelationEngineClient {
  private readonly logger = new Logger(CorrelationEngineClient.name);
  private readonly baseUrl: string;

  constructor(private configService: ConfigService) {
    this.baseUrl = this.configService.get<string>("CORRELATION_ENGINE_URL") || "http://localhost:8000";
  }

  async triggerCorrelation(sessionId: string): Promise<boolean> {
    try {
      this.logger.log(`Triggering Say-Do correlation scoring for session: ${sessionId}`);
      const response = await fetch(`${this.baseUrl}/api/v1/correlate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ session_id: sessionId }),
      });

      if (!response.ok) {
        this.logger.error(`Correlation engine returned status ${response.status}: ${await response.text()}`);
        return false;
      }

      this.logger.log(`Successfully completed Say-Do scoring for session: ${sessionId}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to trigger Say-Do correlation scoring: ${error.message}`);
      return false;
    }
  }
}
```

### Client Code 2: `backend/api/src/integrations/judge0/judge0.client.ts`

```typescript
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AppConfig } from "../../config/configuration";
import { Judge0ExecutionResponse } from "./judge0.types";

@Injectable()
export class Judge0Client {
  private readonly logger = new Logger(Judge0Client.name);
  private readonly apiUrl: string;

  constructor(private readonly configService: ConfigService<AppConfig, true>) {
    const rawUrl = this.configService.get<string>("judge0ApiUrl", { infer: true }) || "http://localhost:2358";
    this.apiUrl = rawUrl.replace(/\/+$/, "");
  }

  async createSubmission(
    sourceCodeBase64: string,
    languageId: number,
    stdinBase64?: string,
    expectedOutputBase64?: string,
  ): Promise<Judge0ExecutionResponse & { token: string }> {
    const url = `${this.apiUrl}/submissions?base64_encoded=true&wait=true`;
    const payload = {
      source_code: sourceCodeBase64,
      language_id: languageId,
      stdin: stdinBase64 || null,
      expected_output: expectedOutputBase64 || null,
      cpu_time_limit: 5.0,
      wall_time_limit: 10.0,
    };

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    return (await response.json()) as Judge0ExecutionResponse & { token: string };
  }
}
```

### Docker Compose Service Definition (`docker/docker-compose.judge0.yml`)

```yaml
services:
  judge0-server:
    image: judge0/judge0:1.13.1
    container_name: cdrecruit_judge0_server
    privileged: true
    security_opt:
      - seccomp:unconfined
    ports:
      - "2358:2358"
    environment:
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - POSTGRES_HOST=postgres
      - POSTGRES_PORT=5432
      - POSTGRES_USER=cdrecruit
      - POSTGRES_PASSWORD=cdrecruit123
      - POSTGRES_DB=cdrecruit_judge0
      - CPU_TIME_LIMIT=5.0
      - MEMORY_LIMIT=262144
    restart: always

  judge0-worker:
    image: judge0/judge0:1.13.1
    container_name: cdrecruit_judge0_worker
    command: ["./scripts/workers"]
    privileged: true
    security_opt:
      - seccomp:unconfined
    environment:
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - POSTGRES_HOST=postgres
      - POSTGRES_PORT=5432
      - POSTGRES_USER=cdrecruit
      - POSTGRES_PASSWORD=cdrecruit123
      - POSTGRES_DB=cdrecruit_judge0
    restart: always
```

### Request/Response DTO Shapes
- **Correlation Engine Request Payload**: `{ session_id: string }`
- **Correlation Engine Response Payload**: `{ status: string, scores?: Record<string, any> }`
- **Judge0 Submission Request Payload**:
  ```json
  {
    "source_code": "base64_encoded_string",
    "language_id": 71,
    "stdin": "base64_encoded_stdin",
    "expected_output": "base64_encoded_expected_output",
    "cpu_time_limit": 5.0,
    "wall_time_limit": 10.0
  }
  ```
- **Judge0 Submission Response Payload**:
  ```json
  {
    "token": "uuid_token_string",
    "stdout": "base64_stdout",
    "stderr": "base64_stderr",
    "compile_output": "base64_compile_output",
    "message": "null_or_string",
    "status": { "id": 3, "description": "Accepted" },
    "time": "0.012",
    "memory": 1024
  }
  ```

---

# SECTION 4: CANDIDATE FLOW ENTRY POINTS

### Flow 1: Admin Adds Candidate / Creates Candidate Invite
- **Controller Method**: `AdminController.createInvite` (`POST /api/v1/admin/invites`) in `backend/api/src/admin/admin.controller.ts`.
- **DTO**: `CreateInviteDto` in `backend/api/src/common/dto/admin.dto.ts`.

#### Code: `AdminController.createInvite`
```typescript
  @Post("invites")
  @HttpCode(HttpStatus.CREATED)
  async createInvite(@Body() dto: CreateInviteDto, @CurrentUser() staff: any) {
    return this.inviteService.createInvite(dto, staff.id);
  }
```

#### DTO: `CreateInviteDto`
```typescript
export class CreateInviteDto {
  @IsEmail()
  candidateEmail: string;

  @IsString()
  @IsNotEmpty()
  candidateName: string;

  @IsUUID()
  roleTemplateId: string;

  @IsOptional()
  @IsUUID()
  driveId?: string;

  @IsDateString()
  expiresAt: string;

  @IsOptional()
  @IsDateString()
  scheduledTime?: string;
}
```

#### Plain English Workflow Description (Flow 1):
1. The recruiter submits candidate name, email, role template ID, and expiration date via `POST /api/v1/admin/invites`.
2. The `InviteService` generates a unique secure invite token, creates an `Invite` record in PostgreSQL linked to the recruiter staff ID, and optionally triggers an email notification to the candidate.
3. The candidate receives the invite token URL (e.g. `https://assess.company.com/start?token=inv_123`) to access the assessment portal.

---

### Flow 2: Candidate Starts / Attends Assessment Test
- **Controller Method**: `SessionController.start` (`POST /api/v1/sessions/start`) and `SessionController.begin` (`POST /api/v1/sessions/:sessionId/begin`) in `backend/api/src/session/session.controller.ts`.
- **DTO**: `StartSessionDto` in `backend/api/src/common/dto/session.dto.ts`.

#### Code: `SessionController.start` & `SessionController.begin`
```typescript
  /**
   * POST /api/v1/sessions/start
   * Redeem invite token and create a new assessment session.
   */
  @Post("start")
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(InviteTokenRateLimitGuard)
  async start(@Body() dto: StartSessionDto): Promise<StartSessionResponse> {
    return this.sessionService.startSession(dto.inviteToken);
  }

  /**
   * POST /api/v1/sessions/:sessionId/begin
   * Begin the assessment session, transitioning NOT_STARTED to IN_PROGRESS.
   */
  @Post(":sessionId/begin")
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionOwnerGuard)
  async begin(
    @Param("sessionId") sessionId: string,
  ): Promise<StartSessionResponse> {
    return this.sessionService.beginSession(sessionId);
  }
```

#### DTO: `StartSessionDto`
```typescript
export class StartSessionDto {
  @IsString()
  @IsNotEmpty()
  inviteToken: string;
}
```

#### Plain English Workflow Description (Flow 2):
1. The candidate clicks "Start Test" with their invite token, calling `POST /api/v1/sessions/start`. The `SessionService` validates the token, creates or fetches a `Candidate` row, creates a `Session` record in `NOT_STARTED` status, and redeems the invite.
2. The frontend prompts the candidate to capture consent records (`TERMS`, `BIOMETRIC`, `SELFIE`) and upload a baseline selfie photo to MinIO.
3. The candidate clicks "Begin Test", calling `POST /api/v1/sessions/:sessionId/begin`, which sets the session status to `IN_PROGRESS`, sets the deadline timestamp (`deadlineAt`), and opens the test question interface.

---

# SECTION 5: DOCKER COMPOSE OVERVIEW

### File 1: `docker/docker-compose.dev.yml`

```yaml
version: "3.8"

# ─────────────────────────────────────────────────────────────────────────────
# CD-Recruit — Local Development Docker Compose
#
# Services:
#   postgres   — primary database (unchanged from Phase 1)
#   redis      — BullMQ job queues + session cache
#   keycloak   — OIDC identity provider (dev mode, pre-imported realm)
#   minio      — S3-compatible object storage (evidence clips, artefacts)
#
# Start all services:
#   docker compose -f docker/docker-compose.dev.yml up -d
#
# Stop all services:
#   docker compose -f docker/docker-compose.dev.yml down
# ─────────────────────────────────────────────────────────────────────────────

services:
  # ── Postgres ────────────────────────────────────────────────────────────────
  # DO NOT MODIFY — Phase 1 config; seeded data lives here.
  postgres:
    image: postgres:16-alpine
    container_name: cdrecruit_postgres_dev
    environment:
      POSTGRES_USER: cdrecruit
      POSTGRES_PASSWORD: cdrecruit123
      POSTGRES_DB: cdrecruit
    ports:
      - "5434:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./postgres-init:/docker-entrypoint-initdb.d
    restart: always
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U cdrecruit -d cdrecruit"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ── Redis ───────────────────────────────────────────────────────────────────
  # Used by BullMQ (job queues) and session-state caching.
  redis:
    image: redis:7-alpine
    container_name: cdrecruit_redis_dev
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    restart: always
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ── Keycloak ────────────────────────────────────────────────────────────────
  # OIDC identity provider running in dev mode (no TLS, embedded H2 DB for Keycloak metadata).
  # The cd-recruit realm is pre-imported from docker/keycloak/realm-export.json.
  keycloak:
    image: quay.io/keycloak/keycloak:24.0
    container_name: cdrecruit_keycloak_dev
    command: start-dev --import-realm
    environment:
      KEYCLOAK_ADMIN: admin
      KEYCLOAK_ADMIN_PASSWORD: admin
    ports:
      - "8080:8080"
    volumes:
      - ./keycloak:/opt/keycloak/data/import
    depends_on:
      postgres:
        condition: service_healthy
    restart: on-failure
    healthcheck:
      test:
        ["CMD-SHELL", "curl -fs http://localhost:8080/health/ready || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 10
      start_period: 60s

  # ── MinIO ───────────────────────────────────────────────────────────────────
  # S3-compatible object storage for evidence clips and general artefacts.
  # Console: http://localhost:9001  (minioadmin / minioadmin)
  # API:     http://localhost:9000
  minio:
    image: minio/minio:latest
    container_name: cdrecruit_minio_dev
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - minio_data:/data
    restart: always
    healthcheck:
      test:
        [
          "CMD-SHELL",
          "curl -fs http://localhost:9000/minio/health/live || exit 1",
        ]
      interval: 30s
      timeout: 10s
      retries: 5

  # ── MongoDB ─────────────────────────────────────────────────────────────────
  mongodb:
    image: mongo:6.0
    container_name: cdrecruit_mongodb_dev
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: adminpassword
    ports:
      - "27017:27017"
    volumes:
      - mongodb_data:/data/db
      - ./mongo-init:/docker-entrypoint-initdb.d
    restart: always
    healthcheck:
      test: echo 'db.runCommand("ping").ok' | mongosh localhost:27017/test --quiet
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
  redis_data:
  minio_data:
  mongodb_data:
```

### File 2: `docker/docker-compose.judge0.yml`

```yaml
version: "3.8"

# ─────────────────────────────────────────────────────────────────────────────
# CD-Recruit — Judge0 CE Container Stack (Server + Sandboxed Worker)
#
# Usage:
#   docker compose -f docker/docker-compose.dev.yml -f docker/docker-compose.judge0.yml up -d
# ─────────────────────────────────────────────────────────────────────────────

services:
  judge0-server:
    image: judge0/judge0:1.13.1
    container_name: cdrecruit_judge0_server
    privileged: true
    security_opt:
      - seccomp:unconfined
    ports:
      - "2358:2358"
    environment:
      - JUDGE0_KEY=
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - POSTGRES_HOST=postgres
      - POSTGRES_PORT=5432
      - POSTGRES_USER=cdrecruit
      - POSTGRES_PASSWORD=cdrecruit123
      - POSTGRES_DB=cdrecruit_judge0
      # Security Guardrail Limits
      - CPU_TIME_LIMIT=5.0
      - MAX_CPU_TIME_LIMIT=10.0
      - MEMORY_LIMIT=262144
      - MAX_MEMORY_LIMIT=524288
      - MAX_PROCESSES_AND_OR_THREADS=64
      - MAX_OUTPUT_SIZE=1024
      - ENABLE_PER_PROCESS_AND_THREAD_TIME_LIMIT=true
      - ENABLE_PER_PROCESS_AND_THREAD_MEMORY_LIMIT=true
    restart: always

  judge0-worker:
    image: judge0/judge0:1.13.1
    container_name: cdrecruit_judge0_worker
    command: ["./scripts/workers"]
    privileged: true
    security_opt:
      - seccomp:unconfined
    environment:
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - POSTGRES_HOST=postgres
      - POSTGRES_PORT=5432
      - POSTGRES_USER=cdrecruit
      - POSTGRES_PASSWORD=cdrecruit123
      - POSTGRES_DB=cdrecruit_judge0
      # Security Guardrail Limits
      - CPU_TIME_LIMIT=5.0
      - MAX_CPU_TIME_LIMIT=10.0
      - MEMORY_LIMIT=262144
      - MAX_MEMORY_LIMIT=524288
      - MAX_PROCESSES_AND_OR_THREADS=64
      - MAX_OUTPUT_SIZE=1024
      - ENABLE_PER_PROCESS_AND_THREAD_TIME_LIMIT=true
      - ENABLE_PER_PROCESS_AND_THREAD_MEMORY_LIMIT=true
    restart: always
```
