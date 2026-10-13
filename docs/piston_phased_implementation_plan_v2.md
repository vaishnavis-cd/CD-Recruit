# CD-Recruit: Piston Migration Implementation Plan (v2 - Local Docker Scope)
**Author:** Senior System Architect & Reviewer  
**Date:** 12 Oct 2026  
**Status:** Approved for Local Development Execution  
**Target Codebase:** `e:\CTP\cd-recruit`  

---

## 1. Changelog (v1 $\rightarrow$ v2)

This plan supersedes `piston_phased_implementation_plan.md` (v1) based on direct verification against the active codebase and official Piston documentation:

| Claim # | Category | Change in v2 | Rationale & Code Evidence |
|:---|:---|:---|:---|
| **A1** | Infrastructure | **Inverted cgroup requirement in Phase 0** | Piston requires **cgroup v2 enabled and v1 disabled**. Deleted `systemd.unified_cgroup_hierarchy=0` (which forced v1). Added verification for host `CgroupVersion == 2`. |
| **A2** | Container | **Pinned Docker container tag** | Replaced `ghcr.io/engineer-man/piston:latest` with pinned version/tag `ghcr.io/engineer-man/piston:v2.0.0` (or pinned git commit SHA). |
| **A3** | Local Dev | **WSL2 prerequisite documented** | Added explicit Windows dev requirement: Docker Desktop must run on WSL2 backend; native Windows containers cannot run Piston cgroups. |
| **A4** | Configuration | **Explicit Piston environment limits** | Added `PISTON_OUTPUT_MAX_SIZE=65536` (raised from default 1024 chars), `PISTON_MAX_CONCURRENT_JOBS=4` (local), and `PISTON_MAX_PROCESS_COUNT=256` for JVM threads. |
| **A5** | Code Contract | **Java filename rule enforced** | Added requirement in `PistonService`: Java files must be sent with `name: "Solution.java"` so `javac` does not fail with class-name mismatches. |
| **A6 & A7** | Engine Signals | **Disproved imaginary status codes** | Removed all references to Isolate status codes (`TO`, `RE`, `SG`, `OL`, `EL`, `XX`). Response is parsed from `code: number \| null` and `signal: string \| null`. Wall-clock execution time is measured by worker. |
| **B8** | Resilience | **Per-case error handling in worker** | Replaced fragile `Promise.all` with `Promise.allSettled` and per-case `try/catch`. Catch network errors individually; skip already-accumulated cases on retry. |
| **B9** | Local Dev | **Local worker concurrency throttled** | Fixed local concurrency mismatch: reduced local worker concurrency from 50 to **2** with `p-limit(2)` to match local Piston capacity (4 slots) and prevent 15s timeout drops. |
| **B10** | Queue Hand-off | **Deterministic outbound BullMQ jobId** | Removed single-shot Redis NX lock deadlock risk. Outbound queue enqueue now uses deterministic `jobId: "outbound-" + executionId`. |
| **B11** | Watchdog | **Fixed orphan detection false-failures** | `bullmq-queue.provider.ts` has `removeOnComplete: true`. Watchdog now checks PostgreSQL `status !== 'PENDING'` first to prevent marking completed jobs as `FAILED`. |
| **B12 & B13**| Contracts | **Lua caseIndex & CaseResult DTO** | Lua script keyed by `caseIndex` (`ARGV[1]`). Outbound processor decoupled from Judge0 base64/status IDs using normalized `CaseResult` DTO. |
| **B14** | Comparator | **Whitespace preservation verified** | Preserved exact regex `replace(/\s+/g, "").trim().toLowerCase()` in standalone `output-comparator.util.ts`. |
| **B15** | Refactoring | **Deduplicated test case parser** | Extracted `getQuestionTestCases` from 3 duplicated files into `test-case.util.ts`. |
| **B16** | Scope | **Deferred dual-provider interface** | Direct replacement of `Judge0Service` with `PistonService`. No runtime feature-flag DI bloat needed for local dev. |
| **B17** | Data Model | **Deferred relational case result table** | Kept JSON payload storage in `ModuleResponse.responsePayload`. Deferred `CodingTestCaseResult` table to production hardening. |
| **B18** | Queueing | **Run vs Submit queue priority** | Added `{ priority: 1 }` for Run and `{ priority: 2 }` for Submit to guarantee interactive Run responsiveness. |
| **B20** | Dependencies | **Pinned `p-limit` to v3.1.0 (CommonJS)** | `backend/api` is CommonJS (`tsconfig.json: "module": "commonjs"`). Pinned `p-limit@^3.1.0` to avoid `ERR_REQUIRE_ESM`. |
| **B21** | Client UX | **Synchronized frontend and backend timeouts** | Raised backend SSE timeout to 90s + keepalive. Increased frontend `pollExecution` in `CodingWorkspace.tsx` from 60 attempts (18s) to 300 attempts (90s). |
| **C22–C26** | Scope | **Production items cleanly deferred** | Moved AWS ECS, ALB, IMDSv2, Autoscaling metrics, and ElastiCache HA to Section 4 ("Deferred (Before Production)") with explicit trigger conditions. |

