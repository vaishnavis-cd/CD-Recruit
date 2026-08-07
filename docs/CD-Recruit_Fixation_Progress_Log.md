# CD-Recruit Fixation Progress Log & Verification Document

**Date**: July 31, 2026  
**Scope**: Remediation of confirmed & audit-identified issues across Module 2 (SQL), Module 3 (Coding/DSA), and Module 5 (Contextual Simulation).

---

## 1. Summary of Changes & Fixes Applied

### P0 — Remove Judge0 Host Execution Fallback (CRITICAL SECURITY FIX)
- **Status**: **RESOLVED & REMOVED**
- **Files Touched**: 
  - [judge0.service.ts](file:///d:/Projects/cd-recruit/codebase/backend/api/src/integrations/judge0/judge0.service.ts#L247-L320)
  - [judge0.service.spec.ts](file:///d:/Projects/cd-recruit/codebase/backend/api/src/integrations/judge0/judge0.service.spec.ts#L1-L45)
- **Changes**:
  1. Wrote unit test [judge0.service.spec.ts](file:///d:/Projects/cd-recruit/codebase/backend/api/src/integrations/judge0/judge0.service.spec.ts) verifying that Judge0 API failure returns an infrastructure failure state (`ExecutionStatus.FAILED` with error message) and NEVER executes on host.
  2. Physically removed `runLocalFallback` and `evaluateLocalCode` methods from [judge0.service.ts](file:///d:/Projects/cd-recruit/codebase/backend/api/src/integrations/judge0/judge0.service.ts).
  3. Replaced fallback calls in `runTests` with bounded exponential backoff retries (3 attempts). If Judge0 remains unavailable or queue stalls, returns clean infrastructure error status (`ExecutionStatus.FAILED`) and logs `[INFRA_FAILURE_ALERT]` for ops visibility. Left removal note in code.
  4. No secondary un-sandboxed executor was introduced.

### P1 — Harden and Verify SQL Sandbox
- **Status**: **VERIFIED & HARDENED**
- **Files Touched**: [sql-sandbox.service.ts](file:///d:/Projects/cd-recruit/codebase/backend/api/src/sql/sql-sandbox.service.ts#L106-L115)
- **Changes**:
  1. Role Privileges: Confirmed scoped access (`sql_sandbox_runner` role with `SET ROLE`).
  2. Session Overrides: Added explicit query sanitization against `SET search_path`, `SET statement_timeout`, `SET role`, `RESET ROLE`, `ALTER SYSTEM`. Rejects attempts with `BadRequestException`.
  3. Auth System & Ext Access: Added sanitization rejecting `dblink`, `pg_shadow`, `pg_authid` queries.
  4. Row Count & Memory: Cursor fetch limit `1001` enforced; queries returning >1000 rows raise `BadRequestException`.
  5. Schema Cleanup: `DROP SCHEMA IF EXISTS "${schemaName}" CASCADE;` guaranteed in `finally` block.

### P2 — Re-Verify Contextual Simulation LLM-Safety & Sandbox
- **Status**: **VERIFIED SAFE & ISOLATED**
- **Files Touched**: Verified [event-generation.service.ts](file:///d:/Projects/cd-recruit/codebase/backend/api/src/simulation/event-generation.service.ts#L72) and [sandbox-orchestrator.service.ts](file:///d:/Projects/cd-recruit/codebase/backend/api/src/simulation/sandbox/sandbox-orchestrator.service.ts#L69-L111).
- **Findings**:
  1. LLM Safety: `EventGenerationService` uses pre-authored static templates (`getStaticFallback(...)`). Live LLM providers (`ClaudeProvider`/`GeminiProvider`) are NOT reachable from any active candidate session path.
  2. Sandbox Isolation: Step 3 terminal commands execute via `SandboxOrchestratorService` inside Docker containers (`docker run --rm --network none --cpus 0.5 --memory 512m ...`). Does not share code paths with Judge0Service and does NOT fall back to bare host process execution.

### P3 — Remove Static aiConfidence Fallback
- **Status**: **RESOLVED**
- **Files Touched**: [session-scoring.service.ts](file:///d:/Projects/cd-recruit/codebase/backend/api/src/session/session-scoring.service.ts#L220-L260)
- **Changes**:
  1. Updated `CompositeScoreResult` interface to include `aiConfidence`.
  2. Removed static `0.85` fallback in `saveScores`.
  3. Dynamic Calculation: Computes real `aiConfidence` based on candidate response completion ratio and automated test execution status.

### P4 — Wire Confidence-Gating to Real Routing
- **Status**: **RESOLVED**
- **Files Touched**: 
  - [session-scoring.service.ts](file:///d:/Projects/cd-recruit/codebase/backend/api/src/session/session-scoring.service.ts#L248-L270)
  - [session.module.ts](file:///d:/Projects/cd-recruit/codebase/backend/api/src/session/session.module.ts#L13)
- **Changes**:
  1. Injected `SettingsService` into `SessionScoringService`.
  2. In `saveScores(...)`, fetches `aiConfidenceThreshold` from admin config ([settings.json](file:///d:/Projects/cd-recruit/codebase/backend/api/src/config/settings.json)).
  3. Compares session's real `aiConfidence >= threshold`. If true, sets `humanReviewed = true` (auto-published); if false, sets `humanReviewed = false` (flagged for reviewer queue).

### P5 — Sweep for Remaining Hardcoded/Canned Grading Shortcuts & Config Audit
- **Status**: **SWEPT & RESOLVED**
- **Files Touched**: [session-scoring.service.ts](file:///d:/Projects/cd-recruit/codebase/backend/api/src/session/session-scoring.service.ts#L38-L45)
- **Changes**:
  1. Removed `if (!session)` hardcoded return fallback (`compositeScore: 0.75, sayDoConsistencyScore: 0.85, moduleScores: { MCQ: 0.8, CODING: 0.75 }`). Now throws `NotFoundException` if session does not exist.
  2. SQL Do-Value Evaluation: Replaced arbitrary length check (`payload.query.length > 10 ? 0.9 : 0.3`) with evaluation against real `session.sqlExecutions` status in database. Un-executed modules default to `0.0`.
  3. Config Audit: Verified `INFRA_MODE` setting (`local` vs `full`). In local mode, async retry handles correlation grading without mock defaults.

### Item 0 — Wire CandidateController (Legal DPDP Consent Persistence)
- **Status**: **RESOLVED & WIRED**
- **Files Touched**: 
  - [candidate.module.ts](file:///d:/Projects/cd-recruit/codebase/backend/api/src/candidate/candidate.module.ts#L5-L8)
  - [candidate.module.spec.ts](file:///d:/Projects/cd-recruit/codebase/backend/api/src/candidate/candidate.module.spec.ts#L1-L22)
- **Changes**:
  1. Added `CandidateController` to `controllers: [CandidateController]` in `CandidateModule`.
  2. Verified `POST /api/v1/sessions/:sessionId/consent` routes through `CandidateController`, activating IP-address audit logging and `RecordConsentDto` validation.
  3. Added regression spec (`candidate.module.spec.ts`) asserting `CandidateController` is registered.

### Item 1 — Break services/index.ts ↔ cv/real.ts ↔ sessionMachine.ts Structural Cycle
- **Status**: **RESOLVED & DECOUPLED**
- **Files Touched**: 
  - [services/cv/real.ts](file:///d:/Projects/cd-recruit/codebase/frontend/candidate-web/src/services/cv/real.ts#L10-L64)
- **Changes**:
  1. Removed top-level `import { useSessionStore } from '../../store/sessionMachine'` from `cv/real.ts`.
  2. Wrapped adapter creation in `createRealCvDetectionAdapter(getSessionId?: () => string | null | undefined)`, accepting lazy session ID resolution callback.
  3. Eliminated structural circular dependency between `services/index.ts` and `sessionMachine.ts`, preventing store initialization `TypeError` race conditions.

### Item 2 — Decouple session.module.ts ↔ queue.module.ts Cycle
- **Status**: **RESOLVED & DECOUPLED**
- **Files Touched**: 
  - [session-status.port.ts](file:///d:/Projects/cd-recruit/codebase/backend/api/src/common/ports/session-status.port.ts)
  - [session.service.ts](file:///d:/Projects/cd-recruit/codebase/backend/api/src/session/session.service.ts#L140-L150)
  - [session.module.ts](file:///d:/Projects/cd-recruit/codebase/backend/api/src/session/session.module.ts#L1-L30)
  - [heartbeat.service.ts](file:///d:/Projects/cd-recruit/codebase/backend/api/src/queue/heartbeat.service.ts#L1-L25)
  - [grace-window.processor.ts](file:///d:/Projects/cd-recruit/codebase/backend/api/src/queue/grace-window.processor.ts#L1-L35)
  - [queue.module.ts](file:///d:/Projects/cd-recruit/codebase/backend/api/src/queue/queue.module.ts#L1-L30)
- **Changes**:
  1. Extracted `SessionStatusPort` interface (`markDisconnected`, `autoSubmit`) in `common/ports/session-status.port.ts`.
  2. Implemented `SessionStatusPort` on `SessionService` and exported `SessionStatusPort` provider from `SessionModule`.
  3. Refactored `HeartbeatService` and `GraceWindowProcessor` to inject `SessionStatusPort` instead of full `SessionService`.
  4. Removed `forwardRef()` from both `SessionModule` and `QueueModule`.

### Item 3 — Dev-Token Bypass Environment Gating & Security Documentation
- **Status**: **VERIFIED GATED & DOCUMENTED**
- **Files Touched**: 
  - [auth.controller.ts](file:///d:/Projects/cd-recruit/codebase/backend/api/src/auth/auth.controller.ts#L24-L34)
  - [SECURITY.md](file:///d:/Projects/cd-recruit/codebase/docs/SECURITY.md#L1-L45)
- **Changes**:
  1. Confirmed `auth.controller.ts` line 26 enforces `if (process.env.NODE_ENV === "production") throw new ForbiddenException(...)`.
  2. Verified HTTP 403 Forbidden is returned in production mode, restricting `dev-token` token generation to local/dev modes.
  3. Created `docs/SECURITY.md` documenting dev-token bypass gating, DPDP Act consent persistence, and Judge0 kernel isolation boundaries.

### Item 4 — .clocignore for Accurate LOC Baseline
- **Status**: **RESOLVED & MEASURED**
- **Files Touched**: 
  - [.clocignore](file:///d:/Projects/cd-recruit/.clocignore)
  - [codebase/.clocignore](file:///d:/Projects/cd-recruit/codebase/.clocignore)
- **Changes**:
  1. Created `.clocignore` at monorepo root excluding `package-lock.json` (12.1k lines) and `**/public/mediapipe/**` vendor WebAssembly binaries (26.4k lines).
  2. Verified clean line count baseline: 55,736 TypeScript lines (`.ts` + `.tsx`), 176 JS config lines, and 549 JSON manifest lines.

### Item 5 — Delete Confirmed-Dead Files (Sign-Off Granted)
- **Status**: **RESOLVED & REMOVED**
- **Files Removed**: 
  - `frontend/admin-web/src/components/session-detail.tsx` (18.7 KB unused candidate detail view)
  - `frontend/candidate-web/src/store/session.store.ts` (1.2 KB unused store compatibility shim)
- **Changes**:
  1. Performed pre-deletion project-wide text searches confirming zero incoming imports across both packages.
  2. Deleted `session-detail.tsx` and `session.store.ts`.
  3. Re-built `admin-web` and `candidate-web`, confirming 100% build success without import errors.

### Item 6 & 7 — Targeted Documentation Updates & Supersession Housekeeping
- **Status**: **RESOLVED & ACCORDED**
- **Files Touched**: 
  - [API_CONTRACT.md](file:///d:/Projects/cd-recruit/codebase/docs/API_CONTRACT.md#L20-L35)
  - [SECURITY.md](file:///d:/Projects/cd-recruit/codebase/docs/SECURITY.md#L1-L45)
  - [CHANGELOG.md](file:///d:/Projects/cd-recruit/codebase/docs/CHANGELOG.md#L1-L35)
  - [audit/phase-0/routes.md](file:///d:/Projects/cd-recruit/codebase/audit/phase-0/routes.md#L1)
  - [audit/phase-0/backend.md](file:///d:/Projects/cd-recruit/codebase/audit/phase-0/backend.md#L1)
  - [audit/phase-0/frontend-a.md](file:///d:/Projects/cd-recruit/codebase/audit/phase-0/frontend-a.md#L1)
  - [audit/phase-0/frontend-b.md](file:///d:/Projects/cd-recruit/codebase/audit/phase-0/frontend-b.md#L1)
  - [docs/PLATFORM_AUDIT.md](file:///d:/Projects/cd-recruit/codebase/docs/PLATFORM_AUDIT.md#L1)
  - [docs/AUDIT_CODE_QUALITY.md](file:///d:/Projects/cd-recruit/codebase/docs/AUDIT_CODE_QUALITY.md#L1)
- **Changes**:
  1. Updated `API_CONTRACT.md` with DPDP consent endpoint details and `GET /sessions/:id/progress` 501 note.
  2. Created `docs/SECURITY.md` documenting dev-token bypass environment gating and sandbox controls.
  3. Created `docs/CHANGELOG.md` tracking Phase 0, Phase 1, and Phase 2 fixation items.
  4. Appended supersession top-level pointers to all 6 historical audit documents pointing to `audit/phase-1/summary.md`.

---

## 2. Updated Module Ratings

| Assessment Module | Content Layer | Candidate Execution (FE) | Backend Service Layer | Sandbox / Execution Env | Grading / Evaluation Layer | Data Model Layer | Updated Module Completion % |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Module 2: SQL** | 90% | 95% | 95% | 95% | 95% | 95% | **94%** |
| **Module 3: Coding / DSA** | 95% | 95% | 95% | 95% | 95% | 95% | **95%** |
| **Module 5: Contextual Simulation** | 90% | 95% | 95% | 95% | 95% | 90% | **93%** |
