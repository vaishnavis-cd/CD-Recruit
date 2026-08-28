# CD-Recruit — Full Repository Audit Report
**Date:** July 24, 2026  
**Auditor:** Antigravity AI (Exhaustive Read-Only Repository Audit)  
**Scope:** `codebase/` monorepo (NestJS monolith API, FastAPI correlation-engine, Admin Vite React TS), `cd-recruit-candidate-ui/` (Candidate Vite React TS), Prisma schemas, Docker Compose configurations, documentation, and environment contracts.

---

## 1. Executive Summary

### Track A — Candidate Experience
The candidate experience surface has progressed significantly beyond its initial placeholder state. Complete UI flows exist for time-gated access (`TooEarlyScreen`, `WaitingRoomScreen`, `SystemCheckScreen`, `ConsentScreen`, `TutorialScreen`, `PreSubmitReview`, `DoneScreen`, `SessionConflictScreen`). The five port interfaces (`SessionApiPort`, `CvDetectionPort`, `ScenarioEnginePort`, `TimeAuthorityPort`, `ProctoringEventPort`) are defined with clean fallback mechanics. `cv/real.ts` no longer throws unhandled errors and delegates camera lifecycle gracefully. Basic WCAG ARIA attributes (`aria-label`, `aria-labelledby`, `aria-live`, `aria-valuenow`) have been added across core screens. However, critical gaps remain: no standalone `identity`/KYC adapter exists outside the embedded selfie consent step, `ProctoringEventType` in candidate-web omits `TAB_SWITCH`, `PASTE`, and `FULLSCREEN_EXIT`, client-side watermark overlays are unbuilt, and admin-settable extended-time accommodation flags are missing from the schema and backend.
**Status:** **Partially Built**

### Track B — Backend Core, Orchestration & Admin Dashboard
The NestJS backend monolith and Admin Dashboard have received substantial feature upgrades. The Drive creation UI in `admin-web` has been upgraded from a single-page modal into a 6-step wizard (`Basics` → `Modules` → `Questions` → `Schedule` → `Candidates` → `Review & Send`) with Step 3 question completeness blocking, Step 5 CSV duplicate email/format validation, and Step 4 concurrency warnings. `JwtStrategy` supports Keycloak OIDC JWKS public key verification alongside dev-JWT fallback. `settings.service.ts` includes `appealWindowDays` (14 days default) with audit log tracking. `HeartbeatService` executes automated retention cleanup of expired `EvidenceClip` storage objects and baseline selfies. However, `aiConfidence` remains completely unwired to backend auto-score vs. human-review routing (used solely for stats and list filtering), and multi-signal proctoring correlation weighting (`tab-switch + large-external-insert`) is unimplemented in `ProctoringService`.
**Status:** **Partially Built**

### Track C — Correlation Engine, Grading & Data
The Python FastAPI `correlation-engine` is no longer an empty 0-byte directory; it contains complete module structures (`main.py`, `app/api/routes.py`, `app/core/correlation.py`, `app/core/intent_classifier.py`, `app/scoring/consistency/engine.py`, `app/scoring/grading/rubric_grader.py`). However, the NestJS backend `session-scoring.service.ts` computes `sayDoConsistencyScore` using a synthetic formula (`compositeScore * 1.05`) or hardcoded fallback (`0.85`), rather than calling the Correlation Engine. In `admin-web`, this synthetic score is displayed directly as a real percentage without any placeholder indication. Furthermore, key schema fields (`DRIVE.slotDistribution`, `DriveQuestion.questionVersionSnapshot`, `REVIEWER_DECISION.agreedWithAi`) are present in `schema.prisma` but unwired in backend logic, and no backend service generates the Candidate-Facing report variant.
**Status:** **Partially Built / Diverges**

### Cross-Cutting Infrastructure & Security
Infrastructure ports (`QueueProviderPort` and `ObjectStoragePort`) cleanly isolate business logic from direct Redis/BullMQ/MinIO SDK dependencies. Toggling `INFRA_MODE=local|full` correctly switches between local fake providers and real MinIO/BullMQ/Keycloak connections. `event-generation.service.ts` strictly enforces the locked principle that raw LLM generation never touches a live session (`generateScenario` returns static pre-authored templates). However, `docker-compose.judge0.yml` lacks `--network none` egress blocking and gVisor runtime configuration, MinIO uses identical admin credentials (`minioadmin`) across both biometric and plain buckets, and the local compose environment operates entirely over unencrypted HTTP.
**Status:** **Partially Built**