---

## 2. Local Development Scope & Guiding Principles

1. **Local Docker Focus:** All components run on the local developer machine via Docker and `npm run start:dev`. No AWS resources are invoked.
2. **Zero Code Duplication:** Shared utilities are extracted and tested before execution paths are modified.
3. **Parity Preservation:** Existing questions in CD-Recruit must grade identically under Piston and Judge0.
4. **Step-by-Step Testability:** Each phase produces unit and integration test coverage proving correctness before proceeding to the next.

---

## 3. Local Development Execution Phases

```
  [ Phase 0: Environment Setup & Measurement Spike ]
            │ (Docker Compose, cgroup v2 verification, latency baseline)
            ▼
  [ Phase 1: Shared Core Foundation & Utilities ]
            │ (test-case.util.ts, output-comparator.util.ts, CaseResult DTO)
            ▼
  [ Phase 2: Piston Client & Atomic Lua Accumulator ]
            │ (PistonService HTTP client, caseIndex Lua accumulator)
            ▼
  [ Phase 3: Worker Execution Pipeline & Outbound Processing ]
            │ (execution-inbound with p-limit(2), execution-outbound with CaseResult)
            ▼
  [ Phase 4: Client Safety & Watchdog Reconciliation ]
            │ (SSE 90s timeout + keepalive, frontend poll fix, watchdog DB check)
            ▼
  [ Phase 5: Integration, Parity Testing & API Contract Verification ]
            │ (CODING_MODULE_API_CONTRACT suite, multi-language parity)
            ▼
  [ Phase 6: Codebase Clean-up & Deprecation ]
            │ (Remove Judge0 files, remove GPL-3.0 dependencies)
```

---

### Phase 0: Environment Setup & Measurement Spike

**Goal:** Establish a pinned local Piston container with cgroup v2, verify language packages, and run an empirical benchmark spike to determine local latency and process boundaries.  
**Rough Estimate:** 1 – 2 Days

#### Tasks:
* [ ] **Task 0.1: Docker Host & WSL2 Verification (Claim A1, A3)**
  * Run `docker info --format '{{.CgroupVersion}}'` and confirm it returns `2`.
  * For Windows developers, verify Docker Desktop is running the WSL2 engine (not Hyper-V Windows containers).
