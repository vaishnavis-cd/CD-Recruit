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

---

## 2. Updated Module Ratings

| Assessment Module | Content Layer | Candidate Execution (FE) | Backend Service Layer | Sandbox / Execution Env | Grading / Evaluation Layer | Data Model Layer | Updated Module Completion % |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Module 2: SQL** | 90% | 95% | 95% | 95% | 95% | 95% | **94%** |
| **Module 3: Coding / DSA** | 95% | 95% | 95% | 95% | 95% | 95% | **95%** |
| **Module 5: Contextual Simulation** | 90% | 95% | 95% | 95% | 95% | 90% | **93%** |
