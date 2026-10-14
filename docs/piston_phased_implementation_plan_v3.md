# CD-Recruit: Piston Migration Implementation Plan (v3 - Local Docker Scope)

**Author:** Senior System Architect & Reviewer  
**Date:** 12 Oct 2026  
**Status:** Ready for Review & Execution  
**Target Codebase:** `e:\CTP\cd-recruit`  
**Supersedes:** `piston_phased_implementation_plan_v2.md` and `piston_phased_implementation_plan.md`

---

## 1. Changelog (v2 $\rightarrow$ v3)

This plan incorporates all architectural review points, empirical test requirements, and codebase verifications:

| Review Point | Category | Change in v3 | Rationale & Code Cross-Reference |
|:---|:---|:---|:---|
| **Point 1** | Schema & Verdicts | **Multi-tier Verdict Mapping & Field Extraction** | Piston with Isolate integration (PR #683) returns `status` (`TO`, `RE`, `SG`, `OL`, `EL`, `XX`), `message`, `cpu_time`, `wall_time`, and `memory`. `PistonVerdictMapper` prioritizes explicit `status` when present, falling back to `code`/`signal`. `SIGKILL` is distinguished between timeout and OOM. |
| **Point 2** | Container | **Digest-based Container Pinning** | `ghcr.io/engineer-man/piston` does not have a `v2.0.0` semver release tag. Pin by immutable digest (`@sha256:...`) or release commit SHA. |
| **Point 3** | Language | **Dynamic Java Class Resolution** | `backend/prisma/data/coding.json` and `CodingWorkspace.tsx` use `public class Main`. Javac fails if named `Solution.java`. Worker extracts class name via `public class (\w+)` and defaults to `Main.java`. |
| **Point 4** | Resilience | **Infra Fault Isolation & Per-case Retry** | Worker retries transient HTTP 5xx, network drops, and internal `XX` errors 3 times with exponential backoff. Already-accumulated test cases in Redis are skipped on retry. If retries exhaust, mark `ExecutionStatus.FAILED` in DB; never mark candidate-facing `TIMEOUT` or `WRONG_ANSWER`. |
| **Point 5** | Outbound | **Outbound Processor Idempotency Guard** | `bullmq-queue.provider.ts` configures `removeOnComplete: true`, deleting jobs immediately upon completion. `OutboundExecutionProcessor` adds entry check `if (execution.status !== ExecutionStatus.PENDING) return;` and retains finished jobs (`removeOnComplete: { age: 3600, count: 5000 }`). |
| **Point 6** | Watchdog | **Authoritative BullMQ Job Inspection** | Removed fragile `inbound-start` Redis key check. Watchdog gives inbound jobs deterministic `jobId: executionId` and inspects `queue.getJob(executionId)`. If `waiting`, `active`, or `delayed`, watchdog reschedules. If all N cases exist in accumulator, it enqueues outbound. Only marks `FAILED` if job is missing. |
| **Point 7** | Frontend & SSE | **Eliminate Polling Storm & Fix SSE Race** | `CodingWorkspace.tsx` currently races 300ms polling against SSE (`Promise.race([pollExecution, SSE])`), generating ~667 req/s at 200 candidates. Polling is converted to SSE error fallback with backoff. Server SSE stream subscribes to Redis Pub/Sub *first*, then checks Redis cache, then PostgreSQL. |
| **Point 8** | Parity | **Historical Replay Harness & Preserved Judge0** | Replay harness executes all question bank test cases from `backend/prisma/data/coding.json` across Python, Java, JS, C++. Keep Judge0 runnable in `docker-compose.judge0.yml` until replay passes 100%. Require a git tag before deleting Judge0. Document compiler flag differences. |
| **Point 9** | Ergonomics | **Resource Caps, Persistent Volumes & Headroom** | Add `run_memory_limit: 256MB` and `compile_memory_limit: 512MB` to requests; mount `piston_packages:/piston/packages` persistent volume; recommend WSL2 memory cap; set worker concurrency to 1 with `p-limit(3)` (max 3 in-flight = 75% of 4 Piston slots, leaving 1 slot for headroom). Split `PistonClient` and `PistonVerdictMapper`. |
| **Point 10** | Integrity | **Aligned Metrics & Priority Semantics** | Corrected BullMQ priority semantics (lower number is higher priority: `Run` is 1, `Submit` is 5). Synchronized all verification metrics across documents. Pinned `p-limit@^3.1.0` for CommonJS compatibility. |

---

## 2. Phase 0: Empirical Spike & Container Environment

**Goal:** Launch Piston locally in Docker, install runtimes into a persistent volume, execute the empirical test suite to capture raw JSON payloads for all 6 failure modes, and verify concurrency headroom.  
**Estimated Effort:** 1.5 days  
**Exit Criteria:**
1. Piston container is running locally on WSL2 with cgroup v2.
2. Raw JSON captured and recorded for: Success, Timeout, OOM, Runtime Error, Compile Error, and Large Output.
3. Java compilation verified with both `Main.java` and `Solution.java`.
4. Concurrency benchmark confirms behavior under 4 vs 8 concurrent requests.

### Task 0.1: Docker Compose Configuration for Local Piston
Create [docker/docker-compose.piston.yml](file:///e:/CTP/cd-recruit/docker/docker-compose.piston.yml):
```yaml
version: "3.8"

services:
  piston:
    image: ghcr.io/engineer-man/piston@sha256:d5415f3cb97a610fdf480746baae3c8502f23cfc09fcc6c2ad7fc3889163df47 # Pin verified digest
    container_name: cdrecruit_piston
    privileged: true
    security_opt:
      - seccomp:unconfined
    ports:
      - "2000:2000"
    environment:
      - PISTON_BIND_ADDRESS=0.0.0.0:2000
      - PISTON_MAX_CONCURRENT_JOBS=4
      - PISTON_OUTPUT_MAX_SIZE=65536     # 64 KB output buffer
      - PISTON_COMPILE_TIMEOUT=10000    # 10s compile wall-clock cap
      - PISTON_RUN_TIMEOUT=5000         # 5s run wall-clock cap
      - PISTON_RUN_MEMORY_LIMIT=268435456 # 256 MB default run cap
      - PISTON_COMPILE_MEMORY_LIMIT=536870912 # 512 MB compile cap
    volumes:
      - piston_packages:/piston/packages
    tmpfs:
      - /tmp:exec,mode=777
    restart: unless-stopped

volumes:
  piston_packages:
    name: cdrecruit_piston_packages
```

### Task 0.2: Host Environment & Runtime Installation Commands
```bash
# 1. Verify host cgroup v2 on WSL2
docker info | grep -i cgroup
# Expected: Cgroup Version: 2

# 2. Launch Piston container
docker compose -f docker/docker-compose.piston.yml up -d

# 3. Check health and inspect available packages
curl -s http://localhost:2000/api/v2/packages

# 4. Install required runtimes (Python, Java, C++, Node.js)
docker exec -it cdrecruit_piston piston-cli install python=3.10.0
docker exec -it cdrecruit_piston piston-cli install java=15.0.2
docker exec -it cdrecruit_piston piston-cli install gcc=10.2.0
docker exec -it cdrecruit_piston piston-cli install node=18.15.0

# 5. Confirm installed runtimes via API
curl -s http://localhost:2000/api/v2/runtimes | jq .
```

### Task 0.3: Empirical Spike Suite (Capturing Raw JSON Payloads)
Execute the following curl requests and capture exact response JSON into `docs/piston-spike-results.json`:

#### Case 1: Success (Python)
```bash
curl -s -X POST http://localhost:2000/api/v2/execute -H "Content-Type: application/json" -d '{
  "language": "python",
  "version": "*",
  "files": [{"name": "solution.py", "content": "print(\"Hello World\")"}]
}' | jq .
```
*Expected Raw JSON Check:* Verify presence of `run.stdout: "Hello World\n"`, `run.code: 0`, `run.signal: null`, `run.status` (if isolate returns status), `run.cpu_time`, `run.wall_time`, `run.memory`.

#### Case 2: Timeout (Infinite Loop)
```bash
curl -s -X POST http://localhost:2000/api/v2/execute -H "Content-Type: application/json" -d '{
  "language": "python",
  "version": "*",
  "run_timeout": 1500,
  "files": [{"name": "solution.py", "content": "while True: pass"}]
}' | jq .
```
*Expected Raw JSON Check:* Verify if `run.status == "TO"` or `run.signal == "SIGKILL"`, wall_time ~ 1500ms.

#### Case 3: Over-Memory (OOM Kill)
```bash
curl -s -X POST http://localhost:2000/api/v2/execute -H "Content-Type: application/json" -d '{
  "language": "python",
  "version": "*",
  "run_memory_limit": 67108864,
  "files": [{"name": "solution.py", "content": "x = bytearray(200 * 1024 * 1024)"}]
}' | jq .
```
*Expected Raw JSON Check:* Verify if `run.status == "SG"`, `run.signal == "SIGKILL"`, or `MemoryError` in stderr. Note differences between kernel OOM and language MemoryError.

#### Case 4: Runtime Error (Non-zero exit / Exception)
```bash
curl -s -X POST http://localhost:2000/api/v2/execute -H "Content-Type: application/json" -d '{
  "language": "python",
  "version": "*",
  "files": [{"name": "solution.py", "content": "import sys; sys.exit(42)"}]
}' | jq .
```
*Expected Raw JSON Check:* Verify `run.code: 42`, `run.status == "RE"` or null.

#### Case 5: Compile Error (C++)
```bash
curl -s -X POST http://localhost:2000/api/v2/execute -H "Content-Type: application/json" -d '{
  "language": "gcc",
  "version": "*",
  "files": [{"name": "solution.cpp", "content": "int main() { syntax error; }"}]
}' | jq .
```
*Expected Raw JSON Check:* Verify `compile` object exists, `compile.code != 0`, `compile.stderr` contains compiler diagnostics.

#### Case 6: Large Output (Output Limit)
```bash
curl -s -X POST http://localhost:2000/api/v2/execute -H "Content-Type: application/json" -d '{
  "language": "python",
  "version": "*",
  "files": [{"name": "solution.py", "content": "for _ in range(50000): print(\"A\" * 100)"}]
}' | jq .
```
*Expected Raw JSON Check:* Verify truncation at `PISTON_OUTPUT_MAX_SIZE` (64 KB) or `status == "OL"`.

### Task 0.4: Java Class Resolution Spike
Test both filenames against Piston's Java runner:
```bash
# Test A: public class Main with Main.java
curl -s -X POST http://localhost:2000/api/v2/execute -H "Content-Type: application/json" -d '{
  "language": "java",
  "version": "*",
  "files": [{"name": "Main.java", "content": "public class Main { public static void main(String[] args) { System.out.println(\"Main OK\"); } }"}]
}' | jq .

# Test B: public class Main with Solution.java (Must reproduce the expected compile failure)
curl -s -X POST http://localhost:2000/api/v2/execute -H "Content-Type: application/json" -d '{
  "language": "java",
  "version": "*",
  "files": [{"name": "Solution.java", "content": "public class Main { public static void main(String[] args) { System.out.println(\"Should Fail\"); } }"}]
}' | jq .
```
*Verification:* Confirm that Test B fails with `class Main is public, should be declared in a file named Main.java`, proving that dynamic naming or defaulting to `Main.java` is strictly mandatory.

### Task 0.5: Local Concurrency & Slot Saturation Benchmark
Execute a script firing 4 concurrent Java executions, followed by 8 concurrent Java executions, measuring latency:
- At 4 concurrent requests (100% of Piston slots): verify all 4 complete within acceptable wall-clock (~1.5s).
- At 8 concurrent requests: observe Piston internal queue queuing delays and verify no requests hit the 15s HTTP client timeout.

---

## 3. Phase 1: Shared Core Utilities & DTO Contracts

**Goal:** Establish clean, decoupled TypeScript contracts and shared utilities in `backend/api/src/integrations/piston/` and `backend/api/src/common/`.  
**Estimated Effort:** 1 day  
**Exit Criteria:**
1. `p-limit@^3.1.0` pinned in `backend/api/package.json`.
2. Unified `getQuestionTestCases` helper extracted from processors.
3. Dynamic Java class resolver implemented with unit test suite.
4. Clean `CaseResult` DTO and `ExecutionEngine` abstraction created.

### Task 1.1: Dependency Setup
Pin `p-limit@^3.1.0` in `backend/api/package.json`:
```json
{
  "dependencies": {
    "p-limit": "^3.1.0"
  }
}
```
*(CommonJS compatible; avoids the `ERR_REQUIRE_ESM` crash caused by p-limit v4+).*

### Task 1.2: Normalized Execution Contracts & DTOs
Create [backend/api/src/integrations/piston/piston.contracts.ts](file:///e:/CTP/cd-recruit/backend/api/src/integrations/piston/piston.contracts.ts):
```typescript
import { ExecutionStatus } from "@cd-recruit/shared-types";

export interface PistonStageResult {
  stdout?: string;
  stderr?: string;
  output?: string;
  code?: number | null;
  signal?: string | null;
  status?: "TO" | "RE" | "SG" | "OL" | "EL" | "XX" | null;
  message?: string | null;
  cpu_time?: number | null;
  wall_time?: number | null;
  memory?: number | null;
}

export interface PistonRawResponse {
  language: string;
  version: string;
  run?: PistonStageResult;
  compile?: PistonStageResult;
  message?: string;
}

export interface CaseResult {
  caseIndex: number;
  passed: boolean;
  status: ExecutionStatus;
  executionTime: number; // in milliseconds
  memoryUsage: number;   // in KB
  stdout: string;
  stderr: string;
  compileOutput: string;
  input: string;
  expectedOutput: string;
  label: string;
  isHidden: boolean;
}

export interface ExecutionEngine {
  executeBatchCases(
    executionId: string,
    sourceCode: string,
    language: string,
    testCases: Array<{ input: string; expectedOutput: string; isHidden: boolean; label?: string }>,
  ): Promise<CaseResult[]>;
}
```

### Task 1.3: Unified Test Case Extractor & Dynamic Java Resolver
Create [backend/api/src/common/utils/test-case-parser.util.ts](file:///e:/CTP/cd-recruit/backend/api/src/common/utils/test-case-parser.util.ts):
```typescript
export function getQuestionTestCases(
  content: any,
  type: "run" | "submit",
): Array<{ input: string; expectedOutput: string; isHidden: boolean; label: string }> {
  let list: Array<{ input: string; expectedOutput: string; isHidden: boolean; label: string }> = [];

  if (Array.isArray(content?.visibleTestCases)) {
    list = content.visibleTestCases.map((tc: any, i: number) => ({
      input: tc.input || "",
      expectedOutput: tc.expectedOutput || "",
      isHidden: false,
      label: tc.label || `Visible Test Case ${i + 1}`,
    }));
  } else if (Array.isArray(content?.testCases)) {
    list = content.testCases
      .filter((tc: any) => !tc.isHidden)
      .map((tc: any, i: number) => ({
        input: tc.input || "",
        expectedOutput: tc.expectedOutput || "",
        isHidden: false,
        label: tc.label || `Visible Test Case ${i + 1}`,
      }));
  }

  if (type === "submit") {
    const rawHidden = content?.hiddenTestCases || content?.hiddenTests || [];
    if (Array.isArray(rawHidden) && rawHidden.length > 0) {
      const hiddenMapped = rawHidden.map((tc: any, i: number) => ({
        input: tc.input || "",
        expectedOutput: tc.expectedOutput || "",
        isHidden: true,
        label: tc.label || `Hidden Test Case ${i + 1}`,
      }));
      list = [...list, ...hiddenMapped];
    } else if (Array.isArray(content?.testCases)) {
      const hiddenMapped = content.testCases
        .filter((tc: any) => tc.isHidden)
        .map((tc: any, i: number) => ({
          input: tc.input || "",
          expectedOutput: tc.expectedOutput || "",
          isHidden: true,
          label: tc.label || `Hidden Test Case ${i + 1}`,
        }));
      list = [...list, ...hiddenMapped];
    }
  }

  return list;
}

export function resolveJavaFileName(sourceCode: string): string {
  if (!sourceCode) return "Main.java";
  const match = sourceCode.match(/public\s+class\s+([A-Za-z0-9_]+)/);
  if (match && match[1]) {
    return `${match[1]}.java`;
  }
  return "Main.java";
}
```

---

## 4. Phase 2: Client & Pure Verdict Mapper

**Goal:** Implement a thin HTTP client (`PistonClient`) with exponential backoff on network/5xx errors, and an isolated, pure `PistonVerdictMapper` covered by 100% Jest tests.  
**Estimated Effort:** 1.5 days  
**Exit Criteria:**
1. `PistonClient` handles HTTP POST with configurable timeouts (15s) and 3x retry on 5xx/network errors.
2. `PistonVerdictMapper` accurately maps `status`, `code`, `signal`, wall-clock/CPU timing, and memory usage.
3. Jest test suite passes with fixtures for all 6 execution scenarios.

### Task 2.1: Thin HTTP Client (`PistonClient`)
Create [backend/api/src/integrations/piston/piston.client.ts](file:///e:/CTP/cd-recruit/backend/api/src/integrations/piston/piston.client.ts):
- Communicates with Piston via Axios at `http://piston:2000/api/v2/execute`.
- Includes transient retry with exponential backoff (100ms, 300ms, 900ms) for HTTP 502/503/504, connection refused, or ETIMEDOUT.
- Re-throws non-transient errors with clear error classification.

### Task 2.2: Pure Verdict Mapper (`PistonVerdictMapper`)
Create [backend/api/src/integrations/piston/piston-verdict-mapper.ts](file:///e:/CTP/cd-recruit/backend/api/src/integrations/piston/piston-verdict-mapper.ts):
```typescript
import { ExecutionStatus } from "@cd-recruit/shared-types";
import { CaseResult, PistonRawResponse } from "./piston.contracts";

export function normalizeOutput(str: string): string {
  if (!str) return "";
  return str.replace(/\s+/g, "").trim().toLowerCase();
}

export function mapPistonResponseToCaseResult(
  caseIndex: number,
  response: PistonRawResponse,
  expectedOutput: string,
  input: string,
  label: string,
  isHidden: boolean,
  fallbackElapsedMs: number,
): CaseResult {
  // 1. Handle Compilation Failures
  if (response.compile && response.compile.code !== 0) {
    return {
      caseIndex,
      passed: false,
      status: ExecutionStatus.COMPILATION_ERROR,
      executionTime: response.compile.wall_time || fallbackElapsedMs,
      memoryUsage: Math.round((response.compile.memory || 0) / 1024),
      stdout: "",
      stderr: response.compile.stderr || response.compile.output || "",
      compileOutput: response.compile.output || response.compile.stderr || "",
      input,
      expectedOutput,
      label,
      isHidden,
    };
  }

  const run = response.run || {};
  const stdout = (run.stdout || "").trim();
  const stderr = (run.stderr || "").trim();
  const compileOutput = (response.compile?.output || "").trim();

  // Timing: prefer Piston isolate wall_time / cpu_time, fallback to worker elapsed ms
  const executionTime = run.wall_time ?? run.cpu_time ?? fallbackElapsedMs;
  // Memory: convert bytes to KB
  const memoryUsage = Math.round((run.memory || 0) / 1024);

  // 2. Status Mapping Priority: Tier 1 = Isolate Status Code
  let status: ExecutionStatus = ExecutionStatus.COMPLETED;

  if (run.status) {
    switch (run.status) {
      case "TO":
        status = ExecutionStatus.TIMEOUT;
        break;
      case "OL":
        status = ExecutionStatus.FAILED; // Output limit exceeded
        break;
      case "RE":
        status = ExecutionStatus.RUNTIME_ERROR;
        break;
      case "SG":
        // Signal kill: check if OOM or timeout or process signal
        if (run.signal === "SIGKILL" && (run.message?.includes("memory") || (run.memory || 0) >= 268435456)) {
          status = ExecutionStatus.MEMORY_LIMIT;
        } else if (run.signal === "SIGKILL") {
          status = ExecutionStatus.TIMEOUT;
        } else {
          status = ExecutionStatus.RUNTIME_ERROR;
        }
        break;
      case "XX":
        status = ExecutionStatus.FAILED; // Internal sandbox error
        break;
      default:
        status = run.code === 0 ? ExecutionStatus.COMPLETED : ExecutionStatus.RUNTIME_ERROR;
    }
  } else {
    // Tier 2: Fallback to signal and exit code
    if (run.signal === "SIGKILL" || run.signal === "SIGXCPU") {
      status = ExecutionStatus.TIMEOUT;
    } else if (run.signal) {
      status = ExecutionStatus.RUNTIME_ERROR;
    } else if (run.code !== null && run.code !== undefined && run.code !== 0) {
      status = ExecutionStatus.RUNTIME_ERROR;
    }
  }

  // 3. Output Comparison (only if completed without runtime crash)
  let passed = false;
  if (status === ExecutionStatus.COMPLETED) {
    const normOut = normalizeOutput(stdout);
    const normExp = normalizeOutput(expectedOutput);
    passed = normOut === normExp;
  }

  return {
    caseIndex,
    passed,
    status,
    executionTime,
    memoryUsage,
    stdout,
    stderr,
    compileOutput,
    input,
    expectedOutput,
    label,
    isHidden,
  };
}
```

---

## 5. Phase 3: Inbound Pipeline & Resilient Worker Execution

**Goal:** Refactor `execution-inbound.processor.ts` for Piston, enforcing safe local concurrency limits, per-case retries, and skipping already-recorded test cases on job retry.  
**Estimated Effort:** 2 days  
**Exit Criteria:**
1. Worker concurrency set to 1 with `p-limit(3)` (max 3 in-flight $\le 75\%$ of Piston slots).
2. Per-case execution checks the Redis accumulator and skips previously recorded test cases.
3. System errors retry 3 times; if retries exhaust, `ExecutionStatus.FAILED` is recorded in PostgreSQL.

### Task 3.1: Resilient Worker Execution Logic
In [execution-inbound.processor.ts](file:///e:/CTP/cd-recruit/backend/api/src/queue/execution/execution-inbound.processor.ts):
- Worker annotation: `@Processor("execution-inbound", { concurrency: 1 })`
- `p-limit` concurrency: `const limit = pLimit(3);`
- For each test case $i \in [0, N-1]$:
  1. Check Redis hash: `HEXISTS execution:{executionId}:cases {i}`. If exists, skip Piston execution (prevents duplicate work on job retry).
  2. If missing, invoke `pistonClient.execute(...)` with `run_timeout: 5000` and `run_memory_limit: 268435456`.
  3. Map result via `mapPistonResponseToCaseResult`.
  4. Write result into Redis hash accumulator: `HSET execution:{executionId}:cases {i} JSON.stringify(caseResult)`.
  5. Increment counter: `HINCRBY execution:{executionId}:cases __completed_count 1`.
  6. If `__completed_count == N`, enqueue outbound job:
     ```typescript
     await this.queueProvider.enqueue(
       "execution-outbound",
       "process-results",
       { executionId },
       { jobId: `outbound-${executionId}` },
     );
     ```

---

## 6. Phase 4: Lua Accumulator, Outbound Idempotency & Watchdog Hardening

**Goal:** Ensure zero race conditions between inbound and outbound processors, harden the watchdog against false timeouts, and make outbound processing strictly idempotent.  
**Estimated Effort:** 1.5 days  
**Exit Criteria:**
1. Outbound processor checks `if (execution.status !== ExecutionStatus.PENDING) return;`.
2. BullMQ retention configured: `removeOnComplete: { age: 3600, count: 5000 }`.
3. Watchdog inspects native BullMQ job status (`waiting`/`active`/`delayed` -> reschedule; all N cases -> enqueue outbound; lost -> `ExecutionStatus.FAILED`).

### Task 4.1: Outbound Processor Idempotency Guard
In [execution-outbound.processor.ts](file:///e:/CTP/cd-recruit/backend/api/src/queue/execution/execution-outbound.processor.ts#L80-L95):
```typescript
async process(job: Job<{ executionId: string }>): Promise<void> {
  const { executionId } = job.data;
  this.logger.log(`[OutboundExecutionProcessor] Finalizing results for execution ${executionId}`);

  const execution = await this.prisma.codingExecution.findUnique({
    where: { id: executionId },
    include: { question: true },
  });

  if (!execution) {
    this.logger.warn(`Execution ${executionId} not found`);
    return;
  }

  // Idempotency Guard: prevent double-processing on duplicate BullMQ deliveries
  if (execution.status !== ExecutionStatus.PENDING) {
    this.logger.log(`[OutboundExecutionProcessor] Execution ${executionId} already finalized with status ${execution.status}. Exiting.`);
    return;
  }

  // Read all cases from Redis Hash accumulator
  const rawCases = await this.redisService.hgetall(`execution:${executionId}:cases`);
  // Map and sort cases 0..N-1, calculate scores, update CodingExecution & ModuleResponse
  // ...
}
```

### Task 4.2: Watchdog Inspection Over Native BullMQ State
In [execution-watchdog.processor.ts](file:///e:/CTP/cd-recruit/backend/api/src/queue/execution/execution-watchdog.processor.ts):
```typescript
async process(job: Job<{ executionId: string }>): Promise<void> {
  const { executionId } = job.data;
  
  const execution = await this.prisma.codingExecution.findUnique({
    where: { id: executionId },
  });

  if (!execution || execution.status !== ExecutionStatus.PENDING) {
    return; // Already completed or failed
  }

  // 1. Check native BullMQ inbound queue job status
  const inboundQueue = this.queueProvider.resolveQueue("execution-inbound");
  const inboundJob = await inboundQueue.getJob(executionId);

  if (inboundJob) {
    const state = await inboundJob.getState();
    if (state === "waiting" || state === "active" || state === "delayed") {
      this.logger.log(`[Watchdog] Inbound job ${executionId} is currently ${state}. Rescheduling watchdog.`);
      await this.queueProvider.enqueueDelayed(
        "execution-watchdog",
        "check-stuck",
        { executionId },
        { delayMs: 30000, jobId: `watchdog-${executionId}-${Date.now()}` },
      );
      return;
    }
  }

  // 2. Check if all N test cases already exist in Redis accumulator
  const content = (execution.question?.content as any) || {};
  const testCases = getQuestionTestCases(content, execution.submissionType as any);
  const completedCountStr = await this.redisService.hget(`execution:${executionId}:cases`, "__completed_count");
  const completedCount = parseInt(completedCountStr || "0", 10);

  if (completedCount >= testCases.length && testCases.length > 0) {
    this.logger.warn(`[Watchdog] Execution ${executionId} has all ${completedCount} cases recorded but outbound was lost. Enqueueing outbound.`);
    await this.queueProvider.enqueue(
      "execution-outbound",
      "process-results",
      { executionId },
      { jobId: `outbound-${executionId}` },
    );
    return;
  }

  // 3. Work is truly lost / worker crashed without recovery: mark system failure (not candidate TIMEOUT)
  this.logger.error(`[Watchdog] Execution ${executionId} orphaned or failed unexpectedly. Marking FAILED.`);
  await this.prisma.codingExecution.update({
    where: { id: executionId },
    data: {
      status: ExecutionStatus.FAILED,
      stderr: "Execution job failed unexpectedly due to internal worker crash. Please retry.",
      completedAt: new Date(),
    },
  });
}
```

---

## 7. Phase 5: Replay Parity Harness & Frontend Storm Mitigation

**Goal:** Guarantee zero scoring regressions by replaying question bank test cases across Piston and Judge0, and optimize frontend polling and SSE handshakes.  
**Estimated Effort:** 2 days  
**Exit Criteria:**
1. Parity test suite executes question bank fixtures (`backend/prisma/data/coding.json`) and achieves 100% verdict parity between Judge0 and Piston.
2. Frontend `CodingWorkspace.tsx` eliminates parallel polling; polling is triggered solely as an SSE fallback with backoff (300ms $\rightarrow$ 2s).
3. Backend SSE endpoint subscribes to Redis Pub/Sub *first*, preventing missed completion events.

### Task 5.1: Question Bank Replay Harness (`scripts/parity-replay.ts`)
Create a dedicated test script that:
1. Iterates over all coding questions in `backend/prisma/data/coding.json`.
2. For each language (Python, Java, JavaScript, C++), submits the starter code and sample solutions to both Judge0 (port 2358) and Piston (port 2000).
3. Compares the final verdict (`passedCount`, `totalTests`, `status`) and asserts exact mathematical match.
4. Outputs a structured parity report.

### Task 5.2: Frontend Polling Storm Refactor
In [CodingWorkspace.tsx](file:///e:/CTP/cd-recruit/frontend/candidate-web/src/components/coding/CodingWorkspace.tsx#L311-L340):
Refactor `executeWithRetry`:
- Connect to SSE endpoint `/api/v1/coding/execution/${id}/events`.
- If SSE delivers result $\rightarrow$ resolve immediately.
- If SSE emits error or fails to connect $\rightarrow$ fall back to `pollExecution(id)` with exponential backoff (300ms, 600ms, 1200ms, 2000ms up to 30s ceiling).
- Eliminates the parallel 300ms request flood (~667 req/s at 200 candidates $\rightarrow$ 0 req/s under normal SSE operation).

### Task 5.3: SSE Cache-First Handshake Inversion
In [coding.service.ts](file:///e:/CTP/cd-recruit/backend/api/src/coding/coding.service.ts#L322-L375):
1. Subscribe subscriber client to Redis Pub/Sub channel `execution:events:${id}` *first*.
2. Immediately check Redis cache `execution:${id}`. If status is final, emit and close.
3. If not in cache, check PostgreSQL `codingExecution.findUnique`. If status is final, emit and close.
4. Otherwise, await Redis Pub/Sub message.

---

## 8. Phase 6: Safe Cutover & Deprecation

**Goal:** Perform the final switch to Piston in local development, archive Judge0 configurations, and tag the repository.  
**Estimated Effort:** 0.5 days  
**Exit Criteria:**
1. Git tag `pre-piston-cutover` created.
2. `docker compose up` starts Piston by default without Judge0 containers.
3. Live candidate runs and submits pass 100% of end-to-end integration tests.

### Task 6.1: Git Tagging & Preservation
```bash
git tag -a pre-piston-cutover -m "Baseline codebase before Judge0 container deprecation"
```

### Task 6.2: Switch Default Execution Engine Flag
Set `EXECUTION_ENGINE=piston` in `.env.example` and local `.env`. Retain `docker/docker-compose.judge0.yml` in the repository for disaster recovery during initial local testing.

---

## 9. Deferred (Before Production)

The following items are strictly deferred from local Docker development and will be activated upon reaching their respective production trigger conditions:

| Claim / Item | Description | Trigger Condition for Activation |
|:---|:---|:---|
| **Claim C22** | **ECS on EC2 with Privileged Mode & ALB** | Migration of CD-Recruit API and execution engines from Docker Compose to AWS ECS. |
| **Claim C23** | **AWS Security Hardening (IMDSv2, Hop Limit 1, Dedicated Hosts)** | AWS VPC and ECS Task Definition provisioning via Terraform. |
| **Claim C24** | **Autoscaling Policies (Queue Backlog per Slot & Oldest Job Age)** | Staging environment load testing (>500 concurrent candidate submissions). |
| **Claim C25** | **ElastiCache Redis Multi-AZ & Hash Tag Key Formatting** | Production AWS ElastiCache cluster provisioning. |
| **Claim B17** | **PostgreSQL Relational `CodingTestCaseResult` Table** | Multi-tenant analytics dashboard requirement querying per-case performance across drives. |
| **Claim B18** | **Dedicated Dual BullMQ Queues (Run vs Submit)** | Candidate drive load testing showing interactive Run starvation under sustained Submit spikes. |