* [ ] **Task 0.2: Local Docker Compose Configuration (Claims A2, A4)**
  * Create `docker/docker-compose.piston.yml` (and integrate into local `docker-compose.yml`):
    ```yaml
    piston:
      image: ghcr.io/engineer-man/piston:v2.0.0 # Pinned version
      container_name: cd-recruit-piston
      ports:
        - "2000:2000"
      environment:
        - PISTON_BIND_ADDRESS=0.0.0.0:2000
        - PISTON_MAX_CONCURRENT_JOBS=4
        - PISTON_OUTPUT_MAX_SIZE=65536 # 64KB (raised from 1024)
        - PISTON_MAX_PROCESS_COUNT=256 # Accommodate JVM threads
        - PISTON_COMPILE_TIMEOUT=10000
        - PISTON_RUN_TIMEOUT=3000
      privileged: true
      restart: unless-stopped
    ```
* [ ] **Task 0.3: Install & Pin Language Packages**
  * Boot container: `docker compose -f docker/docker-compose.piston.yml up -d`.
  * Install runtime packages via Piston CLI/API:
    * Python (`3.10.0`)
    * Java / OpenJDK (`15.0.2`)
    * GCC / C++ (`10.2.0`)
    * Node.js / JavaScript (`18.15.0`)
  * Verify via `GET http://localhost:2000/api/v2/runtimes`.
* [ ] **Task 0.4: Phase 0 Measurement Spike (Claim C26)**
  * Create scratch benchmark script `scratch/piston-benchmark.ts`.
  * Measure empirical baselines on local Docker:
    1. Python script (empty / print): wall-clock latency (ms).
    2. Java compilation + execution: wall-clock latency (ms).
    3. Multi-threaded Java program: verify thread creation up to 50 threads succeeds under `MAX_PROCESS_COUNT=256`.
    4. Infinite loop (`while(true)`): verify process is terminated cleanly with `signal: "SIGKILL"` within 3,000ms.
    5. Concurrency limit: send 4 concurrent Java jobs vs 8 concurrent Java jobs; record latency curve.

#### Exit Criteria:
* `GET http://localhost:2000/api/v2/runtimes` returns all 4 runtimes.
* Baseline latency report logged: Python latency $< 80\text{ms}$, Java compilation $< 2,500\text{ms}$.
* Java multi-threading test passes without `OutOfMemoryError`.

---

### Phase 1: Shared Core Foundation & Utilities (Zero-Risk Refactor)

**Goal:** Deduplicate test-case extraction logic, extract the output comparator, install CommonJS-compatible `p-limit`, and define normalized data contracts.  
**Rough Estimate:** 1 Day

#### Tasks:
* [ ] **Task 1.1: Install CommonJS-Compatible Concurrency Limiter (Claim B20)**
  * Install `p-limit` pinned to CommonJS version in `backend/api`:
    ```bash
    cd backend/api && npm install p-limit@^3.1.0
    ```
  * Verify TypeScript compilation succeeds without `ERR_REQUIRE_ESM`.
* [ ] **Task 1.2: Extract Unified Test-Case Extractor (Claim B15)**
  * Create `backend/api/src/common/utils/test-case.util.ts`.
  * Extract logic from `coding.service.ts` lines 59–112:
    ```typescript
    export interface ParsedTestCase {
      input: string;
      expectedOutput: string;
      isHidden: boolean;
      label: string;
    }
    export function extractTestCases(content: any, type: SubmissionType): ParsedTestCase[];
    ```
  * Write unit tests in `backend/api/src/common/utils/test-case.util.spec.ts` covering: visible only (`RUN`), visible + hidden (`SUBMIT`), empty test cases, legacy field names (`hiddenTests` vs `hiddenTestCases`).
* [ ] **Task 1.3: Extract Output Comparator (Claim B14)**
  * Create `backend/api/src/common/utils/output-comparator.util.ts`.
  * Move `normalizeOutput` from `judge0.service.ts`:
    ```typescript
    export function normalizeOutput(str: string | null | undefined): string {
      if (!str) return "";
      return str.replace(/\s+/g, "").trim().toLowerCase();
    }
    export function compareOutputs(actualStdout: string, expectedOutput: string): boolean {
      return normalizeOutput(actualStdout) === normalizeOutput(expectedOutput);
    }
    ```
  * Write unit tests in `backend/api/src/common/utils/output-comparator.util.spec.ts` validating: whitespace stripping, tabs, trailing newlines, case insensitivity.