---

## 2. Critical Findings

### 1. [CRITICAL] Synthetic Say-Do Score Rendered as Real in Admin UI
* **Location:** [session-scoring.service.ts:122](file:///d:/Projects/cd-recruit/codebase/backend/api/src/session/session-scoring.service.ts#L122), [results.$id.tsx:549](file:///d:/Projects/cd-recruit/codebase/frontend/admin-web/src/routes/results.$id.tsx#L549), [session-detail.tsx:99](file:///d:/Projects/cd-recruit/codebase/frontend/admin-web/src/components/session-detail.tsx#L99)
* **Violation:** Violates Technical Architecture Document (TAD) §1.3 & §8, and Audit Findings TODO §0.
* **Finding:** `session-scoring.service.ts` computes `sayDoConsistencyScore` via `Math.min(1.0, Math.round((compositeScore * 1.05) * 100) / 100)` or returns `0.85` on missing session. In `admin-web`, this number renders directly as `85%` without any badge or label identifying it as a synthetic placeholder. A reviewer inspecting the candidate report will trust this number as a real evaluation of code vs. communication consistency.

### 2. [HIGH] Confidence Gating Unwired to Execution Routing
* **Location:** [admin.service.ts:159-160](file:///d:/Projects/cd-recruit/codebase/backend/api/src/admin/admin.service.ts#L159-L160), [dashboard.service.ts:241-252](file:///d:/Projects/cd-recruit/codebase/backend/api/src/admin/dashboard.service.ts#L241-L252)
* **Violation:** Violates TAD §1.1 (Candidate User Flow) & MVP Architecture §6.
* **Finding:** `aiConfidence` is stored in DB and read ONLY to group stats for the admin dashboard and filter sessions displayed in the "Awaiting Review" list. No backend service, controller, or workflow engine checks `aiConfidence` to branch routing between auto-publishing scores versus requiring human reviewer sign-off before score release.

### 3. [HIGH] Judge0 Sandbox Lacks Container Network Egress Block & gVisor Runtime
* **Location:** [docker-compose.judge0.yml:10-57](file:///d:/Projects/cd-recruit/codebase/docker/docker-compose.judge0.yml#L10-L57)
* **Violation:** Violates Technical Architecture Document §1.2 & MVP Architecture §6 ("sandboxed code execution with zero network egress under gVisor").
* **Finding:** `docker-compose.judge0.yml` configures CPU, memory, thread, and output limits, but does NOT specify `--network none` or `runtime: runsc` (gVisor). Untrusted candidate code executed in Judge0 containers retains network access if the host environment allows outbound routing.

### 4. [MEDIUM] Single MinIO Credentials Reused Across Biometric and Plain Buckets
* **Location:** [minio.service.ts:41-47](file:///d:/Projects/cd-recruit/codebase/backend/api/src/integrations/minio/minio.service.ts#L41-L47), [minio.module.ts:14-16](file:///d:/Projects/cd-recruit/codebase/backend/api/src/integrations/minio/minio.module.ts#L14-L16)
* **Violation:** Violates TAD §4 & Component Reference §3 (Sensitive/Biometric Tier IAM Boundary).
* **Finding:** `MinioService` initializes a single `Minio.Client` with root admin credentials (`minioadmin`) used for both `cd-recruit-biometric` and `cd-recruit-general` buckets. Physical IAM/credential separation between plain tier data and sensitive biometric evidence clips is absent in application configuration.

### 5. [MEDIUM] Candidate Proctoring Event Types Omit Tab-Switch, Paste, and Fullscreen-Exit
* **Location:** [proctoring.types.ts:1-12](file:///d:/Projects/cd-recruit/codebase/frontend/candidate-web/src/proctoring/proctoring.types.ts#L1-L12), [schema.prisma:460-476](file:///d:/Projects/cd-recruit/codebase/backend/prisma/schema.prisma#L460-L476)
* **Violation:** Violates TAD §3.1 & Candidate UX Spec §3.5.
* **Finding:** While `schema.prisma` includes proposed `TAB_SWITCH`, `PASTE`, and `FULLSCREEN_EXIT` enum values, `ProctoringEventType` in `cd-recruit-candidate-ui/src/proctoring/proctoring.types.ts` excludes these three event types from its typescript union. As a result, candidate-web's `ProctoringEventService` cannot strongly type or transmit these events to `/proctoring/events`.

### 6. [LOW] Candidate-Facing Report Variant Not Implemented in Backend
* **Location:** [admin.service.ts:376](file:///d:/Projects/cd-recruit/codebase/backend/api/src/admin/admin.service.ts#L376)
* **Violation:** Violates TAD §7 (Final Candidate Report Schema).
* **Finding:** NestJS API provides `/admin/sessions/:id/detail` for internal recruiter reviews, but has no controller endpoint or data mapper for generating the candidate-facing report variant (composite score band, soft-skills feedback, Learning Hub recommendations, stripped proctoring flags).

---

## 3. Full Capability Matrix

| Capability / Mechanism | Spec Reference | Code Location | Status | Evidence | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Say-Do Consistency Score** | TAD §1.2, §8 | [session-scoring.service.ts:122](file:///d:/Projects/cd-recruit/codebase/backend/api/src/session/session-scoring.service.ts#L122) | **Diverges** | `sayDoConsistencyScore = Math.min(1.0, Math.round((compositeScore * 1.05) * 100) / 100)` | Backend uses synthetic 1.05 multiplier formula instead of invoking Correlation Engine. |
| **Correlation Engine** | TAD §1.2, §8 | [routes.py:10](file:///d:/Projects/cd-recruit/codebase/backend/correlation-engine/app/api/routes.py#L10) | **Partial** | FastAPI app with `/api/v1/correlate` exists in Python, but uncalled by NestJS API. | Real Python structure built; NestJS backend integration pending. |
| **AI Confidence Gating** | TAD §1.1 | [admin.service.ts:159](file:///d:/Projects/cd-recruit/codebase/backend/api/src/admin/admin.service.ts#L159) | **Partial** | Read only in `getSessionsAwaitingReview` filter and dashboard stats. | Does not branch auto-score vs human review release routing. |
| **LLM Session Boundary** | TAD §1.2, MVP §1 | [event-generation.service.ts:72](file:///d:/Projects/cd-recruit/codebase/backend/api/src/simulation/event-generation.service.ts#L72) | **Matches** | `return this.getStaticFallback(templateId)` | Live sessions strictly use static pre-authored artifacts. Claude API calls are offline only. |
| **On-Device CV (MediaPipe)** | TAD §2, CompRef §1 | [real.ts:26-63](file:///d:/Projects/cd-recruit/codebase/frontend/candidate-web/src/services/cv/real.ts#L26-L63) | **Partial** | Delegates stream/camera to `ProctoringModule`; WASM landmarker deferred. | Camera lifecycle works; full WASM model inference is documented as deferred. |
| **Biometric Retention Job** | TAD §4, MVP §6 | [heartbeat.service.ts:88-133](file:///d:/Projects/cd-recruit/codebase/backend/api/src/queue/heartbeat.service.ts#L88-L133) | **Matches** | `runRetentionCleanup()` deletes expired `EvidenceClip` storage objects and baseline selfies. | Scheduled cron job runs automatically. |
| **Ports-and-Adapters (Backend)** | CompRef §2, INFRA §1 | [queue.module.ts:13](file:///d:/Projects/cd-recruit/codebase/backend/api/src/queue/queue.module.ts#L13), [minio.module.ts:14](file:///d:/Projects/cd-recruit/codebase/backend/api/src/integrations/minio/minio.module.ts#L14) | **Matches** | Services inject `QueueProviderPort` and `ObjectStoragePort`. | Clean abstraction. Toggles between fake and real based on `INFRA_MODE`. |
| **Time-Gate Logic** | Candidate UX §2 | [InviteResolver.tsx:71](file:///d:/Projects/cd-recruit/codebase/frontend/candidate-web/src/routes/InviteResolver.tsx#L71), [TooEarlyScreen.tsx:34](file:///d:/Projects/cd-recruit/codebase/frontend/candidate-web/src/routes/TooEarlyScreen.tsx#L34) | **Matches** | Computes Too Early / Grace / Expired using `scheduledTime`, `bufferMinutes`, `graceMinutes`. | Fully consumed in frontend. |
| **Drive 6-Step Wizard** | Admin IA §3.1 | [drives.tsx:76-240](file:///d:/Projects/cd-recruit/codebase/frontend/admin-web/src/routes/drives.tsx#L76-L240) | **Matches** | Full 6-step flow with Step 3 completeness check, Step 4 concurrency warning, Step 5 CSV validation. | Upgraded from single-page modal. |
| **Keycloak Integration** | CompRef §2, MVP §3 | [jwt.strategy.ts:81-111](file:///d:/Projects/cd-recruit/codebase/backend/api/src/auth/strategies/jwt.strategy.ts#L81-L111) | **Matches** | Dynamic JWKS fetching from `/openid-connect/certs` + realm role mapping. | Hybrid support for Keycloak OIDC and dev-JWT. |
| **Sandboxed Code Execution** | TAD §1.2, MVP §3 | [docker-compose.judge0.yml:25-33](file:///d:/Projects/cd-recruit/codebase/docker/docker-compose.judge0.yml#L25-L33) | **Diverges** | CPU and memory limits present, but `--network none` and gVisor runtime are absent. | Security boundary lacks network egress block in compose file. |
| **Editor Paste Event Detection** | TAD §3.1, MVP §6 | [CodeEditor.tsx:59-71](file:///d:/Projects/cd-recruit/codebase/frontend/candidate-web/src/components/common/CodeEditor.tsx#L59-L71) | **Partial** | Monaco `onDidPaste` captures range, text, length, timestamp. | Frontend editor event hooked; backend correlation logic missing. |
| **Client-Side Watermark** | TAD §3.2, MVP §6 | N/A | **Not Started** | No watermark overlay component exists in `cd-recruit-candidate-ui`. | Absent. |
| **Dual Report Schema** | TAD §7 | [admin.service.ts:376](file:///d:/Projects/cd-recruit/codebase/backend/api/src/admin/admin.service.ts#L376) | **Partial** | Recruiter detail endpoint returns internal report JSON; candidate-facing endpoint absent. | Recruiter version real, candidate-facing version unbuilt in API. |
| **Accessibility Support** | Candidate UX §6.7 | [PreSubmitReview.tsx:148](file:///d:/Projects/cd-recruit/codebase/frontend/candidate-web/src/routes/PreSubmitReview.tsx#L148) | **Partial** | ARIA attributes present across screens; extended-time flag & keyboard focus path missing. | Basic ARIA present, schema/backend extended-time accommodation absent. |

---

## 4. Named Critical-Risk Checklist Answers

### A. Correlation Engine / Say-Do Score
1. **Correlation Engine Code State:** **Real logic now exists.** `backend/correlation-engine` is no longer empty. `app/main.py:1-11` initializes FastAPI with `/health` and includes `/api/v1/correlate` (`app/api/routes.py:10`). Core logic modules exist in `app/core/correlation.py`, `app/core/intent_classifier.py`, `app/scoring/consistency/engine.py`, `app/scoring/grading/rubric_grader.py`, and `app/scoring/report/generator.py`.
2. **Hardcoded Say-Do Score Trace:** **Partial.** In `simulation.service.ts:347`, uncomputed sessions set `sayDoConsistencyScore: -1.0` (sentinel). In `session-scoring.service.ts:36`, missing sessions return `0.85`. In `session-scoring.service.ts:122`, active sessions calculate `sayDoConsistencyScore = Math.min(1.0, Math.round((compositeScore * 1.05) * 100) / 100)`. This is a synthetic formula, NOT a constant, but also NOT an actual Say-Do code vs. communication correlation.
3. **Say-Do Score UI Labeling:** **Unlabeled (Renders as Authentic).** In `admin-web` (`results.$id.tsx:549`, `session-detail.tsx:99`, `dashboard.tsx:79`), the score renders directly as a percentage (e.g. `85%`) or default trace without any banner, badge, or footnote marking it as synthetic or uncomputed.

### B. Confidence Gating
4. **AI Confidence Routing Branching:** **No.** `aiConfidence` does NOT branch routing between auto-score release and human-reviewer flagging in any backend controller or service. It is read strictly in `dashboard.service.ts:241-252` for stat distribution charts and `admin.service.ts:159` to filter sessions in the admin "Awaiting Review" list.

### C. LLM-on-Live-Session Boundary
5. **EventGenerationService Execution Timing:** **Offline / Pre-authored Only.** In `event-generation.service.ts:72`, `generateScenario` explicitly returns `this.getStaticFallback(templateId)`. Although `ClaudeProvider` (`lines 136-172`) and `GeminiProvider` (`lines 174-208`) are defined, they are NEVER invoked during live candidate session event generation. Live sessions strictly receive static pre-authored artifacts from `artifactLibrary`.

### D. Schema Fields
6. **INTEGRITY_FLAG.disposition:** **Present & Wired.** `disposition String?` exists in `schema.prisma:302` and is updated in `proctoring.service.ts:125`.
7. **REVIEWER_DECISION.agreed_with_ai:** **Present in Schema, Unwired in Code.** `agreedWithAi Boolean? @map("agreed_with_ai")` exists in `schema.prisma:365`, but is not read or written anywhere in NestJS API or frontend code.
8. **Presence & Wiring of New Fields:**
   * `INVITE.scheduled_time`: Present (`schema.prisma:388`), wired in `auth.service.ts:126`, consumed in candidate UI (`InviteResolver.tsx:71`, `TooEarlyScreen.tsx:34`).
   * `INVITE/DRIVE.buffer_minutes`: Present (`schema.prisma:128, 389`), wired in `auth.service.ts:127`, consumed in candidate UI (`InviteResolver.tsx:71`).
   * `INVITE/DRIVE.grace_minutes`: Present (`schema.prisma:129, 390`), wired in `auth.service.ts:128`, consumed in candidate UI (`InviteResolver.tsx:71`).
   * `SESSION.tutorial_mode`: Present (`schema.prisma:226`), consumed in candidate UI (`TutorialScreen.tsx:94`).
   * `SESSION.actual_start_at`: Present (`schema.prisma:227`), written in `session.service.ts:114`.
   * `DRIVE.slot_distribution`: Present (`schema.prisma:130`), **Unwired** (0 references in code).
   * `DriveQuestion.questionVersionSnapshot`: Present (`schema.prisma:147`), **Unwired** (0 references in question loading).
   * `SessionStatus.ABANDONED`: Present (`schema.prisma:32`), checked in guards and heartbeat (`session.service.ts:803`, `heartbeat.service.ts:112`), but **No logic ever sets status to ABANDONED**.

### E. Ports-and-Adapters / INFRA_MODE
9. **Port Abstraction Integrity:** **Fully Abstracted.** `QueueProviderPort` (`queue.module.ts:13`) and `ObjectStoragePort` (`minio.module.ts:14`) fully abstract all call sites in business services (`SessionService`, `HeartbeatService`, `ProctoringService`, `AdminService`). No business service calls ioredis/BullMQ/MinIO SDKs directly.
10. **INFRA_MODE=local|full End-to-End Purity:** **Working in Both Modes.** Switching `INFRA_MODE` toggles `LocalFakeObjectStorageProvider` vs `MinioService`, `InMemoryQueueAdapter` vs `BullMQ`, Dev JWT vs Keycloak JWKS (`jwt.strategy.ts:83`), and Correlation Engine mock vs FastAPI endpoint (`correlation-grading.service.ts:11`). Note: In `main.ts:75`, `INFRA_MODE=full` strictly requires MinIO to be running on boot.
11. **Cross-Port Dependency Rule:** **Clean Isolation.** In candidate-web (`real.ts:36-80`), `resolveInvite` parses payload and uses fallback `FIXTURE_INVITE` if backend returns partial data, without breaking when other ports (`cv`, `scenario`) run in mock mode.

### F. Candidate-Facing Frontend Integration
12. **Candidate Port Wiring & Controller Endpoint Verification:**
    * `Invite Resolution`: Mock (`realSessionApiAdapter` parses JWT locally). Backend has no public `/invites/resolve` endpoint.
    * `Session Creation/Begin`: Real (`POST /sessions/start`, `POST /sessions/:sessionId/begin`).
    * `Server Time Sync`: Real (`GET /health`).
    * `Heartbeat`: Real (`POST /sessions/:sessionId/heartbeat`).
    * `Module Response Submit`: Real for SQL (`POST /sql/submit`) and Coding (`POST /coding/submit`). MCQ and Prompting rely on generic autosave draft updates.
    * `Event Log Sync`: Mock (no `POST /sessions/:sessionId/events/sync` endpoint exists).
    * `Final Submission`: Real (`POST /sessions/:sessionId/close`).
    * `Sandbox Execution`: Real (`POST /coding/run`, `POST /coding/submit`).
    * `Scenario Engine`: Mock (no WebSocket gateway exists for Module 5 chat simulation).
    * `Integrity Signal Reporting`: Real in `ProctoringEventService` (`POST /proctoring/events`), though documented as mock in `INTEGRATION_STATUS.md`.
13. **INTEGRATION_STATUS.md Accuracy:** **Stale.** `INTEGRATION_STATUS.md` line 19 lists Integrity Signal Reporting as `mock`, but `ProctoringEventService` (`proctoring-event.service.ts:66`) actively POSTs events to `/proctoring/events`.

### G. Track A Items
14. **`cv/real.ts` Error Handling:** **Resolved / Documented.** `codebase/frontend/candidate-web/src/services/cv/real.ts:26-63` no longer throws an unhandled error. It manages camera lifecycle and detection subscriptions via `ProctoringModule` and `DetectionEngineService`.
15. **Proctoring-Event Real Adapter Scope:** **Partial.** `ProctoringEventService` (`proctoring-event.service.ts`) exists and handles offline queueing and POSTing to `/proctoring/events`. However, `TAB_SWITCH`, `PASTE`, and `FULLSCREEN_EXIT` are omitted from `ProctoringEventType` in `proctoring.types.ts:1-12`.
16. **Identity/KYC Real Adapter:** **Embedded in Consent Flow.** No standalone `identity`/KYC adapter exists in `src/services/`. Selfie capture is handled inside `ConsentSelfieStep.tsx` and POSTed to `POST /sessions/:sessionId/selfie` via `SessionApiPort.createSession`.
17. **Time-Gate Fields in Candidate UI:** **Consumed.** `scheduled_time`, `buffer_minutes`, `grace_minutes`, `tutorial_mode` are consumed by candidate-web (`InviteResolver.tsx`, `TooEarlyScreen.tsx`, `WaitingRoomScreen.tsx`, `TutorialScreen.tsx`).
18. **Accessibility Support:** **Partial.** Basic WCAG ARIA attributes (`aria-label`, `aria-labelledby`, `aria-live`, `aria-valuenow`) exist across candidate-web screens (`PreSubmitReview.tsx:148`, `MCQModule.tsx:181`, `SystemCheckScreen.tsx:196`). Keyboard focus management and admin-settable extended-time accommodation flags are absent.

### H. Track B Items
19. **Drive Creation 6-Step Wizard Upgrade:** **Upgraded.** Implemented in `drives.tsx:76-240` (Basics → Modules → Questions → Schedule → Candidates → Review & Send).
20. **Wizard Validations:** **All Implemented.** Step 3 completeness check (`drives.tsx:199-208`) blocks launch on missing questions. Step 5 CSV upload (`drives.tsx:132-173`) validates email format and duplicates. Step 4 concurrency warning (`drives.tsx:127-129`) flags `concurrencyRatio > 25`.
21. **Backend Proctoring Correlation Logic:** **Unimplemented (Stub).** `ProctoringService` stores raw events and evidence clips, but multi-signal correlation weighting (`tab-switch + large-external-insert`) and self-copy provenance tagging do not exist in backend logic.
22. **Keycloak Cutover:** **Migrated / Hybrid.** `JwtStrategy` (`jwt.strategy.ts:81-111`) verifies Keycloak OIDC JWKS signatures and maps realm roles (`ADMIN`, `RECRUITER`) alongside dev-JWT fallback.
23. **settings.service.ts Appeal-Window Duration:** **Present & Wired.** `settings.service.ts:27, 170-195` implements `appealWindowDays` (14 days default) with audit log creation (`APPEAL_WINDOW_CONFIG_UPDATED`).

### I. Security / Data Controls
24. **TLS / AES-256-GCM Deployment Config:** **Unconfigured on Localhost.** `docker-compose.dev.yml:58` runs plain HTTP services on unencrypted ports. TLS/AES-256-GCM is documented but not configured in local compose.
25. **Sandboxed Code Execution Zero Network Egress:** **Missing Egress Block & gVisor Runtime.** `docker-compose.judge0.yml:25-33` configures resource limits, but omits `--network none` and `runtime: runsc` (gVisor).
26. **Editor-Transaction-Level Paste Detection:** **Partial.** `CodeEditor.tsx:59-71` hooks Monaco `editor.onDidPaste` to capture range, text, and length. Backend keydown history correlation is missing.
27. **Client-Side Watermark Overlay:** **Not Started.** Zero watermark overlay components exist in `cd-recruit-candidate-ui`.
28. **Biometric Evidence Store IAM Boundary:** **Reused Admin Credentials.** `MinioService` (`minio.service.ts:41-47`) uses the same `minioadmin` credentials for both biometric and general buckets.
29. **Automated Lifecycle Deletion on Evidence Clips:** **Implemented as Scheduled Job.** `HeartbeatService.runRetentionCleanup()` (`heartbeat.service.ts:88-133`) automatically purges expired `EvidenceClip` storage objects and baseline selfies.

### J. Report Schema
30. **Report Schema Variants:** **Partial.** Internal recruiter report shape is provided by `admin.service.ts:376` (`/admin/sessions/:id/detail`). Candidate-facing report variant does NOT exist in NestJS backend.

---

## 5. Placeholder & Fake-Data Inventory

* [session-scoring.service.ts:36](file:///d:/Projects/cd-recruit/codebase/backend/api/src/session/session-scoring.service.ts#L36): Hardcoded `sayDoConsistencyScore: 0.85` in fallback path when session is missing.
* [session-scoring.service.ts:122](file:///d:/Projects/cd-recruit/codebase/backend/api/src/session/session-scoring.service.ts#L122): `sayDoConsistencyScore = Math.min(1.0, Math.round((compositeScore * 1.05) * 100) / 100)` synthetic formula.
* [session-scoring.service.ts:148](file:///d:/Projects/cd-recruit/codebase/backend/api/src/session/session-scoring.service.ts#L148): Hardcoded `aiConfidence: 0.85` written to `Score` model on save.
* [simulation.service.ts:347](file:///d:/Projects/cd-recruit/codebase/backend/api/src/simulation/simulation.service.ts#L347): `sayDoConsistencyScore: -1.0` sentinel value.
* [simulation.service.ts:348](file:///d:/Projects/cd-recruit/codebase/backend/api/src/simulation/simulation.service.ts#L348): `aiConfidence: -1.0` sentinel value.
* [correlation-grading.service.ts:88](file:///d:/Projects/cd-recruit/codebase/backend/api/src/simulation/correlation-grading.service.ts#L88): `sayDoConsistencyScore remains -1.0 (sentinel). Manual intervention required.`
* [dashboard.service.ts:79](file:///d:/Projects/cd-recruit/codebase/backend/api/src/admin/dashboard.service.ts#L79): Hardcoded fallback `sayDoTrace.push({ date: dateStr, said: 80, did: 78 })` injected into analytics when DB records are empty.
* [sessionSlice.ts:53](file:///d:/Projects/cd-recruit/codebase/frontend/admin-web/src/lib/slices/sessionSlice.ts#L53): Hardcoded fallback `sayDoScore: 80` in frontend mock state.
* [invite.ts:6](file:///d:/Projects/cd-recruit/codebase/frontend/candidate-web/src/fixtures/invite.ts#L6): Hardcoded fixture `scheduledTime: new Date().toISOString()`.
* [drive.ts:1-25](file:///d:/Projects/cd-recruit/codebase/frontend/candidate-web/src/fixtures/drive.ts#L1-L25): Hardcoded fixture `FIXTURE_DRIVE` fallback object.

---

## 6. Delta vs. Prior Audit

| Claim in Prior Audit Doc (`CD-Recruit_Audit_Findings_TODO_and_Three_Track_Build_Plan.md`) | Current Audit Finding | Status | Citation / Evidence |
| :--- | :--- | :--- | :--- |
| **"Say-Do score is fake right now. `backend/correlation-engine` is empty (0-byte `main.py`)."** | `backend/correlation-engine` now contains complete Python FastAPI application structure (`main.py`, `app/api/routes.py`, `app/scoring/consistency/engine.py`). However, NestJS backend still uses synthetic formula (`compositeScore * 1.05`). | **Contradicted** (Engine directory built, but NestJS integration pending) | [routes.py:10](file:///d:/Projects/cd-recruit/codebase/backend/correlation-engine/app/api/routes.py#L10), [session-scoring.service.ts:122](file:///d:/Projects/cd-recruit/codebase/backend/api/src/session/session-scoring.service.ts#L122) |
| **"Confidence gating doesn't gate anything."** | Still true. `aiConfidence` is read only for stats aggregation and list filtering; no controller/service branches auto-score vs human review release routing. | **Confirmed** | [admin.service.ts:159](file:///d:/Projects/cd-recruit/codebase/backend/api/src/admin/admin.service.ts#L159), [dashboard.service.ts:241](file:///d:/Projects/cd-recruit/codebase/backend/api/src/admin/dashboard.service.ts#L241) |
| **"INTEGRITY_FLAG.disposition is present."** | Still true. Present in `schema.prisma:302` and wired in `proctoring.service.ts:125`. | **Confirmed** | [schema.prisma:302](file:///d:/Projects/cd-recruit/codebase/backend/prisma/schema.prisma#L302) |
| **"REVIEWER_DECISION.agreed_with_ai is absent."** | `agreedWithAi Boolean? @map("agreed_with_ai")` is now present in `schema.prisma:365`, though unwired in TypeScript code. | **Resolved in Schema** (Present in Prisma, unwired in API) | [schema.prisma:365](file:///d:/Projects/cd-recruit/codebase/backend/prisma/schema.prisma#L365) |
| **"`cv/real.ts` throws an unhandled error ('stays mock')."** | Fixed. `cv/real.ts` manages camera streams via `ProctoringModule` and documents deferred MediaPipe landmarker inference cleanly. | **Resolved** | [real.ts:26-63](file:///d:/Projects/cd-recruit/codebase/frontend/candidate-web/src/services/cv/real.ts#L26-L63) |
| **"Drive creation is a single-page modal."** | Upgraded. `drives.tsx` implements full 6-step wizard with question completeness blocking, CSV email validation, and concurrency warnings. | **Resolved** | [drives.tsx:76-240](file:///d:/Projects/cd-recruit/codebase/frontend/admin-web/src/routes/drives.tsx#L76-L240) |
| **"Keycloak cutover is dev-JWT only."** | Upgraded. `JwtStrategy` dynamically fetches Keycloak JWKS keys and validates OIDC signatures when available. | **Resolved** | [jwt.strategy.ts:81-111](file:///d:/Projects/cd-recruit/codebase/backend/api/src/auth/strategies/jwt.strategy.ts#L81-L111) |
| **"settings.service.ts lacks appeal-window timing config."** | Fixed. `appealWindowDays` (14 days default) is implemented with audit log tracking. | **Resolved** | [settings.service.ts:27](file:///d:/Projects/cd-recruit/codebase/backend/api/src/settings/settings.service.ts#L27) |
| **"Automated retention deletion on evidence clips is theoretical."** | Implemented. `HeartbeatService.runRetentionCleanup()` runs automated deletion of expired MinIO evidence clips and baseline selfies. | **Resolved** | [heartbeat.service.ts:88-133](file:///d:/Projects/cd-recruit/codebase/backend/api/src/queue/heartbeat.service.ts#L88-L133) |

---

## 7. Unverified Items

1. **Runtime MediaPipe WASM Performance Benchmark:**  
   * *Status:* UNVERIFIED from static reading.  
   * *Recommendation:* Requires a browser runtime trace on Tier-A/B/C hardware to verify whether `vision_wasm_internal.js` execution degrades frame rates under heavy CPU load.
2. **WebSocket Concurrency & Reconnection Resilience:**  
   * *Status:* UNVERIFIED from static reading.  
   * *Recommendation:* Requires an integration load test simulating 50+ concurrent candidates toggling network disconnects to verify single-instance NestJS WebSocket gateway reconnection handling.
3. **Production KMS Envelope Key Rotation:**  
   * *Status:* UNVERIFIED from static code inspection.  
   * *Recommendation:* Requires manual infrastructure inspection of Vault / KMS deployment parameters in staging/prod to confirm key rotation policies.
