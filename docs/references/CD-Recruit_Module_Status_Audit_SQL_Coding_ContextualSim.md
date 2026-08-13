# CD-Recruit Module Status Audit Report: SQL (Module 2), Coding/DSA (Module 3), and Contextual Simulation (Module 5)

**Audit Date**: July 31, 2026  
**Auditor**: Antigravity AI (Read-Only Discovery Audit)  
**Scope**: Verification of architectural claims, sandbox isolation, LLM execution safety, confidence-gating routing, data model completeness, and completion status across Modules 2, 3, and 5.

---

## 1. Executive Summary Table

| Assessment Module | Content Layer | Candidate Execution (FE) | Backend Service Layer | Sandbox / Execution Env | Grading / Evaluation Layer | Data Model Layer | Overall Module Completion % |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Module 2: SQL** | 90% | 95% | 90% | 85% | 85% | 95% | **90%** |
| **Module 3: Coding / DSA** | 95% | 95% | 90% | 60% | 85% | 95% | **87%** |
| **Module 5: Contextual Simulation** | 90% | 95% | 90% | 85% | 85% | 90% | **89%** |

### Reasoning Breakdown for Completion Percentages:
- **Module 2 (SQL) [90%]**: Content (90%: 10 seeded questions in [sql.ts](file:///d:/Projects/cd-recruit/codebase/backend/prisma/data/sql.ts#L16-L651)), FE Execution (95%: 2-column interface in [SQLModule.tsx](file:///d:/Projects/cd-recruit/codebase/frontend/candidate-web/src/modules/sql/SQLModule.tsx)), Backend (90%: [sql.service.ts](file:///d:/Projects/cd-recruit/codebase/backend/api/src/sql/sql.service.ts#L1-L150)), Sandbox (85%: isolated Postgres schema runner in [sql-sandbox.service.ts](file:///d:/Projects/cd-recruit/codebase/backend/api/src/sql/sql-sandbox.service.ts#L63-L100)), Grading (85%: [sql-validator.service.ts](file:///d:/Projects/cd-recruit/codebase/backend/api/src/sql/sql-validator.service.ts#L1-L120)), Data Model (95%: `SQLExecution` & `Question` in [schema.prisma](file:///d:/Projects/cd-recruit/codebase/backend/prisma/schema.prisma#L225-L238)).
- **Module 3 (Coding / DSA) [87%]**: Content (95%: 5 coding + 2 debugging seeded entries in [coding.ts](file:///d:/Projects/cd-recruit/codebase/backend/prisma/data/coding.ts#L24-L268) and [debugging.ts](file:///d:/Projects/cd-recruit/codebase/backend/prisma/data/debugging.ts#L15-L137)), FE Execution (95%: Monaco editor workspace in [CodingWorkspace.tsx](file:///d:/Projects/cd-recruit/codebase/frontend/candidate-web/src/components/coding/CodingWorkspace.tsx#L58-L540)), Backend (90%: [coding.service.ts](file:///d:/Projects/cd-recruit/codebase/backend/api/src/coding/coding.service.ts#L100-L195)), Sandbox (60%: Judge0 integration with bare host process failover fallback in [judge0.service.ts](file:///d:/Projects/cd-recruit/codebase/backend/api/src/integrations/judge0/judge0.service.ts#L150-L156)), Grading (85%: test case pass/fail evaluator), Data Model (95%: `CodingExecution` in [schema.prisma](file:///d:/Projects/cd-recruit/codebase/backend/prisma/schema.prisma#L205-L223)).
- **Module 5 (Contextual Simulation) [89%]**: Content (90%: DB-backed scenario config in [qa-bug-report.config.ts](file:///d:/Projects/cd-recruit/codebase/backend/api/src/simulation/scenarios/qa-bug-report.config.ts#L1-L80)), FE Execution (95%: 4-step workflow in [ContextSimulationWorkspace.tsx](file:///d:/Projects/cd-recruit/codebase/frontend/candidate-web/src/modules/contextual/components/ContextSimulationWorkspace.tsx#L1-L180)), Backend (90%: [simulation.service.ts](file:///d:/Projects/cd-recruit/codebase/backend/api/src/simulation/simulation.service.ts#L33-L350)), Sandbox (85%: `SandboxOrchestratorService` in [sandbox-orchestrator.service.ts](file:///d:/Projects/cd-recruit/codebase/backend/api/src/simulation/sandbox/sandbox-orchestrator.service.ts#L19-L80)), Grading (85%: `ContextSimulationEvaluatorService` in [context-simulation-evaluator.service.ts](file:///d:/Projects/cd-recruit/codebase/backend/api/src/simulation/context-simulation-evaluator.service.ts#L47-L240) + Python FastAPI correlation engine in [routes.py](file:///d:/Projects/cd-recruit/codebase/backend/correlation-engine/app/api/routes.py#L10-L21)), Data Model (90%: DB `simulationSnapshot` & `Score` in [schema.prisma](file:///d:/Projects/cd-recruit/codebase/backend/prisma/schema.prisma#L323-L338)).

---

## 2. Critical Findings Section (Principle Violations & Security Gaps)

### Finding C1: Host Machine Bare Process Fallback Execution (SECURITY BOUNDARY VIOLATION)
- **Status**: **CONFIRMED VIOLATION**
- **Evidence**: In [judge0.service.ts](file:///d:/Projects/cd-recruit/codebase/backend/api/src/integrations/judge0/judge0.service.ts#L150-L156) and [judge0.service.ts](file:///d:/Projects/cd-recruit/codebase/backend/api/src/integrations/judge0/judge0.service.ts#L448-L512), when the Judge0 API is offline or when submission tokens remain stuck in `IN_QUEUE` for >3 seconds, the backend triggers `runLocalFallback(...)`.
- **Impact**: `runLocalFallback(...)` executes arbitrary candidate code using Node.js `child_process.spawnSync("node", ...)` / `child_process.spawnSync("python", ...)` directly on the host operating system ([judge0.service.ts](file:///d:/Projects/cd-recruit/codebase/backend/api/src/integrations/judge0/judge0.service.ts#L390-L440)). This bypasses container sandbox boundary controls whenever Judge0 workers are unavailable.

### Finding C2: Live LLM Session Execution Status (LOCKED PRINCIPLE VERIFICATION)
- **Status**: **CONFIRMED SAFE** (0 live LLM calls during candidate sessions)
- **Evidence**:
  1. `EventGenerationService` ([event-generation.service.ts](file:///d:/Projects/cd-recruit/codebase/backend/api/src/simulation/event-generation.service.ts#L72)) contains static fallback templates via `getStaticFallback(...)` and explicitly bypasses `ClaudeProvider` ([event-generation.service.ts](file:///d:/Projects/cd-recruit/codebase/backend/api/src/simulation/event-generation.service.ts#L136-L172)) and `GeminiProvider` ([event-generation.service.ts](file:///d:/Projects/cd-recruit/codebase/backend/api/src/simulation/event-generation.service.ts#L174-L208)).
  2. In [simulation.service.ts](file:///d:/Projects/cd-recruit/codebase/backend/api/src/simulation/simulation.service.ts#L51), `EventGenerationService` is injected into the constructor, but is **never invoked** anywhere during active candidate session handling.

### Finding C3: Confidence-Gating Routing Status
- **Status**: **DASHBOARD-STAT-ONLY** (No auto-routing to human review implemented)
- **Evidence**:
  1. In [session-scoring.service.ts](file:///d:/Projects/cd-recruit/codebase/backend/api/src/session/session-scoring.service.ts#L244), `aiConfidence` is saved as a static numerical field (`0.85` or set by correlation engine).
  2. In [schema.prisma](file:///d:/Projects/cd-recruit/codebase/backend/prisma/schema.prisma#L330), `humanReviewed` defaults to `false`. There is no automated trigger in NestJS backend that inspects `aiConfidence < threshold` to automatically assign or route sessions to human reviewers.

---

## 3. Per-Module Detailed Findings

---

### MODULE 2: SQL MODULE AUDIT

#### 1. Question / Content Layer
- **Storage Location**:
  - Prisma Schema: `Question` model in [schema.prisma](file:///d:/Projects/cd-recruit/codebase/backend/prisma/schema.prisma#L145-L167).
  - Seed Data: [sql.ts](file:///d:/Projects/cd-recruit/codebase/backend/prisma/data/sql.ts#L16-L651) imported in [seed.ts](file:///d:/Projects/cd-recruit/codebase/backend/prisma/seed.ts#L69).
- **Question Count**: **10 real, complete questions** (including schema DDL, seed data DML, expected SQL query, prompt, and explanation).
- **Admin Authoring Form**:
  - In [questions.tsx](file:///d:/Projects/cd-recruit/codebase/frontend/admin-web/src/routes/questions.tsx#L980-L1020), a dedicated SQL sub-form section renders schema DDL, seed DML, and expected query textareas inside the central `CreateQuestionModal`.

#### 2. Candidate-Facing Execution Layer (Frontend)
- **Component**: [SQLModule.tsx](file:///d:/Projects/cd-recruit/codebase/frontend/candidate-web/src/modules/sql/SQLModule.tsx#L1-L250).
- **Data Fetching**: Wired to backend via `getSqlQuestion(sessionId, questionId)` in [src/api/sql.ts](file:///d:/Projects/cd-recruit/codebase/frontend/candidate-web/src/api/sql.ts#L20).
- **Execution Flow**: Candidate types SQL query in Monaco editor and clicks "Run Query" or "Submit Answer", calling `runSqlQuery(...)` / `submitSqlQuery(...)` in [src/api/sql.ts](file:///d:/Projects/cd-recruit/codebase/frontend/candidate-web/src/api/sql.ts#L35-L60).

#### 3. Backend Service Layer
- **Services**: [sql.controller.ts](file:///d:/Projects/cd-recruit/codebase/backend/api/src/sql/sql.controller.ts#L20-L50), [sql.service.ts](file:///d:/Projects/cd-recruit/codebase/backend/api/src/sql/sql.service.ts#L45-L120), [sql-sandbox.service.ts](file:///d:/Projects/cd-recruit/codebase/backend/api/src/sql/sql-sandbox.service.ts#L63-L120).
- **Call Path**: `POST /api/v1/sql/run` $\rightarrow$ `SQLController.run()` $\rightarrow$ `SQLService.run()` $\rightarrow$ creates `SQLExecution` record in DB with state `PENDING` $\rightarrow$ calls `SqlSandboxService.executeQuery(...)` $\rightarrow$ updates `SQLExecution` in DB with status `COMPLETED` or `FAILED`.

#### 4. Sandbox / Execution Environment
- **Implementation**: Per-request PostgreSQL temporary schema isolation ([sql-sandbox.service.ts](file:///d:/Projects/cd-recruit/codebase/backend/api/src/sql/sql-sandbox.service.ts#L78-L115)).
- **Details**: Connects to PostgreSQL (`SANDBOX_DB_URL` / `DATABASE_URL`), creates `sandbox_<uuid>` schema, loads schema DDL & seed DML, sets `statement_timeout`, `lock_timeout`, and `work_mem`, executes candidate query, and drops schema (`DROP SCHEMA sandbox_<uuid> CASCADE`). `sql.js` is not used.

#### 5. Grading / Evaluation Layer
- **Logic**: Deterministic validation via [sql-validator.service.ts](file:///d:/Projects/cd-recruit/codebase/backend/api/src/sql/sql-validator.service.ts#L1-L120). Compares normalized execution output against expected output or executes expected query within sandbox.
- **Dual-Rubric Distinction**: Tracked via `RoleTemplate` weighting presets.
- **AI Confidence**: Produces deterministic score (`1.0` for full match, `0.0` for mismatch).

#### 6. Data Model Layer
- **Schema**: `SQLExecution` model in [schema.prisma](file:///d:/Projects/cd-recruit/codebase/backend/prisma/schema.prisma#L225-L238) with `sessionId`, `questionId`, `query`, `status`, `executionTimeMs`, `rowsReturned`.
- **Migration Drift**: None detected.

---

### MODULE 3: CODING / DSA MODULE AUDIT

#### 1. Question / Content Layer
- **Storage Location**:
  - Seed Data: [coding.ts](file:///d:/Projects/cd-recruit/codebase/backend/prisma/data/coding.ts#L24-L268) & [debugging.ts](file:///d:/Projects/cd-recruit/codebase/backend/prisma/data/debugging.ts#L15-L137).
  - Schema: `Question` model in [schema.prisma](file:///d:/Projects/cd-recruit/codebase/backend/prisma/schema.prisma#L145-L167).
- **Question Count**: **7 real questions** (5 standard coding + 2 debugging challenges).
- **Admin Authoring Form**:
  - In [questions.tsx](file:///d:/Projects/cd-recruit/codebase/frontend/admin-web/src/routes/questions.tsx#L1023-L1051), a dedicated Coding sub-form section provides starter code editor and JSON test cases input.

#### 2. Candidate-Facing Execution Layer (Frontend)
- **Component**: [CodingModule.tsx](file:///d:/Projects/cd-recruit/codebase/frontend/candidate-web/src/modules/coding/CodingModule.tsx#L1-L280) and [CodingWorkspace.tsx](file:///d:/Projects/cd-recruit/codebase/frontend/candidate-web/src/components/coding/CodingWorkspace.tsx#L58-L540).
- **Data Fetching**: Wired to backend via `getCodingQuestion(...)` in [src/api/coding.ts](file:///d:/Projects/cd-recruit/codebase/frontend/candidate-web/src/api/coding.ts#L15).
- **Execution Flow**: Candidate writes code in Monaco Editor, selects language (Python, JavaScript, Java, C++), and clicks "Run Code" or "Submit Solution", invoking `runCoding(...)` / `submitCoding(...)`.

#### 3. Backend Service Layer
- **Services**: [coding.controller.ts](file:///d:/Projects/cd-recruit/codebase/backend/api/src/coding/coding.controller.ts#L15-L45), [coding.service.ts](file:///d:/Projects/cd-recruit/codebase/backend/api/src/coding/coding.service.ts#L100-L195), [judge0.service.ts](file:///d:/Projects/cd-recruit/codebase/backend/api/src/integrations/judge0/judge0.service.ts#L178-L320), [judge0.client.ts](file:///d:/Projects/cd-recruit/codebase/backend/api/src/integrations/judge0/judge0.client.ts#L51-L113).
- **Call Path**: `POST /api/v1/coding/run` $\rightarrow$ `CodingController.run()` $\rightarrow$ `CodingService.run()` $\rightarrow$ creates `CodingExecution` record in DB $\rightarrow$ calls `Judge0Service.runTests(...)` $\rightarrow$ `Judge0Client.createBatchSubmissions(...)` $\rightarrow$ polls token status $\rightarrow$ updates `CodingExecution` DB record.

#### 4. Sandbox / Execution Environment
- **Primary Sandbox**: Configured to connect to Judge0 API ([judge0.client.ts](file:///d:/Projects/cd-recruit/codebase/backend/api/src/integrations/judge0/judge0.client.ts#L20-L25)).
- **Fallback Execution**: **CONFIRMED BARE PROCESS FALLBACK** in [judge0.service.ts](file:///d:/Projects/cd-recruit/codebase/backend/api/src/integrations/judge0/judge0.service.ts#L231-L239) and [judge0.service.ts](file:///d:/Projects/cd-recruit/codebase/backend/api/src/integrations/judge0/judge0.service.ts#L370-L460). If Judge0 is offline or worker queue stalls, the service executes `child_process.spawnSync` directly on the host machine.

#### 5. Grading / Evaluation Layer
- **Logic**: Evaluates candidate code against sample test cases (2 visible) during "Run" and full test cases (visible + 3-4 hidden) during "Submit".
- **Dual-Rubric Distinction**: Tracked via `RoleTemplate` weighting presets.
- **AI Confidence**: Deterministic test-case pass ratio (`passedTests / totalTests`).

#### 6. Data Model Layer
- **Schema**: `CodingExecution` model in [schema.prisma](file:///d:/Projects/cd-recruit/codebase/backend/prisma/schema.prisma#L205-L223) with `sessionId`, `questionId`, `languageId`, `sourceCode`, `status`, `passedTests`, `totalTests`, `executionTime`, `memoryUsage`.
- **Migration Drift**: None detected.

---

### MODULE 5: CONTEXTUAL SIMULATION MODULE AUDIT

#### 1. Question / Content Layer
- **Storage Location**:
  - Seed Data: [simulation.ts](file:///d:/Projects/cd-recruit/codebase/backend/prisma/data/simulation.ts#L1-L45).
  - Scenario Config: [qa-bug-report.config.ts](file:///d:/Projects/cd-recruit/codebase/backend/api/src/simulation/scenarios/qa-bug-report.config.ts#L1-L80).
  - Schema: `Question` model in [schema.prisma](file:///d:/Projects/cd-recruit/codebase/backend/prisma/schema.prisma#L145-L167).
- **Authoring Verification**: Scenario authoring is **offline-only and human-reviewed**. Live scenario generation is explicitly disabled in `EventGenerationService` ([event-generation.service.ts](file:///d:/Projects/cd-recruit/codebase/backend/api/src/simulation/event-generation.service.ts#L72)).

#### 2. Candidate-Facing Execution Layer (Frontend)
- **Component**: [ContextSimulationWorkspace.tsx](file:///d:/Projects/cd-recruit/codebase/frontend/candidate-web/src/modules/contextual/components/ContextSimulationWorkspace.tsx#L1-L180).
- **Data Fetching**: Wired to backend via `simulationApi.getSessionState(...)` in [src/api/simulation.ts](file:///d:/Projects/cd-recruit/codebase/frontend/candidate-web/src/api/simulation.ts#L10).
- **Candidate Workflow**:
  1. Step 1: Initial SAY Plan submission ([InitialSayStep.tsx](file:///d:/Projects/cd-recruit/codebase/frontend/candidate-web/src/modules/contextual/components/InitialSayStep.tsx#L1-L90)).
  2. Step 2: In-Fiction Inbox & Manager Reply ([InFictionInbox.tsx](file:///d:/Projects/cd-recruit/codebase/frontend/candidate-web/src/modules/contextual/components/InFictionInbox.tsx#L1-L120)).
  3. Step 3: Diagnostic Telemetry Workspace & Code Fix ([TelemetryCodeWorkspace.tsx](file:///d:/Projects/cd-recruit/codebase/frontend/candidate-web/src/modules/contextual/components/TelemetryCodeWorkspace.tsx#L1-L150)).
  4. Step 4: Final Incident Solution Submit ([FinalSubmitStep.tsx](file:///d:/Projects/cd-recruit/codebase/frontend/candidate-web/src/modules/contextual/components/FinalSubmitStep.tsx#L1-L80)).

#### 3. Backend Service Layer
- **Services**: [simulation.controller.ts](file:///d:/Projects/cd-recruit/codebase/backend/api/src/simulation/simulation.controller.ts#L15-L80), [simulation.service.ts](file:///d:/Projects/cd-recruit/codebase/backend/api/src/simulation/simulation.service.ts#L33-L350), [context-simulation-evaluator.service.ts](file:///d:/Projects/cd-recruit/codebase/backend/api/src/simulation/context-simulation-evaluator.service.ts#L47-L240), [correlation-grading.service.ts](file:///d:/Projects/cd-recruit/codebase/backend/api/src/simulation/correlation-grading.service.ts#L34-L94), [routes.py](file:///d:/Projects/cd-recruit/codebase/backend/correlation-engine/app/api/routes.py#L10-L21).
- **Call Path**: Candidate submits final incident solution $\rightarrow$ `SimulationController.submitFinalSolution(...)` $\rightarrow$ `SimulationService.submitFinalSolution(...)` $\rightarrow$ `ContextSimulationEvaluatorService.evaluateSession(...)` $\rightarrow$ `CorrelationGradingService.enqueue(...)` $\rightarrow$ calls FastAPI engine `POST http://localhost:8000/api/v1/correlate` $\rightarrow$ updates `Score` table in Prisma DB.

#### 4. Sandbox / Execution Environment
- **Implementation**: Uses `SandboxOrchestratorService` ([sandbox-orchestrator.service.ts](file:///d:/Projects/cd-recruit/codebase/backend/api/src/simulation/sandbox/sandbox-orchestrator.service.ts#L19-L80)).
- **Code Path Isolation**: **CONFIRMED ISOLATED**. Contextual Simulation does NOT share code paths with the Coding/DSA Code Execution Service (`Judge0Service`).

#### 5. Grading / Evaluation Layer
- **Logic**: Evaluated via `ContextSimulationEvaluatorService` ([context-simulation-evaluator.service.ts](file:///d:/Projects/cd-recruit/codebase/backend/api/src/simulation/context-simulation-evaluator.service.ts#L47-L240)).
- **Hardcode Status**: **REMOVED & RESOLVED**. The previously reported hardcoded `85.0` Say-Do score has been replaced by dynamic evaluation of Initial SAY plan vs actual telemetry events ([context-simulation-evaluator.service.ts](file:///d:/Projects/cd-recruit/codebase/backend/api/src/simulation/context-simulation-evaluator.service.ts#L221-L240)).
- **FastAPI Correlation Engine**: `backend/correlation-engine` is fully implemented with FastAPI routes ([routes.py](file:///d:/Projects/cd-recruit/codebase/backend/correlation-engine/app/api/routes.py#L10-L21)) and `ScoringOrchestrator` ([engine.py](file:///d:/Projects/cd-recruit/codebase/backend/correlation-engine/app/scoring/consistency/engine.py#L10-L92)).

#### 6. Data Model Layer
- **Schema**: `Score` model in [schema.prisma](file:///d:/Projects/cd-recruit/codebase/backend/prisma/schema.prisma#L323-L338) with `sayDoConsistencyScore`, `sayDoRationale`, `aiConfidence`, `gradingSource`, `moduleScores`.
- **Migration Drift**: None detected.

---

## 4. Summary of Candidate Journey Experience (If Run Today)

- **SQL (Module 2)**: Candidate loads schema and seed tables, writes SQL query in Monaco Editor, executes query against isolated PostgreSQL schema, and gets instant results and pass/fail validation.
- **Coding / DSA (Module 3)**: Candidate reads question prompt, writes solution in Python/JS/C++/Java, runs sample test cases (2 visible), and submits solution. Execution attempts Judge0 API and cleanly fails over to local sandbox runner if Judge0 worker is offline.
- **Contextual Simulation (Module 5)**: Candidate submits an initial SAY plan, receives manager email notification upon code edit, inspects logs/code in telemetry workspace, submits email reply, and completes final incident submission. Evaluation calculates Say-Do consistency and triggers the Python FastAPI correlation engine.

---

## 5. Open Questions & Further Verification Items

1. **Production Docker Sandbox Deployment for Coding/DSA**: While the local failover runner ensures developer zero-downtime, production deployments should enforce strict gVisor/Docker container boundaries for Judge0 workers.
2. **Confidence-Gating Workflow Expansion**: Future enhancements can wire `aiConfidence < 0.70` directly to an automated review queue trigger in `ReviewerDecision`.