* [ ] **Task 1.4: Define Normalized Execution DTOs (Claim B13)**
  * Create `backend/api/src/coding/dto/execution-result.dto.ts`:
    ```typescript
    export interface CaseResult {
      caseIndex: number;
      passed: boolean;
      status: ExecutionStatus;
      executionTimeMs: number;
      memoryUsageKb: number;
      stdout: string;
      stderr: string;
      compileOutput: string;
      input: string;
      expectedOutput: string;
      label: string;
      isHidden: boolean;
    }
    ```

#### Exit Criteria:
* `npm run test` passes for `test-case.util.spec.ts` and `output-comparator.util.spec.ts`.
* CommonJS module loading verified for `p-limit@3.1.0`.

---

### Phase 2: Piston Client & Atomic Lua Accumulator

**Goal:** Implement the HTTP client for Piston's `/api/v2/execute` endpoint and rewrite the atomic Lua accumulator using numeric `caseIndex`.  
**Rough Estimate:** 2 Days

#### Tasks:
* [ ] **Task 2.1: Implement `PistonService` (Claims A5, A6, A7)**
  * Create `backend/api/src/integrations/piston/piston.service.ts` and `piston.module.ts`.
  * Implement `execute(req: PistonRequest): Promise<PistonResponse>`:
    * Map language strings: `python` $\rightarrow$ `python`, `java` $\rightarrow$ `java`, `cpp` $\rightarrow$ `c++`, `javascript` $\rightarrow$ `javascript`.
    * **Enforce Java Filename Rule (Claim A5):** For `language === 'java'`, set `files: [{ name: "Solution.java", content: code }]`.
    * Timeout configuration: set Axios timeout to `15,000ms`.
  * **Parse Real Response Fields (Claim A6):**
    * Check `compile?.code`: if non-zero, map to `COMPILATION_ERROR` with `compileOutput: compile.output`.
    * Check `run?.signal`: if `SIGKILL`, map to `TIMEOUT`.
    * Check `run?.code`: if non-zero, map to `RUNTIME_ERROR`.
    * If `run?.code === 0`, call `compareOutputs()`: if match $\rightarrow$ `COMPLETED`, else $\rightarrow$ `COMPLETED` with `passed = false`.
* [ ] **Task 2.2: Implement Rewritten Lua Accumulator Script (Claim B12)**
  * Create `backend/api/src/integrations/piston/piston-accumulator.lua.ts`:
    ```lua
    -- KEYS[1]: execution:<executionId>:results  (Hash)
    -- ARGV[1]: caseIndex                       (String: "0", "1", ...)
    -- ARGV[2]: caseResultJson                  (String)
    -- ARGV[3]: totalTests                      (Integer)
    -- ARGV[4]: ttlSeconds                      (Integer)

    redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
    redis.call('EXPIRE', KEYS[1], ARGV[4])
    local currentCount = redis.call('HLEN', KEYS[1])
    local targetCount = tonumber(ARGV[3])

    if currentCount >= targetCount then
        return 1 -- All test cases accumulated!
    end
    return 0
    ```
  * Note: Removed fragile NX single-shot lock (handled via BullMQ deterministic jobId in Phase 3).
* [ ] **Task 2.3: Unit Test Piston Integration**
  * Write `piston.service.spec.ts` mocking Piston HTTP responses (normal execution, compile error, SIGKILL timeout, runtime error).
  * Write integration test against running local Piston container.

#### Exit Criteria:
* `PistonService` successfully compiles and runs Python, Java, C++, and JS against local Piston container.
* Lua script tested in Redis: verifies atomic counting and returns `1` when `HLEN == targetCount`.

