# CD-Recruit — Complete API Endpoints Catalog (Partner & Contracts)

> **Authoritative Reference:** This catalog is mirrored from [`docs/contracts/COMPLETE_API_ENDPOINTS_CATALOG.md`](../contracts/COMPLETE_API_ENDPOINTS_CATALOG.md).  
> For ATS-specific integration requirements, webhooks, and sample payloads, also see [`CD-Recruit_Partner_API_Integration_Requirements.md`](CD-Recruit_Partner_API_Integration_Requirements.md).

---

## 1. System Architecture & Base Specs

* **Backend Engine:** NestJS 11 (Node.js 20 LTS + TypeScript)
* **API Base URL:** `http://localhost:3001/api/v1`
* **Swagger UI Endpoint:** `http://localhost:3001/api-docs`
* **Database & ORM:** PostgreSQL 16 + Prisma ORM
* **NoSQL Database:** MongoDB 6.0
* **Storage Engine:** MinIO S3-Compatible Object Storage (`cd-recruit-general` and `cd-recruit-biometric` buckets)
* **Code Execution Engine:** Judge0 CE (Sandboxed execution in Linux `isolate` cgroups)
* **Authentication Schemes:**
  - **Staff API:** Native In-House Staff JWT (`crypto.scrypt` password hashing + HS256 tokens) with refresh token rotation.
  - **Candidate API:** Isolated candidate session token validated via `SessionOwnerGuard`.
  - **Partner ATS API:** API key header `x-partner-api-key` validated via `PartnerApiKeyGuard`.

---

## 2. Table of Contents

