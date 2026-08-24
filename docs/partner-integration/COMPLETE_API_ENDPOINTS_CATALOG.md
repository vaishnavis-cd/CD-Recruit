# CD-Recruit — Complete API Endpoints Catalog

This document serves as the authoritative technical catalog of **all API endpoints** implemented in the CD-Recruit proctoring and assessment backend (`codebase/backend/api`).

---

## 1. System Architecture & Base Specs

* **Backend Engine:** NestJS 10 (Node.js + TypeScript)
* **API Base URL:** `http://localhost:3001/api/v1`
* **Swagger UI Endpoint:** `http://localhost:3001/api-docs`
* **Database & ORM:** PostgreSQL + Prisma ORM
* **Storage Engine:** MinIO S3 Object Storage (`clips` bucket for proctoring video clips)
* **Code Execution Engine:** Judge0 CE API (Sandboxed execution in Linux `cgroups` & `namespaces`)

---

## 2. Table of Contents

1. [Health & Infrastructure (`/health`)](#1-health--infrastructure-health)
2. [Authentication & Dev Utilities (`/auth`)](#2-authentication--dev-utilities-auth)
3. [Candidate Session Lifecycle (`/sessions`)](#3-candidate-session-lifecycle-sessions)
4. [Proctoring Telemetry & Evidence Streaming (`/proctoring`)](#4-proctoring-telemetry--evidence-streaming-proctoring)
5. [Coding Challenges (`/coding`)](#5-coding-challenges-coding)
6. [SQL Assessment (`/sql`)](#6-sql-assessment-sql)
7. [Multiple Choice Questions (`/mcq`)](#7-multiple-choice-questions-mcq)
8. [AI Prompt Engineering (`/ai-prompting`)](#8-ai-prompt-engineering-ai-prompting)
9. [Contextual Simulation Engine (`/sessions/:id/simulation/...`)](#9-contextual-simulation-engine-sessionsidsimulation)
10. [Admin & Session Review (`/admin`)](#10-admin--session-review-admin)
11. [Hiring Drive Management (`/admin/drives`)](#11-hiring-drive-management-admindrives)
12. [Sample CSV Template Downloads (`/admin/drives/sample-csv`)](#12-sample-csv-template-downloads-admindrivessample-csv)
13. [Question Bank Management (`/admin/questions`)](#13-question-bank-management-adminquestions)
14. [Platform Settings & Audit Logs (`/admin/settings`)](#14-platform-settings--audit-logs-adminsettings)
15. [Partner ATS Integration (`/partner`)](#15-partner-ats-integration-partner)

---

## 3. Detailed Endpoint Catalog

### 1. Health & Infrastructure (`/health`)
Implemented in `backend/api/src/health/health.controller.ts`.

| Method | Full Endpoint Path | Guard / Auth | Where Used | Purpose & Business Logic |
|---|---|---|---|---|
| `GET` | `/api/v1/health` | Public | Docker / K8s probes | **Health Check:** Asserts database connection (`SELECT 1`) and MinIO health. Returns HTTP 200 `{ status: "ok" }` or 533 Service Unavailable if unhealthy. |
| `GET` | `/api/v1/health/ready` | Public | Readiness probes | **Readiness Probe:** Asserts backend readiness before accepting live traffic. |

---

### 2. Authentication & Dev Utilities (`/auth`)
Implemented in `backend/api/src/auth/auth.controller.ts`.

| Method | Full Endpoint Path | Guard / Auth | Where Used | Purpose & Business Logic |
|---|---|---|---|---|
| `GET` | `/api/v1/auth/dev-token` | Dev Guard | Dev panel, Postman, Swagger | **Issue Dev JWT Token:** Generates signed JWT for testing (`RECRUITER` or `ADMIN`). **Disabled in production** (`NODE_ENV=production` returns 403). |

---

### 3. Candidate Session Lifecycle (`/sessions`)
Implemented in `backend/api/src/session/session.controller.ts` & `candidate.controller.ts`.

| Method | Full Endpoint Path | Guard / Auth | Where Used | Purpose & Business Logic |
|---|---|---|---|---|
| `POST` | `/api/v1/sessions/start` | `InviteTokenRateLimitGuard` | `candidate-web` (`InviteResolver.tsx`) | **Start Assessment Session:** Redeems candidate invite token, transitions session (`NOT_STARTED` $\rightarrow$ `IN_PROGRESS`), sets `startedAt` & `deadlineAt`, and returns question list. |
| `POST` | `/api/v1/sessions/:sessionId/begin` | `SessionOwnerGuard` | `candidate-web` (`TutorialScreen.tsx`) | **Begin Assessment Timer:** Called after tutorial completion to start candidate timer. |
| `POST` | `/api/v1/sessions/:sessionId/selfie` | `SessionOwnerGuard` | `candidate-web` (`ConsentScreen.tsx` step 4) | **Upload Baseline Selfie:** Stores candidate setup JPEG selfie for facial verification. |
| `POST` | `/api/v1/sessions/:sessionId/consent` | `SessionOwnerGuard` | `candidate-web` (`ConsentScreen.tsx`) | **Record DPDP Consent:** Writes consent record (`TERMS`, `BIOMETRIC`, `SELFIE`, `AUDIO`) with IP address to comply with DPDP Act §6. |
| `POST` | `/api/v1/sessions/:sessionId/heartbeat` | `SessionOwnerGuard` | `candidate-web` (`ModuleShell.tsx` hook, 15s) | **Tab Heartbeat & Single-Tab Guard:** Sent every 15s. Returns `409 SECOND_TAB_DETECTED` if a second tab is active. |
| `POST` | `/api/v1/sessions/:sessionId/resume` | `SessionOwnerGuard` | `candidate-web` (`SessionRouter.tsx`) | **Resume Disconnected Session:** Reconnects candidate if disconnect window is $< 5\text{ min}$ and `disconnectCount < 3`. |
| `GET` | `/api/v1/sessions/:sessionId/questions/:questionId` | `SessionOwnerGuard` | `candidate-web` (All Modules) | **Fetch Question Details:** Serves question content. Sanitizes hidden test cases, correct MCQ options, and rubrics. |
| `GET` | `/api/v1/sessions/:sessionId/progress` | `SessionOwnerGuard` | `candidate-web` (`QuestionPalette.tsx`) | **Get Session Progress:** Returns completion status for all assigned questions to color-code question grid. |
| `POST` | `/api/v1/sessions/:sessionId/close` | `SessionOwnerGuard` | `candidate-web` (`PreSubmitReview.tsx` / `SyncingScreen.tsx`) | **Close Assessment Session:** Marks session `SUBMITTED`, sets `submittedAt = now()`, and queues session for scoring. |

---

### 4. Proctoring Telemetry & Evidence Streaming (`/proctoring`)
Implemented in `backend/api/src/proctoring/proctoring.controller.ts`.

| Method | Full Endpoint Path | Guard / Auth | Where Used | Purpose & Business Logic |
|---|---|---|---|---|
| `POST` | `/api/v1/proctoring/events` | `SessionOwnerGuard` | `candidate-web` (`ProctoringModule.ts`) | **Report Proctoring Telemetry:** Ingests integrity events (`TAB_SWITCH`, `PASTE`, `GAZE_DEVIATION`, `MULTIPLE_FACES`, `FACE_NOT_VISIBLE`). |
| `POST` | `/api/v1/proctoring/session/:sessionId/upload-evidence` | Multipart | `candidate-web` (`ProctoringModule.ts`) | **Upload Evidence Video Clip:** Multipart upload sending WebM video clips to MinIO (`clips` bucket) and linking to `ProctoringEvent`. |
| `GET` | `/api/v1/proctoring/session/:sessionId` | Recruiter Auth | `admin-web` (`SessionDetail.tsx`) | **Get Session Proctoring Events:** Fetches all proctoring logs for a candidate with presigned GET video URLs. |
| `GET` | `/api/v1/proctoring/session/:sessionId/summary` | Internal API | Correlation Engine | **Get Event Count Summary:** Aggregates event counts per violation category for AI scoring. |
| `GET` | `/api/v1/proctoring/stream/:bucket/*` | Recruiter Auth | `admin-web` Video Player | **Stream Video Evidence:** Streams evidence WebM video clips from MinIO with range requests support. |

---

### 5. Coding Challenges (`/coding`)
Implemented in `backend/api/src/coding/coding.controller.ts`.

| Method | Full Endpoint Path | Guard / Auth | Where Used | Purpose & Business Logic |
|---|---|---|---|---|
| `POST` | `/api/v1/coding/run` | `SessionOwnerGuard` | `candidate-web` (`CodingWorkspace.tsx`) | **Run Code:** Submits candidate code to Judge0 API against visible test cases. Returns stdout, stderr, compile output, and pass/fail state. |
| `GET` | `/api/v1/coding/execution/:id` | `SessionOwnerGuard` | `candidate-web` polling hook | **Poll Execution Result:** Polled if code execution takes $> 8\text{ s}$ (returns `PENDING` initially). |
| `POST` | `/api/v1/coding/submit` | `SessionOwnerGuard` | `candidate-web` | **Submit Code Solution:** Saves final submission (`isDraft = false`) and executes code against visible + hidden test cases via Judge0. |
| `POST` | `/api/v1/coding/draft` | `SessionOwnerGuard` | `candidate-web` (autosave) | **Save Code Draft:** Debounced autosave (10-15s) updating candidate draft code without running tests. |

---

### 6. SQL Assessment (`/sql`)
Implemented in `backend/api/src/sql/sql.controller.ts`.

| Method | Full Endpoint Path | Guard / Auth | Where Used | Purpose & Business Logic |
|---|---|---|---|---|
| `POST` | `/api/v1/sql/run` | `SessionOwnerGuard` | `candidate-web` (`SQLModule.tsx`) | **Run SQL Query:** Validates SQL syntax against question schema and seed data. |
| `POST` | `/api/v1/sql/submit` | `SessionOwnerGuard` | `candidate-web` | **Submit SQL Answer:** Saves final SQL query for backend execution scoring. |
| `POST` | `/api/v1/sql/draft` | `SessionOwnerGuard` | `candidate-web` | **Draft SQL Query:** Autosaves SQL query text. |

---

### 7. Multiple Choice Questions (`/mcq`)
Implemented in `backend/api/src/mcq/mcq.controller.ts`.

| Method | Full Endpoint Path | Guard / Auth | Where Used | Purpose & Business Logic |
|---|---|---|---|---|
| `POST` | `/api/v1/mcq/submit` | `SessionOwnerGuard` | `candidate-web` (`MCQModule.tsx`) | **Submit MCQ Option:** Submits chosen option IDs for single-choice or multi-select questions. |
| `POST` | `/api/v1/mcq/draft` | `SessionOwnerGuard` | `candidate-web` | **Autosave MCQ Option:** Instantly saves option choice on candidate selection. |

---

### 8. AI Prompt Engineering (`/ai-prompting`)
Implemented in `backend/api/src/ai-prompting/ai-prompting.controller.ts`.

| Method | Full Endpoint Path | Guard / Auth | Where Used | Purpose & Business Logic |
|---|---|---|---|---|
| `POST` | `/api/v1/ai-prompting/run` | `SessionOwnerGuard` | `candidate-web` (`PromptingModule.tsx`) | **Test AI Prompt:** Sends candidate prompt to backend AI model. Returns response and flags verbatim overlap if $\ge 65\%$ match with generic template. |
| `POST` | `/api/v1/ai-prompting/submit` | `SessionOwnerGuard` | `candidate-web` | **Submit AI Prompt:** Saves final candidate prompt and output for rubric scoring. |

---

### 9. Contextual Simulation Engine (`/sessions/:id/simulation/...`)
Implemented in `backend/api/src/simulation/simulation.controller.ts`.

| Method | Full Endpoint Path | Guard / Auth | Where Used | Purpose & Business Logic |
|---|---|---|---|---|
| `GET` | `/api/v1/sessions/:id/simulation/scenario` | Public / Candidate | `candidate-web` (`ContextualModule.tsx`) | **Get Simulation Config:** Returns scenario metadata, role profile, and triggers. |
| `POST` | `/api/v1/sessions/:id/simulation/initial-say` | `SessionOwnerGuard` | `candidate-web` | **Save Initial Say:** Stores candidate strategy declaration before scenario triggers fire. |
| `POST` | `/api/v1/sessions/:id/simulation/telemetry` | `SessionOwnerGuard` | `candidate-web` | **Record Simulation Action:** Logs candidate file edits, inspect clicks, and workspace interactions. |
| `POST` | `/api/v1/sessions/:id/simulation/run-code` | `SessionOwnerGuard` | In-fiction terminal | **Execute Simulation Script:** Runs candidate script inside simulation environment. |
| `GET` | `/api/v1/sessions/:id/simulation/inbox` | `SessionOwnerGuard` | `candidate-web` (`InFictionInbox.tsx`) | **Get Simulation Messages:** Serves incoming emails/Slack messages in scenario. |
| `POST` | `/api/v1/sessions/:id/simulation/inbox/read` | `SessionOwnerGuard` | `candidate-web` | **Mark Message Read:** Updates message read status. |
| `POST` | `/api/v1/sessions/:id/simulation/email-reply` | `SessionOwnerGuard` | `candidate-web` (`InFictionThread.tsx`) | **Send Email Reply:** Saves candidate's email response to scenario stakeholder. |
| `GET` | `/api/v1/sessions/:sessionId/simulation/triggered-messages` | Orchestrator | `candidate-web` | **Poll Triggered Messages:** Returns real-time messages spawned by candidate decisions. |
| `POST` | `/api/v1/sessions/:id/simulation/start` | `SessionOwnerGuard` | `candidate-web` | **Start Scenario:** Initializes scenario timeline and message dispatch queue. |
| `GET` | `/api/v1/sessions/:id/simulation/current` | `SessionOwnerGuard` | `candidate-web` | **Get Active Stage:** Returns current simulation stage. |
| `POST` | `/api/v1/sessions/:id/simulation/state` | `SessionOwnerGuard` | `candidate-web` | **Log Stage State:** Records stage transitions. |
| `POST` | `/api/v1/sessions/:id/simulation/submit` | `SessionOwnerGuard` | `candidate-web` | **Submit Scenario:** Completes simulation module. |
| `POST` | `/api/v1/sessions/:id/simulation/execute` | `SessionOwnerGuard` | In-fiction CLI | **Terminal Execution:** Runs CLI commands (`git log`, `pytest`, `npm test`). |
| `POST` | `/api/v1/sessions/:id/simulation/skip` | `SessionOwnerGuard` | `candidate-web` | **Skip Stage:** Advances scenario on soft timeouts. |
| `GET` | `/api/v1/sessions/:id/simulation/summary` | `SessionOwnerGuard` | Correlation Engine | **Get Scenario Summary:** Aggregates action logs and Say-Do consistency scores. |
| `GET` | `/api/v1/sessions/:id/simulation/timeline` | `JwtAuthGuard`, `RolesGuard` | `admin-web` (`CandidateReview.tsx`) | **Recruiter Timeline View:** Returns chronological action timeline during scenario. |
| `GET` | `/api/v1/sessions/:id/simulation/logs` | `JwtAuthGuard`, `RolesGuard` | `admin-web` | **Get Session Logs:** Provides full audit trail of simulation actions. |

---

### 10. Admin & Session Review (`/admin`)
Implemented in `backend/api/src/admin/admin.controller.ts`.

| Method | Full Endpoint Path | Guard / Auth | Where Used | Purpose & Business Logic |
|---|---|---|---|---|
| `GET` | `/api/v1/admin/dashboard/stats` | Recruiter / Admin | `admin-web` Dashboard | **Get Dashboard Stats:** Computes drive progress, pass rates, active sessions, and proctoring summaries. |
| `GET` | `/api/v1/admin/dashboard/action-queue` | Recruiter / Admin | `admin-web` Dashboard | **Review Action Queue:** Lists completed candidate sessions requiring human review. |
| `GET` | `/api/v1/admin/dashboard/export` | Recruiter / Admin | `admin-web` | **Export Dashboard Metrics:** Exports dashboard KPI summaries. |
| `GET` | `/api/v1/admin/sessions` (and `/results`) | Recruiter / Admin | `admin-web` Candidates Table | **List Candidate Sessions:** Paginated list/filter of candidate sessions. |
| `GET` | `/api/v1/admin/sessions/:sessionId` | Recruiter / Admin | `admin-web` Candidate Review | **Get Session Detail:** Returns full candidate dossier (answers, scores, proctoring video links, AI confidence). |
| `POST` | `/api/v1/admin/sessions/:sessionId/decision` | Recruiter / Admin | `admin-web` Review Header | **Record Hiring Decision:** Saves `ADVANCE` or `REJECT` decision with reviewer notes. |
| `GET` | `/api/v1/admin/sessions/:sessionId/events` | Recruiter / Admin | `admin-web` Timeline Tab | **Get Session Events:** Chronological proctoring event log. |
| `GET` | `/api/v1/admin/sessions/:sessionId/integrity-flags` | Recruiter / Admin | `admin-web` Integrity Tab | **Get Integrity Flags:** Categorized proctoring flags with evidence video clip links. |
| `GET` | `/api/v1/admin/role-templates` | Recruiter / Admin | `admin-web` Create Drive | **List Role Templates:** Serves configured job role templates and module configurations. |
| `POST` | `/api/v1/admin/invites` | Recruiter / Admin | `admin-web` Invites Page | **Create Candidate Invite:** Generates assessment invite token for candidate email. |
| `GET` | `/api/v1/admin/invites` | Recruiter / Admin | `admin-web` Invites Table | **List Invites:** Returns status of sent invites (`PENDING`, `STARTED`, `EXPIRED`, `REVOKED`). |
| `POST` | `/api/v1/admin/invites/:inviteId/revoke` | Recruiter / Admin | `admin-web` | **Revoke Invite:** Immediately invalidates an unredeemed invite link. |
| `POST` | `/api/v1/admin/invites/:inviteId/extend` | Recruiter / Admin | `admin-web` | **Extend Invite Expiry:** Updates `expiresAt` timestamp. |
| `POST` | `/api/v1/admin/invites/:inviteId/regenerate` | Recruiter / Admin | `admin-web` | **Regenerate Token:** Re-issues invite JWT link for delivery issues. |
| `POST` | `/api/v1/admin/invites/bulk-revoke` | Recruiter / Admin | `admin-web` | **Bulk Revoke:** Revokes array of invite IDs. |
| `POST` | `/api/v1/admin/invites/bulk-resend` | Recruiter / Admin | `admin-web` | **Bulk Resend:** Re-queues invite email notifications. |
| `DELETE` | `/api/v1/admin/invites/:inviteId` | Recruiter / Admin | `admin-web` | **Delete Invite:** Deletes invite record from database. |
| `POST` | `/api/v1/admin/invites/bulk-delete` | Recruiter / Admin | `admin-web` | **Bulk Delete:** Deletes multiple invite records. |
| `POST` | `/api/v1/admin/sessions/compare` | Recruiter / Admin | `admin-web` Compare Drawer | **Compare Candidates:** Returns side-by-side score & say-do comparison matrix for selected sessions. |
| `GET` | `/api/v1/admin/drives/:driveId/export` | Recruiter / Admin | `admin-web` Drive List | **Export Drive Results:** Downloads Excel/CSV report of candidate scores and proctoring metrics. |

---

### 11. Hiring Drive Management (`/admin/drives`)
Implemented in `backend/api/src/drive/drive.controller.ts`.

| Method | Full Endpoint Path | Guard / Auth | Where Used | Purpose & Business Logic |
|---|---|---|---|---|
| `POST` | `/api/v1/admin/drives` | Recruiter / Admin | `admin-web` (`CreateDriveModal.tsx`) | **Create Recruitment Drive:** Configures recruitment drive with start/end date, role template, and questions. |
| `GET` | `/api/v1/admin/drives` | Recruiter / Admin | `admin-web` Drives List | **List Recruitment Drives:** Paginated list of drives with candidate completion progress counters. |
| `GET` | `/api/v1/admin/drives/:driveId` | Recruiter / Admin | `admin-web` Drive Detail | **Get Drive Detail:** Serves drive metadata, assigned questions, and candidate list. |
| `PATCH` | `/api/v1/admin/drives/:driveId` | Recruiter / Admin | `admin-web` Edit Drive | **Update Drive:** Edits title, schedule, or duration. |
| `POST` | `/api/v1/admin/drives/:driveId/duplicate` | Recruiter / Admin | `admin-web` | **Duplicate Drive:** Clones drive structure and questions for a new batch. |
| `POST` | `/api/v1/admin/drives/:driveId/close` | Recruiter / Admin | `admin-web` | **Close Drive Early:** Force-closes drive, setting non-started candidates to `EXPIRED`. |
| `DELETE` | `/api/v1/admin/drives/:driveId` | Recruiter / Admin | `admin-web` | **Delete Drive:** Deletes recruitment drive record. |
| `PATCH` / `PUT` | `/api/v1/admin/drives/:driveId/questions` | Recruiter / Admin | `admin-web` Question Selector | **Save Drive Questions:** Assigns questions from question bank to the drive. |
| `POST` | `/api/v1/admin/drives/:driveId/candidates/bulk` | Recruiter / Admin | `admin-web` CSV Import | **Bulk Add Candidates:** Import candidate list from CSV and link to drive. |
| `POST` | `/api/v1/admin/drives/:driveId/generate-links` | Recruiter / Admin | `admin-web` | **Generate Assessment Links:** Creates JWT invite tokens for imported candidates in batch. |
| `DELETE` | `/api/v1/admin/drives/:driveId/candidates/:candidateId` | Recruiter / Admin | `admin-web` | **Remove Candidate:** Unlinks candidate from drive. |

---

### 12. Sample CSV Template Downloads (`/admin/drives/sample-csv`)
Implemented in `backend/api/src/drive/sample-csv.controller.ts`.

| Method | Full Endpoint Path | Guard / Auth | Where Used | Purpose & Business Logic |
|---|---|---|---|---|
| `GET` | `/api/v1/admin/drives/sample-csv/questions` | Recruiter / Admin | `admin-web` Bulk Question Modal | **Download Question CSV Template:** Returns pre-formatted CSV template file (`sample_questions.csv`). |
| `GET` | `/api/v1/admin/drives/sample-csv/candidates` | Recruiter / Admin | `admin-web` Bulk Candidate Modal | **Download Candidate CSV Template:** Returns pre-formatted CSV template file (`sample_candidates.csv`). |

---

### 13. Question Bank Operations (`/admin/questions`)
Implemented in `backend/api/src/question/question.controller.ts`.

| Method | Full Endpoint Path | Guard / Auth | Where Used | Purpose & Business Logic |
|---|---|---|---|---|
| `GET` | `/api/v1/admin/questions` | Recruiter / Admin | `admin-web` Question Bank | **List Question Bank:** Filters questions by `moduleType`, `difficulty`, `language`, or tags. |
| `POST` | `/api/v1/admin/questions` | Recruiter / Admin | `admin-web` Question Creator | **Create Question:** Creates question definition (MCQ options, SQL schema, Coding test cases). |
| `GET` | `/api/v1/admin/questions/:questionId` | Recruiter / Admin | `admin-web` Question Detail | **Get Question:** Returns full question details including hidden test cases. |
| `PATCH` | `/api/v1/admin/questions/:questionId` | Recruiter / Admin | `admin-web` Question Editor | **Update Question:** Updates prompt, starter code, or test cases. |
| `DELETE` | `/api/v1/admin/questions/:questionId` | Recruiter / Admin | `admin-web` Question Bank | **Delete Question:** Deletes question from question bank. |
| `POST` | `/api/v1/admin/questions/bulk` | Recruiter / Admin | `admin-web` CSV Import | **Bulk Upload Questions:** Ingests array of parsed CSV questions into DB. |
| `GET` | `/api/v1/admin/questions/:questionId/stats` | Recruiter / Admin | `admin-web` Question Analytics | **Question Analytics:** Returns historic candidate pass rates and discrimination metrics. |

---

### 14. Platform Settings & Security Audit Logs (`/admin/settings`)
Implemented in `backend/api/src/settings/settings.controller.ts`. **Restricted to `ADMIN` role only.**

| Method | Full Endpoint Path | Guard / Auth | Where Used | Purpose & Business Logic |
|---|---|---|---|---|
| `GET` | `/api/v1/admin/settings/staff` | Admin Guard | `admin-web` Team Management | **List Staff:** Lists all recruiter and admin staff accounts. |
| `POST` | `/api/v1/admin/settings/staff` | Admin Guard | `admin-web` Add Staff | **Add Staff Member:** Creates staff profile with `RECRUITER` or `ADMIN` role. |
| `DELETE` | `/api/v1/admin/settings/staff/:staffId` | Admin Guard | `admin-web` Staff List | **Delete Staff Member:** Removes staff access. |
| `PATCH` | `/api/v1/admin/settings/staff/:staffId/role` | Admin Guard | `admin-web` Staff List | **Update Staff Role:** Changes role between `RECRUITER` and `ADMIN`. |
| `GET` | `/api/v1/admin/settings/scoring` | Admin Guard | `admin-web` Scoring Config | **Get Scoring Config:** Returns thresholds for AI confidence, auto-pass criteria, and AI intensity. |
| `PATCH` | `/api/v1/admin/settings/scoring` | Admin Guard | `admin-web` | **Update Scoring Config:** Adjusts composite scoring weights and threshold boundaries. |
| `GET` | `/api/v1/admin/settings/system` | Admin Guard | `admin-web` System Config | **Get System Thresholds:** Returns disconnect timeout, heartbeat interval, and grace window settings. |
| `PATCH` | `/api/v1/admin/settings/system` | Admin Guard | `admin-web` | **Update System Thresholds:** Modifies system timing limits (e.g. 5-min disconnect window). |
| `GET` | `/api/v1/admin/settings/retention` | Admin Guard | `admin-web` Compliance | **Get Data Retention Policy:** Returns data retention window (e.g. 90 days for biometric selfie data per DPDP Act). |
| `PATCH` | `/api/v1/admin/settings/retention` | Admin Guard | `admin-web` | **Update Data Retention Policy:** Configures automatic data purging schedules. |
| `GET` | `/api/v1/admin/settings/appeal-window` | Admin Guard | `admin-web` Compliance | **Get Candidate Appeal Window:** Returns timeframe allowed for candidate grade appeals. |
| `PATCH` | `/api/v1/admin/settings/appeal-window` | Admin Guard | `admin-web` | **Update Appeal Window:** Updates allowed appeal days. |
| `GET` | `/api/v1/admin/settings/audit-log` (and `/audit-logs`) | Admin Guard | `admin-web` Audit Viewer | **List Audit Logs:** Returns immutable security audit trail of staff actions (scoring changes, candidate deletions, data exports). |

---

### 15. Partner ATS Integration (`/partner`)
Implemented in `backend/api/src/partner/partner-candidates.controller.ts`, `partner-requisitions.controller.ts`, and `partner-admin.controller.ts`.

| Method | Full Endpoint Path | Guard / Auth | Where Used | Purpose & Business Logic |
|---|---|---|---|---|
| `POST` | `/api/v1/partner/candidates` | `PartnerApiKeyGuard`, `IdempotencyInterceptor` | Partner ATS Ingestion | **High-Throughput Candidate Ingestion:** Ingests up to 1,000 candidates in <2–5s. Automatically parses raw resume experience strings (`"7+ experience"`, `"3.5 yrs"`), maps them to calibrated role templates (`0-1`, `2-5`, `6-10`, `11-15`), upserts the Drive for the requisition, and issues 48h rolling assessment invites. |
| `GET` | `/api/v1/partner/requisitions/:ref/status` | `PartnerApiKeyGuard` | Partner ATS Polling | **Poll Requisition & Candidate Status:** Returns session status, progress, composite score, score band (`HIGH`, `MEDIUM`, `LOW`), and assessment link for all candidates in the requisition. |
| `GET` | `/api/v1/admin/partners` | Admin Guard | `admin-web` Settings | **List Partners:** Lists all registered partner ATS integrations. |
| `POST` | `/api/v1/admin/partners` | Admin Guard | `admin-web` Settings | **Create Partner:** Registers new partner ATS and issues raw `pk_live_...` API key. |
| `POST` | `/api/v1/admin/partners/:id/rotate-key` | Admin Guard | `admin-web` Settings | **Rotate Partner API Key:** Issues new `pk_live_...` key with 24h grace period. |
| `DELETE` | `/api/v1/admin/partners/:id` | Admin Guard | `admin-web` Settings | **Revoke Partner Access:** Immediately invalidates partner API key. |