---

### Phase 3: Worker Execution Pipeline & Outbound Processing

**Goal:** Update `InboundExecutionProcessor` to dispatch jobs to Piston using `p-limit(2)` and update `OutboundExecutionProcessor` to read normalized `CaseResult` DTOs.  
**Rough Estimate:** 2 – 3 Days

#### Tasks:
* [ ] **Task 3.1: Refactor `InboundExecutionProcessor` (Claims B8, B9, B10, B18)**
  * File: `backend/api/src/queue/execution/execution-inbound.processor.ts`
  * **Configure Local Concurrency (Claim B9):** Set `@Processor("execution-inbound", { concurrency: 2 })` for local development.
  * Inject `PistonService` instead of `Judge0Client`.
  * Replace test case extraction with `extractTestCases()`.
  * Implement throttled execution with `p-limit(2)` and **per-case error handling (Claim B8):**
    ```typescript
    const limit = pLimit(2); // Local dev concurrency limit
    const casePromises = testCases.map((tc, index) => limit(async () => {
      const startTime = Date.now();
      try {
        const rawRes = await this.pistonService.execute({ ... });
        const caseResult = this.evaluateCase(rawRes, tc, index, Date.now() - startTime);
        const isComplete = await this.recordCaseResultLua(executionId, index, testCases.length, caseResult);
        return { index, isComplete };
      } catch (err: any) {
        // Infra error handling: record case failure without crashing entire batch
        const failedCase = this.createInfraFailureResult(tc, index, err.message);
        const isComplete = await this.recordCaseResultLua(executionId, index, testCases.length, failedCase);
        return { index, isComplete };
      }
    }));
    const settled = await Promise.all(casePromises);
    ```
  * **Deterministic Outbound Hand-off (Claim B10):**
    ```typescript
    if (settled.some(r => r.isComplete === 1)) {
      await this.queueProvider.enqueue(
        "execution-outbound",
        "save-result",
        { executionId, totalTests: testCases.length },
        { jobId: `outbound-${executionId}` } // Native BullMQ deduplication
      );
    }
    ```
* [ ] **Task 3.2: Configure Run vs Submit Queue Priority (Claim B18)**
  * File: `backend/api/src/coding/coding.service.ts`
  * In `run()`: pass `{ priority: 1 }` when enqueuing `execution-inbound`.
  * In `submit()`: pass `{ priority: 2 }` when enqueuing `execution-inbound`.
* [ ] **Task 3.3: Refactor `OutboundExecutionProcessor` (Claims B12, B13, B17)**
  * File: `backend/api/src/queue/execution/execution-outbound.processor.ts`
  * Remove `Judge0Service` dependencies (`decodeBase64`, `mapStatus`, `judge0Tokens`).
  * Read results by index from Redis:
    ```typescript
    const rawResults = await this.redisService.hgetall(`execution:${executionId}:results`);
    const detailedResults: CaseResult[] = [];
    for (let i = 0; i < totalTests; i++) {
      const caseJson = rawResults[String(i)];
      detailedResults.push(caseJson ? JSON.parse(caseJson) : this.createMissingCaseResult(i));
    }
    ```
  * Aggregate verdict and total execution time.
  * Update PostgreSQL: `CodingExecution` status $\rightarrow$ `COMPLETED`, `passedTests`, `totalTests`, `executionTime`, `memoryUsage`.
  * Write JSON payload into `ModuleResponse.responsePayload` (Claim B17).
  * Publish completion event to Redis Pub/Sub: `execution:events:${executionId}`.

#### Exit Criteria:
* Submitting code via API successfully triggers Inbound Worker $\rightarrow$ Piston $\rightarrow$ Lua Accumulator $\rightarrow$ Outbound Worker $\rightarrow$ PostgreSQL update.
* Zero Base64 decoding or Judge0 token references in the pipeline.

---