1. [Health & Infrastructure (`/health`)](#1-health--infrastructure-health)
2. [Staff Authentication (`/auth`)](#2-staff-authentication-auth)
3. [Candidate Session Lifecycle (`/sessions`)](#3-candidate-session-lifecycle-sessions)
4. [Proctoring Telemetry & Biometrics (`/proctoring`)](#4-proctoring-telemetry--biometrics-proctoring)
5. [Coding Challenges (`/coding`)](#5-coding-challenges-coding)
6. [SQL Assessment (`/sql`)](#6-sql-assessment-sql)
7. [NoSQL Assessment (`/nosql`)](#7-nosql-assessment-nosql)
8. [Multiple Choice Questions (`/mcq`)](#8-multiple-choice-questions-mcq)
9. [AI Prompt Engineering (`/ai-prompting`)](#9-ai-prompt-engineering-ai-prompting)
10. [Contextual Simulation Engine (`/sessions/:id/simulation/...`)](#10-contextual-simulation-engine-sessionsidsimulation)
11. [QA Test Scenarios (`/test-scenarios`)](#11-qa-test-scenarios-test-scenarios)
12. [Recruiter Admin & Session Review (`/admin`)](#12-recruiter-admin--session-review-admin)
13. [Hiring Drive Operations (`/admin/drives`)](#13-hiring-drive-operations-admindrives)
14. [Sample CSV Template Downloads (`/admin/drives/sample-csv`)](#14-sample-csv-template-downloads-admindrivessample-csv)
15. [Question Bank Management (`/admin/questions`)](#15-question-bank-management-adminquestions)
16. [Role Templates & Seniority Presets (`/admin/role-templates`)](#16-role-templates--seniority-presets-adminrole-templates)
17. [Platform Settings & Governance (`/admin/settings`)](#17-platform-settings--governance-adminsettings)
18. [Public Platform Settings (`/settings`)](#18-public-platform-settings-settings)
19. [Partner ATS Administration (`/admin/partners`)](#19-partner-ats-administration-adminpartners)
20. [Partner ATS Integration (`/partner/requisitions`, `/partner/candidates`)](#20-partner-ats-integration-partner)
21. [Judge0 Execution Webhooks (`/webhooks/judge0`)](#21-judge0-execution-webhooks-webhooksjudge0)

---

## 3. Detailed Endpoint Catalog

### 1. Health & Infrastructure (`/health`)
Implemented in `backend/api/src/health/health.controller.ts`.

| Method | Full Endpoint Path | Guard / Auth | Where Used | Purpose & Business Logic |
|---|---|---|---|---|
| `GET` | `/api/v1/health` | Public | Docker / K8s probes | **Liveness Probe:** Executes `SELECT 1` on PostgreSQL and verifies MinIO client connectivity. Returns `{ status: "ok" }` (HTTP 200) or 503 if unhealthy. |
| `GET` | `/api/v1/health/ready` | Public | Readiness probes | **Readiness Probe:** Asserts backend readiness before accepting live traffic. |

---

### 2. Staff Authentication (`/auth`)
Implemented in `backend/api/src/auth/auth.controller.ts`.

| Method | Full Endpoint Path | Guard / Auth | Request Body | Purpose & Business Logic |
|---|---|---|---|---|
| `POST` | `/api/v1/auth/login` | Public | `LoginDto` (`identifier`, `password`) | **Staff Login:** Verifies password using `crypto.scrypt` against the `Staff` table. Issues HS256 access token + 80-char refresh token (hashed with SHA-256 in DB). |
| `POST` | `/api/v1/auth/refresh` | Public | `RefreshTokenDto` (`refreshToken`) | **Refresh Token Rotation:** Hashes incoming refresh token with SHA-256, matches active record, asserts `expiresAt > NOW()`, issues new token pair, and rotates DB hash. |
| `POST` | `/api/v1/auth/logout` | Public | `RefreshTokenDto` (`refreshToken`) | **Staff Logout:** Clears `refreshTokenHash` and `refreshTokenExpiresAt` in PostgreSQL. |
| `GET` | `/api/v1/auth/me` | `JwtAuthGuard` | None | **Staff Profile:** Returns currently authenticated staff member details and permissions. |
| `GET` | `/api/v1/auth/dev-token` | `DevOnlyGuard` | None | **Dev Token Generator:** Issues a development JWT for testing. Strictly blocked in production (`NODE_ENV=production`). |

---

### 3. Candidate Session Lifecycle (`/sessions`)
Implemented in `backend/api/src/session/session.controller.ts` & `candidate.controller.ts`.

| Method | Full Endpoint Path | Guard / Auth | Request Body | Purpose & Business Logic |
|---|---|---|---|---|
| `POST` | `/api/v1/sessions/start` | Public | `StartSessionDto` (`inviteToken`) | **Start Assessment:** Validates candidate invite token, initializes assessment session, transitions status to `IN_PROGRESS`, and returns candidate JWT session token. |
| `POST` | `/api/v1/sessions/resume` | `SessionOwnerGuard` | `ResumeSessionDto` (`sessionId`, `tabId`) | **Resume Session:** Re-attaches to active session after reload, locks active `tabId`, and checks for multi-tab conflicts. |
| `POST` | `/api/v1/sessions/heartbeat` | `SessionOwnerGuard` | `HeartbeatDto` (`sessionId`, `tabId`) | **Session Heartbeat:** Updates `lastHeartbeatAt` timestamp and resets disconnect grace-window timers. |
| `POST` | `/api/v1/sessions/progress` | `SessionOwnerGuard` | `ProgressDto` | **Module Progress Sync:** Persists module progression status and remaining time budgets. |
| `GET` | `/api/v1/sessions/:id/questions` | `SessionOwnerGuard` | None | **Fetch Questions:** Returns sanitized assessment questions assigned to the candidate's drive. |
| `POST` | `/api/v1/sessions/:id/draft` | `SessionOwnerGuard` | `SaveDraftDto` | **Save Draft:** Stores intermediate unsubmitted draft responses without triggering grading. |
| `POST` | `/api/v1/sessions/:id/submit-response` | `SessionOwnerGuard` | `SubmitResponseDto` | **Submit Question Response:** Validates response payload, persists module response, and triggers synchronous or async evaluation. |
| `POST` | `/api/v1/sessions/:id/consent` | `SessionOwnerGuard` | `ConsentDto` | **Record Privacy & Biometric Consent:** Logs candidate agreement to proctoring rules before entering assessment. |
| `POST` | `/api/v1/sessions/:id/feedback` | `SessionOwnerGuard` | `FeedbackDto` | **Candidate Feedback:** Captures post-assessment candidate ratings and experience survey. |
| `POST` | `/api/v1/sessions/close` | `SessionOwnerGuard` | None | **Complete Assessment:** Transitions session status to `SUBMITTED`, finalizes correlation engine evaluation, and schedules scoring synthesis. |
| `GET` | `/api/v1/sessions/:id/summary` | `SessionOwnerGuard` | None | **Candidate Completion Summary:** Returns high-level confirmation receipt for completed candidate. |

---

### 4. Proctoring Telemetry & Biometrics (`/proctoring`)
Implemented in `backend/api/src/proctoring/proctoring.controller.ts`.

| Method | Full Endpoint Path | Guard / Auth | Request Body | Purpose & Business Logic |
|---|---|---|---|---|
| `POST` | `/api/v1/proctoring/consent` | `SessionOwnerGuard` | `ConsentDto` | **Proctoring Agreement:** Records candidate timestamped consent for webcam and audio telemetry. |
| `POST` | `/api/v1/proctoring/events` | `SessionOwnerGuard` | `LogEventDto` | **Telemetry Ingestion:** Batches and logs security events (`TAB_SWITCH`, `BLUR`, `PASTE`, `FULLSCREEN_EXIT`). Increments integrity anomaly counters. |
| `POST` | `/api/v1/proctoring/upload-url` | `SessionOwnerGuard` | `UploadUrlDto` | **Presigned S3 URL:** Generates presigned PUT URL for uploading evidence video clips or webcam snapshots to MinIO/S3 `cd-recruit-biometric` bucket. |
| `POST` | `/api/v1/proctoring/verify-face` | `SessionOwnerGuard` | `VerifyFaceDto` | **Biometric KYC:** Forwards candidate selfie and ID document to Python DeepFace microservice (`8001`) for facial verification. |

---

### 5. Coding Challenges (`/coding`)
Implemented in `backend/api/src/coding/coding.controller.ts`.

| Method | Full Endpoint Path | Guard / Auth | Request Body | Purpose & Business Logic |
|---|---|---|---|---|
| `POST` | `/api/v1/coding/run` | `SessionOwnerGuard` | `RunCodeDto` (`code`, `language`, `stdin`) | **Run Code:** Submits code to Judge0 CE sandbox (`2358`), executes against candidate custom input, and returns stdout/stderr/execution time. |
| `POST` | `/api/v1/coding/submit` | `SessionOwnerGuard` | `SubmitCodeDto` (`code`, `language`, `questionId`) | **Submit Code Solution:** Executes code against all visible and hidden test cases in Judge0, computes pass ratio, memory, and runtime metrics. |
| `GET` | `/api/v1/coding/languages` | Public | None | **Supported Languages:** Returns supported languages, compilers, and Judge0 language IDs. |

---

### 6. SQL Assessment (`/sql`)
Implemented in `backend/api/src/sql/sql.controller.ts`.

| Method | Full Endpoint Path | Guard / Auth | Request Body | Purpose & Business Logic |
|---|---|---|---|---|
| `POST` | `/api/v1/sql/execute` | `SessionOwnerGuard` | `ExecuteSqlDto` (`query`, `questionId`) | **Test SQL Query:** Executes query against isolated PostgreSQL sandbox schema (`SANDBOX_DB_URL`) with read-only guards and returns tabular rows. |
| `POST` | `/api/v1/sql/submit` | `SessionOwnerGuard` | `SubmitSqlDto` (`query`, `questionId`) | **Submit SQL Solution:** Compares query output against canonical expected output using `ResultComparatorService`. |

---

### 7. NoSQL Assessment (`/nosql`)
Implemented in `backend/api/src/modules/nosql/nosql.controller.ts`.

| Method | Full Endpoint Path | Guard / Auth | Request Body | Purpose & Business Logic |
|---|---|---|---|---|
| `POST` | `/api/v1/nosql/start` | `SessionOwnerGuard` | `StartNosqlDto` (`sessionId`, `questionId`) | **Initialize NoSQL Sandbox:** Creates ephemeral MongoDB database on port 27017, seeds initial collections, and returns collection schema previews. |
| `POST` | `/api/v1/nosql/run` | `SessionOwnerGuard` | `RunNosqlDto` (`operation`, `questionId`) | **Run MongoDB Query:** Executes candidate aggregation pipeline or filter against sandbox MongoDB and returns query results. |
| `POST` | `/api/v1/nosql/reset` | `SessionOwnerGuard` | `ResetNosqlDto` (`questionId`) | **Reset NoSQL Sandbox:** Re-seeds the MongoDB sandbox collection to clean initial state. |
| `POST` | `/api/v1/nosql/submit` | `SessionOwnerGuard` | `SubmitNosqlDto` (`operation`, `questionId`) | **Submit NoSQL Solution:** Validates operator against blocklist/whitelist, executes against test assertions, and records score. |

---

### 8. Multiple Choice Questions (`/mcq`)
Implemented in `backend/api/src/mcq/mcq.controller.ts`.

| Method | Full Endpoint Path | Guard / Auth | Request Body | Purpose & Business Logic |
|---|---|---|---|---|
| `GET` | `/api/v1/mcq/questions` | `SessionOwnerGuard` | Query: `sessionId` | **Fetch MCQ Batch:** Returns randomized MCQs with answer choices randomized to prevent positional memorization. |
| `POST` | `/api/v1/mcq/submit` | `SessionOwnerGuard` | `SubmitMcqDto` (`questionId`, `selectedIndex`) | **Submit MCQ Answer:** Validates candidate selection against correct option index and records points. |

---

### 9. AI Prompt Engineering (`/ai-prompting`)
Implemented in `backend/api/src/ai-prompting/ai-prompting.controller.ts`.

| Method | Full Endpoint Path | Guard / Auth | Request Body | Purpose & Business Logic |
|---|---|---|---|---|
| `POST` | `/api/v1/ai-prompting/execute` | `SessionOwnerGuard` | `ExecutePromptDto` (`prompt`, `context`) | **Test AI Prompt:** Submits candidate prompt to target LLM (Claude/Groq) with task context and streams response back to candidate. |
| `POST` | `/api/v1/ai-prompting/submit` | `SessionOwnerGuard` | `SubmitPromptDto` (`prompt`, `questionId`) | **Submit Prompt Solution:** Correlation Engine evaluates prompt efficiency, hallucination avoidance, and rubric score. |

---

### 10. Contextual Simulation Engine (`/sessions/:id/simulation/...`)
Implemented in `backend/api/src/simulation/simulation.controller.ts`.

| Method | Full Endpoint Path | Guard / Auth | Request Body | Purpose & Business Logic |
|---|---|---|---|---|
| `GET` | `/api/v1/sessions/:id/simulation/state` | `SessionOwnerGuard` | None | **Simulation State Machine:** Returns current simulation stage, scenario injects, and communication channel history. |
| `POST` | `/api/v1/sessions/:id/simulation/action` | `SessionOwnerGuard` | `SimulationActionDto` | **Simulation Decision/Action:** Logs candidate action (email reply, architecture adjustment, PR review) and advances scenario state. |
| `POST` | `/api/v1/sessions/:id/simulation/submit` | `SessionOwnerGuard` | `SubmitSimulationDto` | **Finalize Simulation:** Runs 4-part scoring rubric (Decision Quality, Technical Rigor, Communication, Time Efficiency). |

---

### 11. QA Test Scenarios (`/test-scenarios`)
Implemented in `backend/api/src/test-scenarios/test-scenarios.controller.ts`.

| Method | Full Endpoint Path | Guard / Auth | Request Body | Purpose & Business Logic |
|---|---|---|---|---|
| `POST` | `/api/v1/test-scenarios/submit` | `SessionOwnerGuard` | `SubmitTestScenarioDto` (`testCases`) | **Submit QA Test Suite:** Evaluates candidate-authored test cases (edge cases, preconditions, steps, severity) against requirement specifications. |

---

### 12. Recruiter Admin & Session Review (`/admin`)
Implemented in `backend/api/src/admin/admin.controller.ts`.

| Method | Full Endpoint Path | Guard / Auth | Request Body | Purpose & Business Logic |
|---|---|---|---|---|
| `GET` | `/api/v1/admin/sessions` | `JwtAuthGuard` + `RolesGuard` | Query: `page`, `pageSize`, `status` | **List Assessment Sessions:** Returns paginated candidate sessions with scores, flags, and completion status. |
| `GET` | `/api/v1/admin/sessions/:id` | `JwtAuthGuard` + `RolesGuard` | None | **Session Deep Dive:** Full audit view of candidate assessment, module breakdowns, code submissions, telemetry events, and proctoring video clips. |
| `POST` | `/api/v1/admin/sessions/:id/decision` | `JwtAuthGuard` + `RolesGuard` | `RecordDecisionDto` (`decision`, `notes`) | **Record Hiring Decision:** Records recruiter final evaluation (`ACCEPTED`, `REJECTED`, `NEEDS_FURTHER_REVIEW`). |
| `GET` | `/api/v1/admin/stats` | `JwtAuthGuard` + `RolesGuard` | None | **Dashboard Metrics:** Aggregate platform analytics (total candidates, pass rate, active drives, average completion time). |
| `GET` | `/api/v1/admin/audit-logs` | `JwtAuthGuard` + `RolesGuard` | Query: filters | **Compliance Audit Log:** Immutable event log of recruiter actions, key revocations, and configuration changes. |

---

### 13. Hiring Drive Operations (`/admin/drives`)
Implemented in `backend/api/src/drive/drive.controller.ts`.

| Method | Full Endpoint Path | Guard / Auth | Request Body | Purpose & Business Logic |
|---|---|---|---|---|
| `GET` | `/api/v1/admin/drives` | `JwtAuthGuard` + `RolesGuard` | Query: `status`, `department` | **List Drives:** Returns all recruitment drives with candidate counts and schedules. |
| `POST` | `/api/v1/admin/drives` | `JwtAuthGuard` + `RolesGuard` | `CreateDriveDto` | **Create Drive:** Initializes drive with role templates, target modules, time budgets, and candidate rosters. |
| `GET` | `/api/v1/admin/drives/:id` | `JwtAuthGuard` + `RolesGuard` | None | **Get Drive Detail:** Returns drive configuration, candidate invites, and aggregated performance stats. |
| `PATCH` | `/api/v1/admin/drives/:id` | `JwtAuthGuard` + `RolesGuard` | `UpdateDriveDto` | **Update Drive:** Modifies drive schedule, title, or status (`ACTIVE`, `PAUSED`, `COMPLETED`). |
| `DELETE` | `/api/v1/admin/drives/:id` | `JwtAuthGuard` + `RolesGuard` | None | **Cascade Delete Drive:** Completely removes drive and associated candidates, invites, reports, and response records. |
| `POST` | `/api/v1/admin/drives/:id/candidates` | `JwtAuthGuard` + `RolesGuard` | `AddCandidatesDto` | **Add Candidates:** Adds candidates to drive and generates unique cryptographic invite tokens. |
| `POST` | `/api/v1/admin/drives/:id/import-csv` | `JwtAuthGuard` + `RolesGuard` | Multipart CSV File | **Bulk Import Candidates:** Parses candidate CSV roster and bulk-inserts invites. |

---

### 14. Sample CSV Template Downloads (`/admin/drives/sample-csv`)
Implemented in `backend/api/src/drive/sample-csv.controller.ts`.

| Method | Full Endpoint Path | Guard / Auth | Purpose & Business Logic |
|---|---|---|---|
| `GET` | `/api/v1/admin/drives/sample-csv/candidates` | `JwtAuthGuard` | **Download Candidate CSV:** Streams canonical CSV template with required headers (`firstName,lastName,email,department,tier`). |
| `GET` | `/api/v1/admin/drives/sample-csv/questions` | `JwtAuthGuard` | **Download Questions CSV:** Streams question import template with module types, difficulties, and schema fields. |

---

### 15. Question Bank Management (`/admin/questions`)
Implemented in `backend/api/src/question/question.controller.ts`.

| Method | Full Endpoint Path | Guard / Auth | Request Body | Purpose & Business Logic |
|---|---|---|---|---|
| `GET` | `/api/v1/admin/questions` | `JwtAuthGuard` + `RolesGuard` | Query filters | **List Questions:** Paginated search by module type, difficulty, department, and tags. |
| `POST` | `/api/v1/admin/questions` | `JwtAuthGuard` + `RolesGuard` | `CreateQuestionDto` | **Create Question:** Inserts new question with validator definitions and test suites. |
| `GET` | `/api/v1/admin/questions/:id` | `JwtAuthGuard` + `RolesGuard` | None | **Get Question:** Retrieves full question specification including hidden test suites. |
| `PATCH` | `/api/v1/admin/questions/:id` | `JwtAuthGuard` + `RolesGuard` | `UpdateQuestionDto` | **Update Question:** Modifies title, content, scoring rubrics, or test cases. |
| `DELETE` | `/api/v1/admin/questions/:id` | `JwtAuthGuard` + `RolesGuard` | None | **Delete Question:** Removes question from bank (guarded against active drives). |

---

### 16. Role Templates & Seniority Presets (`/admin/role-templates`)
Implemented in `backend/api/src/role-template/role-template.controller.ts`.

| Method | Full Endpoint Path | Guard / Auth | Purpose & Business Logic |
|---|---|---|---|
| `GET` | `/api/v1/admin/role-templates` | `JwtAuthGuard` | **List Templates:** Filter by department, level, category, or active status. |
| `GET` | `/api/v1/admin/role-templates/active` | `JwtAuthGuard` | **Active Template:** Finds active template matching department and experience tier. |
| `GET` | `/api/v1/admin/role-templates/by-department/:department` | `JwtAuthGuard` | **Department Presets:** Returns all 4 seniority tiers for a given department. |
| `GET` | `/api/v1/admin/role-templates/:id` | `JwtAuthGuard` | **Template Detail:** Returns module configuration, question distributions, and time limits. |
| `POST` | `/api/v1/admin/role-templates` | `JwtAuthGuard` + `ROLE_TEMPLATE_EDIT` | **Create Template:** Defines new role preset with module weights and time budgets. |
| `PUT` / `PATCH` | `/api/v1/admin/role-templates/:id` | `JwtAuthGuard` + `ROLE_TEMPLATE_EDIT` | **Update Template:** Edits module parameters and difficulty distributions. |
| `POST` | `/api/v1/admin/role-templates/:id/publish-version` | `JwtAuthGuard` + `ROLE_TEMPLATE_EDIT` | **Publish Version:** Increments template version number without breaking existing drives. |
| `POST` | `/api/v1/admin/role-templates/:id/activate` | `JwtAuthGuard` + `ROLE_TEMPLATE_EDIT` | **Activate Template:** Sets template as active default for its tier. |
| `DELETE` | `/api/v1/admin/role-templates/:id` | `JwtAuthGuard` + `ROLE_TEMPLATE_EDIT` | **Delete Template:** Soft-deletes template preset. |

---

### 17. Platform Settings & Governance (`/admin/settings`)
Implemented in `backend/api/src/settings/settings.controller.ts`.

| Method | Full Endpoint Path | Guard / Auth | Request Body | Purpose & Business Logic |
|---|---|---|---|---|
| `GET` | `/api/v1/admin/settings` | `JwtAuthGuard` + `RolesGuard` | None | **Get System Settings:** Returns global proctoring thresholds, AI grading keys, and timing rules. |
| `PATCH` | `/api/v1/admin/settings` | `JwtAuthGuard` + `RolesGuard` | `UpdateSettingsDto` | **Update System Settings:** Modifies global retention policies, anomaly score weights, and module settings. |

---

### 18. Public Platform Settings (`/settings`)
Implemented in `backend/api/src/settings/public-settings.controller.ts`.

| Method | Full Endpoint Path | Guard / Auth | Purpose & Business Logic |
|---|---|---|---|
| `GET` | `/api/v1/settings/public-proctoring` | Public | **Public Proctoring Config:** Returns candidate-safe telemetry thresholds and KYC requirements. |
| `GET` | `/api/v1/settings/time-matrix` | Public | **Time Matrix Config:** Returns standard module time allocations per seniority tier. |
| `GET` | `/api/v1/settings/seniority-ratios` | Public | **Seniority Ratios:** Returns module balance ratios across Fresher, L1, L2, and L3. |

---

### 19. Partner ATS Administration (`/admin/partners`)
Implemented in `backend/api/src/partner/partner-admin.controller.ts`.

| Method | Full Endpoint Path | Guard / Auth | Request Body | Purpose & Business Logic |
|---|---|---|---|---|
| `GET` | `/api/v1/admin/partners` | `JwtAuthGuard` + `RolesGuard` | None | **List Partners:** Returns integrated ATS partner accounts, active API key status, and webhook URLs. |
| `POST` | `/api/v1/admin/partners` | `JwtAuthGuard` + `RolesGuard` | `CreatePartnerDto` | **Register Partner:** Creates partner account and generates initial cryptographic API key. |
| `POST` | `/api/v1/admin/partners/:id/rotate-key` | `JwtAuthGuard` + `RolesGuard` | None | **Rotate API Key:** Revokes existing key, issues new key, and updates secret hash. |
| `PATCH` | `/api/v1/admin/partners/:id` | `JwtAuthGuard` + `RolesGuard` | `UpdatePartnerDto` | **Update Partner:** Updates callback URL, rate limits, or partner status. |
| `POST` | `/api/v1/admin/partners/:id/revoke` | `JwtAuthGuard` + `RolesGuard` | None | **Revoke Partner Access:** Immediately invalidates active API keys without deleting history. |
| `DELETE` | `/api/v1/admin/partners/:id` | `JwtAuthGuard` + `RolesGuard` | None | **Delete Partner:** Removes partner record and associated API keys. |

---

### 20. Partner ATS Integration (`/partner`)
Implemented in `partner-requisitions.controller.ts` & `partner-candidates.controller.ts`.

| Method | Full Endpoint Path | Guard / Auth | Request Body | Purpose & Business Logic |
|---|---|---|---|---|
| `POST` | `/api/v1/partner/requisitions` | `PartnerApiKeyGuard` | `CreateRequisitionDto` | **Sync ATS Requisition:** Maps external ATS job opening to CD-Recruit drive and role template. |
| `GET` | `/api/v1/partner/requisitions/:id` | `PartnerApiKeyGuard` | None | **Requisition Status:** Returns candidate volume, completed assessments, and drive status. |
| `POST` | `/api/v1/partner/candidates` | `PartnerApiKeyGuard` | `CreateCandidateDto` | **Invite ATS Candidate:** Adds candidate from ATS pipeline and dispatches assessment invite. |
| `GET` | `/api/v1/partner/candidates/:id/status` | `PartnerApiKeyGuard` | None | **Candidate Assessment Status:** Returns current stage, completion score, and proctoring verdict. |

---

### 21. Judge0 Execution Webhooks (`/webhooks/judge0`)
Implemented in `backend/api/src/integrations/judge0/judge0-webhook.controller.ts`.

| Method | Full Endpoint Path | Guard / Auth | Purpose & Business Logic |
|---|---|---|---|
| `ALL` | `/api/v1/webhooks/judge0` | `Judge0WebhookGuard` | **Async Execution Callback:** Receives execution completion callback from Judge0 workers. Uses atomic Lua script (`JUDGE0_ACCUMULATE_AND_LOCK_LUA`) in Redis to accumulate test case outputs and notify awaiting candidate promises. |