### Phase 4: Client Safety & Watchdog Reconciliation

**Goal:** Ensure client connections never time out prematurely during bursts and prevent the watchdog from falsely failing completed executions.  
**Rough Estimate:** 1 – 2 Days

#### Tasks:
* [ ] **Task 4.1: Extend Backend SSE Timeout & Add Heartbeat (Claim B21)**
  * File: `backend/api/src/coding/coding.service.ts`
  * In `getExecutionEvents(id)`:
    * Change safety timeout from `35000` to `90000` (90 seconds).
    * Set heartbeat interval to emit `:keepalive\n\n` comments every 5 seconds (line 378).
* [ ] **Task 4.2: Extend Frontend Polling Timeout (Claim B21)**
  * File: `frontend/candidate-web/src/components/coding/CodingWorkspace.tsx`
  * In `pollExecution(executionId, maxAttempts)` (line 294):
    * Change default `maxAttempts = 60` to `maxAttempts = 300` (300 attempts $\times$ 300ms = 90 seconds).
    * Synchronizes frontend polling ceiling with backend SSE ceiling.
* [ ] **Task 4.3: Refactor Watchdog Reconciler (Claim B11)**
  * File: `backend/api/src/queue/execution/execution-watchdog.processor.ts`
  * Check PostgreSQL `CodingExecution.status` before doing anything:
    ```typescript
    const execution = await this.prisma.codingExecution.findUnique({ where: { id: executionId } });
    if (!execution || execution.status !== ExecutionStatus.PENDING) {
      // Execution completed normally (even if BullMQ removed the job)
      return;
    }
    ```
  * If still `PENDING`, inspect Redis key `execution:${executionId}:inbound-start`:
    * If active and within grace period (90s): leave alone.
    * If past grace period: mark as `TIMEOUT` in PostgreSQL and log alert.

#### Exit Criteria:
* Long-running executions (e.g. 20s Java suite) stay connected on frontend without timeout errors.
* Watchdog cleanly ignores completed executions whose BullMQ jobs were purged.

---

### Phase 5: Integration, Parity Testing & API Contract Verification

**Goal:** Execute full integration tests against `CODING_MODULE_API_CONTRACT.md` and verify 100% verdict parity across all languages.  
**Rough Estimate:** 2 Days

#### Tasks:
* [ ] **Task 5.1: API Contract Suite Execution**
  * Execute test suites matching all endpoints in `e:\CTP\CODING_MODULE_API_CONTRACT.md`:
    * `POST /coding/run` (sample test cases)
    * `POST /coding/submit` (all test cases)
    * `GET /coding/execution/:id/events` (SSE real-time stream)
    * `GET /coding/execution/:id` (polling status endpoint)
* [ ] **Task 5.2: Multi-Language Parity & Edge Case Replay**
  * Create automated test suite `tests/piston-parity.e2e-spec.ts`:
    1. **Python 3:** Valid solution (`ACCEPTED`), wrong logic (`WRONG_ANSWER`), syntax error (`COMPILATION_ERROR`), `while True` (`TIMEOUT`).
    2. **Java:** Valid solution with `public class Solution` (`ACCEPTED`), compilation failure (`COMPILATION_ERROR`), multi-threading test (50 threads).
    3. **C++:** Valid solution (`ACCEPTED`), segmentation fault (`RUNTIME_ERROR`), infinite loop (`TIMEOUT`).
    4. **JavaScript:** Valid solution (`ACCEPTED`), thrown exception (`RUNTIME_ERROR`).
* [ ] **Task 5.3: Concurrency Stress Test**
  * Send 10 concurrent submissions to local backend; verify BullMQ smoothly processes them 2 at a time without dropping requests or exceeding Piston slots.

#### Exit Criteria:
* 100% passing results on all `CODING_MODULE_API_CONTRACT.md` scenarios.
* Zero regressions in scoring.

---

### Phase 6: Codebase Clean-up & Deprecation

**Goal:** Remove all Judge0 legacy code, Docker artifacts, and GPL-3.0 dependencies.  
**Rough Estimate:** 1 Day

#### Tasks:
* [ ] **Task 6.1: Delete Judge0 Module & Files**
  * Delete `backend/api/src/integrations/judge0/` directory:
    * `judge0.client.ts`
    * `judge0.service.ts`
    * `judge0.module.ts`
    * `judge0-webhook.controller.ts`
    * `judge0-webhook.guard.ts`
    * `judge0-webhook.lua.ts`
* [ ] **Task 6.2: Clean Module Imports**
  * Remove `Judge0Module` from `backend/api/src/queue/queue.module.ts` (line 29) and `backend/api/src/app.module.ts`.
  * Replace `Judge0Service` injection in `backend/api/src/coding/coding.service.ts` with `PistonService`.
* [ ] **Task 6.3: Delete Judge0 Docker Files**
  * Delete `docker/judge0.Dockerfile`.
  * Delete `docker-compose.judge0.yml`.
  * Remove Judge0 environment variables from `.env.example`.

#### Exit Criteria:
* `npm run build` passes with zero errors.
* Codebase is completely free of Judge0 code, webhooks, and GPL-3.0 copyleft liability.

---

## 4. Deferred (Before Production) Section

These items are verified as valid production requirements, but are **strictly deferred** from local Docker development. Each item has an explicit trigger condition:

| Item # | Production Requirement | Trigger Condition for Implementation | Action Required at Trigger |
|:---|:---|:---|:---|
| **C22** | **AWS ECS on EC2 with Privileged Mode** | Transitioning to AWS staging environment (Terraform / CloudFormation). | Create ECS EC2 launch template with dedicated instance types (`c6i.2xlarge`). Enforce `privileged: true`. Do NOT use Fargate. |
| **C22** | **ALB Least-Outstanding-Requests Routing** | Multi-node Piston cluster deployment in AWS VPC. | Configure internal ALB listener rule with `routing_algorithm.type = "least_outstanding_requests"` on port 2000. |
| **C22** | **ALB Startup Smoke-Run Health Check** | Staging multi-host autoscaling testing. | Replace simple health check with endpoint verifying Python, Java, and C++ smoke execution before marking host healthy. |
| **C23** | **Security Hardening (IMDSv2, Private Subnets, No Public Auth)** | AWS Security & Compliance Review. | Set IMDSv2 `http_put_response_hop_limit = 1`. Place Piston in private VPC subnets with Security Group accepting port 2000 ONLY from NestJS Worker tasks. |
| **C24** | **Queue-Depth CloudWatch Metrics Publisher** | AWS Auto Scaling Group configuration. | Implement `QueueMetricsService` publishing `ExecutionQueueDepth` to CloudWatch every 15s. Attach Target Tracking scaling policy to Piston ASG. |
| **C24** | **Campus Drive Pre-Scaling Automation** | First live enterprise campus hiring drive ($> 500$ candidates). | Implement scheduled scaling action or EventBridge cron scaling cluster up 15–20 minutes before drive start. |
| **C25** | **Redis ElastiCache HA & Cluster Hash Tags** | Production database infrastructure setup. | Ensure ElastiCache Redis has Multi-AZ failover and `noeviction` policy. If migrating to Redis Cluster, wrap keys in `{execution:id}` hash tags. |
| **B17** | **Relational `CodingTestCaseResult` Table** | Post-launch analytics and grading review feature. | Add `CodingTestCaseResult` model to `schema.prisma`, run migration, and update Outbound Processor to write relational rows alongside JSON blob. |
| **B16** | **ExecutionProvider Dual-Engine Adapter Port** | Enterprise requirement for multi-cloud runner fallback. | Create abstract `ExecutionProviderPort` with swappable providers if multi-vendor engine support is required in the future. |

---
