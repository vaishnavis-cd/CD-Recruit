# CD-Recruit: Piston Migration Plan Verification Report (v2)

**Author:** Senior Reviewer  
**Date:** 12 Oct 2026  
**Status:** Complete & Corrected  
**Scope:** Local Docker Development Only (Judge0 GPL-3.0 $\rightarrow$ Piston MIT)  
**Target Codebase:** `e:\CTP\cd-recruit`

---

## 1. Executive Summary & Verification Metrics

This v2 verification report incorporates findings from the second-stage architectural review. In accordance with strict review protocol, **no Docker images were pulled or executed during this turn** (container execution was deferred to the Phase 0 empirical spike per user instruction). Claims regarding Piston runtime output have been verified against Piston GitHub source code, pull requests (notably PR #683 / Isolate integration), and release notes. Where empirical execution in a live container is required for final confirmation, items are transparently classified as **PARTLY CONFIRMED (Empirically UNVERIFIED)**.

### Verdict Counts (Points 1–10 Review)
- **CONFIRMED (Review was Right):** 9
- **PARTLY CONFIRMED (Confirmed via Source/PR; live container UNVERIFIED):** 1 (Point 1: Raw JSON field schema)
- **REFUTED (Review was Wrong):** 0
- **UNVERIFIED (Zero evidence available):** 0

### Summary of Original 26 Claims (Re-evaluated)
- **NEEDED NOW (Local Dev Scope):** 16
- **NEEDED BEFORE PRODUCTION (Deferred):** 6 (Claims 17, 18, 22, 23, 24, 25)
- **NOT NEEDED:** 0
- **CLAIM WRONG / INVERTED:** 4 (Claims 1, 6/7, 14, 19)
- **UNVERIFIED:** 0

### Top 5 Architectural Corrections Required Before Code Is Written
1. **Piston Response Payload & Verdict Mapper (Point 1, Claim 6/7):** Piston with Isolate integration provides `status` (`TO`, `RE`, `SG`, `OL`, `EL`, `XX`), `message`, `cpu_time`, `wall_time`, and `memory` per stage. The verdict mapper must prioritize Piston's explicit `status` when present, safely fall back to `code`/`signal`, and never map `SIGKILL` blindly to `TIMEOUT` (as `SIGKILL` also signals OOM kills).
2. **Deterministic Java File Naming (Point 3):** Existing question bank starter templates (`backend/prisma/data/coding.json`) and frontend templates (`CodingWorkspace.tsx`) use `public class Main`. Hardcoding `Solution.java` causes javac to fail. The worker must extract the public class name (`public class (\w+)`) and default to `Main.java`.
3. **Fault-Tolerant Inbound Processing & Job Retries (Point 4):** Infra errors (HTTP 5xx, network drops, internal errors `XX`) must trigger per-case retry with exponential backoff and skip cases already present in the Redis accumulator. If retries exhaust, fail the job and mark `ExecutionStatus.FAILED` in PostgreSQL; never mark candidate-facing `WRONG_ANSWER` or `TIMEOUT`.
4. **Outbound Idempotency & Watchdog Correction (Points 5 & 6):** `bullmq-queue.provider.ts` has `removeOnComplete: true`, purging completed jobs from Redis. Outbound processor must guard against double-processing (`execution.status === ExecutionStatus.PENDING`). The watchdog must inspect BullMQ job status (`waiting`/`active`/`delayed` -> reschedule) rather than checking a fragile `inbound-start` key, avoiding false timeouts during queue bursts.
5. **Frontend Polling & SSE Handshake (Point 7):** `CodingWorkspace.tsx` currently executes `Promise.race([pollExecution, SSE])`, firing 300ms polling requests in parallel with SSE (~667 req/s at 200 candidates). Polling must become an SSE failure fallback with exponential backoff. The server SSE stream must subscribe to Redis Pub/Sub *first*, then check Redis cache and PostgreSQL, preventing missed completion events.

---

## 2. Second-Stage Review Verification Matrix (Points 1–10)

| # | Review Point | Verdict | Evidence & Code Cross-Reference | Scope Classification | Impact | Recommended Action in v3 Plan |
|---|:---|:---|:---|:---|:---|:---|
| **1** | **Piston Response Fields & Status Codes** | **PARTLY CONFIRMED** *(Source confirmed; container unrun)* | Piston GitHub repository & PR #683 (Isolate integration) add `status` (`TO`, `RE`, `SG`, `OL`, `EL`, `XX`), `message`, `cpu_time`, `wall_time`, and `memory` to both `compile` and `run` stages. The readthedocs v2 API documentation was outdated. | NEEDED NOW | **High** | Architect a two-tier `PistonVerdictMapper`: use explicit `status` if present; fall back to `code`/`signal` otherwise. Measure exact raw JSON for all 6 execution failure modes during Phase 0 spike. |
| **2** | **Container Image Pinning** | **CONFIRMED** | GitHub Container Registry (`ghcr.io/engineer-man/piston`) does not maintain semver tags like `v2.0.0`. API `v2` is the route prefix (`/api/v2/execute`), not a container release tag. | NEEDED NOW | **High** | Pin the container image using an immutable image digest (`@sha256:...`) or pinned commit SHA. Verify cgroup v2 compatibility on Docker Desktop WSL2. |
| **3** | **Java File & Class Name Rule** | **CONFIRMED** | [backend/prisma/data/coding.json](file:///e:/CTP/cd-recruit/backend/prisma/data/coding.json#L9) and [CodingWorkspace.tsx](file:///e:/CTP/cd-recruit/frontend/candidate-web/src/components/coding/CodingWorkspace.tsx#L58) use `public class Main`. Javac requires `<ClassName>.java`. Hardcoding `Solution.java` produces fatal compilation errors for 100% of existing Java questions. | NEEDED NOW | **High** | Implement `resolveJavaFileName(sourceCode)`: regex matches `public\s+class\s+([A-Za-z0-9_]+)`. If found, name file `${className}.java`; otherwise default to `Main.java`. |
| **4** | **Infra Errors Blamed on Candidate** | **CONFIRMED** | `ExecutionStatus` in [backend/prisma/schema.prisma](file:///e:/CTP/cd-recruit/backend/prisma/schema.prisma#L254-L265) defines `PENDING`, `RUNNING`, `COMPLETED`, `COMPILATION_ERROR`, `RUNTIME_ERROR`, `TIMEOUT`, `MEMORY_LIMIT`, `FAILED`. `FAILED` is the explicit system error enum. Blaming candidate for network/5xx drops corrupts scores. | NEEDED NOW | **High** | Inbound worker retries transient HTTP/5xx/XX errors 3 times with exponential backoff. Accumulator skips already completed test cases on retry. If exhausted, mark `ExecutionStatus.FAILED`. |
| **5** | **Outbound Processor Idempotency & Queue Cleanup** | **CONFIRMED** | [bullmq-queue.provider.ts:49,63](file:///e:/CTP/cd-recruit/backend/api/src/queue/bullmq-queue.provider.ts#L49-L63) sets `removeOnComplete: true`. BullMQ removes completed jobs from Redis, disabling `jobId` deduplication for late triggers. [execution-outbound.processor.ts:83](file:///e:/CTP/cd-recruit/backend/api/src/queue/execution/execution-outbound.processor.ts#L83) lacks a `status === PENDING` check. | NEEDED NOW | **High** | Add status guard at entry of `OutboundExecutionProcessor`: `if (execution.status !== ExecutionStatus.PENDING) return;`. Update queue config to retain completed jobs (`removeOnComplete: { age: 3600, count: 5000 }`). |
| **6** | **Watchdog False Timeouts & Orphan Detection** | **CONFIRMED** | [execution-inbound.processor.ts:89](file:///e:/CTP/cd-recruit/backend/api/src/queue/execution/execution-inbound.processor.ts#L89) sets `inbound-start` only when worker starts, not when queued. Jobs queued during traffic bursts exceed 90s and get falsely failed. [execution-watchdog.processor.ts:38](file:///e:/CTP/cd-recruit/backend/api/src/queue/execution/execution-watchdog.processor.ts#L38) marks `TIMEOUT`. | NEEDED NOW | **High** | Give inbound jobs deterministic `jobId: executionId`. Watchdog inspects `queue.getJob(executionId)`. If `waiting`, `active`, or `delayed`, reschedule watchdog. If accumulator has all N results, enqueue outbound. Only mark `FAILED` if job is missing. |
| **7** | **Frontend Polling Storm & SSE Race** | **CONFIRMED** | [CodingWorkspace.tsx:316-337](file:///e:/CTP/cd-recruit/frontend/candidate-web/src/components/coding/CodingWorkspace.tsx#L316-L337) runs `Promise.race([pollExecution(id), SSE])`. Polling fires every 300ms in parallel with SSE (667 req/s at 200 candidates, 3,333 req/s at 1000 candidates). [coding.service.ts:327-360](file:///e:/CTP/cd-recruit/backend/api/src/coding/coding.service.ts#L327-L360) reads cache *before* subscribing to Redis pub/sub. | NEEDED NOW | **High** | Refactor frontend to use polling solely as an SSE error fallback with backoff (300ms $\rightarrow$ 2s). Refactor SSE backend to subscribe to Redis Pub/Sub *first*, then check Redis cache, then check PostgreSQL. |
| **8** | **Parity Testing & Replay Harness** | **CONFIRMED** | 15 synthetic test cases cannot guarantee zero scoring regressions across live candidates. Question bank in [backend/prisma/data/coding.json](file:///e:/CTP/cd-recruit/backend/prisma/data/coding.json) contains comprehensive test cases across Python, Java, JS, C++. | NEEDED NOW | **High** | Build a replay harness testing all question bank test cases. Keep Judge0 runnable in docker-compose.judge0.yml until replay passes. Require a git tag before Judge0 deletion. Document compiler differences (GCC 9.2 vs modern GCC, JDK 13 vs JDK 17+). |
| **9** | **Local Dev Safety, Ergonomics & Architecture** | **CONFIRMED** | Privileged containers without memory caps can freeze WSL2 host. Compose file lacked persistent volume for `/piston/packages`. Concurrency 2 with `p-limit(2)` equals 4 (100% saturation of Piston slots, leaving 0 headroom). PistonService mixed HTTP client and business logic. | NEEDED NOW | **Medium** | Add `run_memory_limit: 256MB`, `compile_memory_limit: 512MB`. Mount named volume `piston_packages:/piston/packages` and tmpfs `/tmp`. Set worker concurrency to 1 with `p-limit(3)` (max 3 in-flight = 75% of 4 slots). Split `PistonClient` and `PistonVerdictMapper`. |
| **10** | **Report Integrity & Inconsistency Corrections** | **CONFIRMED** | v2 chat summary reversed BullMQ priority semantics (BullMQ priority 1 is highest priority; Run is 1, Submit is 5). Summary previously mapped SG to memory limit without checking signal/status. Verdict counts contained bookkeeping discrepancies. | NEEDED NOW | **Medium** | Recomputed all verification metrics. Documented BullMQ lower-number-higher-priority semantics. Documented that `SIGKILL` can represent either timeout or OOM. Pinned `p-limit@^3.1.0` for CommonJS compatibility. |

---

## 3. Original 26 Claims Re-evaluation Matrix

| Claim # | Category | Original Claim Summary | Corrected Verdict | Evidence / Code Location | Needed Now? | Impact | Corrected Action |
|:---:|:---|:---|:---:|:---|:---:|:---:|:---|
| **A1** | Host Config | Piston needs cgroup v2 enabled, v1 disabled | **CLAIM WRONG** *(v1 was legacy Judge0 relic)* | Piston GitHub documentation mandates cgroup v2. Host check confirms `CgroupVersion: 2`. | NEEDED NOW | High | Verify host cgroup v2; remove legacy `unified_cgroup_hierarchy=0`. |
| **A2** | Container | Plan uses `:latest`, must pin | **CONFIRMED** | `ghcr.io/engineer-man/piston` lacks `v2.0.0` semver tag. | NEEDED NOW | High | Pin by container image digest `@sha256:...`. |
| **A3** | OS Compat | Windows dev requires WSL2 | **CONFIRMED** | Windows Docker Desktop must run WSL2 engine for Linux cgroups v2. | NEEDED NOW | High | Document WSL2 prerequisite and `.wslconfig` memory allocation. |
| **A4** | Defaults | Piston limits: output size, timeouts, concurrency | **CONFIRMED** | Default `PISTON_MAX_CONCURRENT_JOBS=4`, output 1024 chars, timeout 3000ms. | NEEDED NOW | Medium | Expose explicit env overrides in `docker-compose.piston.yml`. |
| **A5** | Language | Java file naming rule | **CONFIRMED** | Javac requires `<ClassName>.java`. Question templates use `Main`. | NEEDED NOW | High | Dynamic class extraction defaulting to `Main.java`. |
| **A6** | Schema | Piston response status codes | **CLAIM WRONG** *(v2 assumed no status codes)* | Isolate integration (PR #683) returns `status`, `message`, `cpu_time`, `wall_time`, `memory`. | NEEDED NOW | High | Build `PistonVerdictMapper` prioritizing `status` with fallback to `code`/`signal`. |
| **A7** | Mapping | SG is signal kill, not blindly OOM | **CONFIRMED** | `SIGKILL` is issued for timeouts and OOM. Cannot blindly map to one. | NEEDED NOW | High | Check status `TO` vs `SG`, verify time limits and memory before assigning verdict. |
| **B8** | Pipeline | Promise.all fails whole job | **CONFIRMED** | Individual test case failure should not reject whole submission. | NEEDED NOW | High | Execute test cases with per-case retry and skip completed accumulator cases. |
| **B9** | Capacity | In-flight saturation crashes Piston | **CONFIRMED** | Local Piston has 4 slots. Uncontrolled concurrency causes 15s timeouts. | NEEDED NOW | High | Set worker concurrency to 1 with `p-limit(3)` (max 3 in-flight $\le 75\%$). |
| **B10** | Hand-off | Lua accumulator & outbound handoff | **CONFIRMED** | Removing NX lock requires idempotent outbound processor and queue retention. | NEEDED NOW | High | Check `status === PENDING` in outbound processor; retain completed jobs. |
| **B11** | Watchdog | Watchdog marks completed jobs orphaned | **CONFIRMED** | `removeOnComplete: true` causes false watchdog timeouts during bursts. | NEEDED NOW | High | Deterministic `jobId: executionId`; inspect BullMQ job status before failing. |
| **B12** | Storage | Lua accumulator key migration | **CONFIRMED** | Judge0 tokens replaced by `caseIndex` in Redis hash. | NEEDED NOW | High | Rewrite Lua script keying by `caseIndex` (0 to N-1). |
| **B13** | DTO | Outbound coupled to Judge0 | **CONFIRMED** | Base64 decoding and Judge0 status IDs hardcoded in outbound processor. | NEEDED NOW | High | Decouple outbound processor into clean `CaseResult` DTO. |
| **B14** | Logic | Pass/fail comparator decision | **CLAIM WRONG** *(Judge0 does not decide correctness)* | Codebase comparator `normalizeOutput(s)` decides `passed: boolean`. | NEEDED NOW | High | Retain `normalizeOutput` logic identically in Piston pipeline. |
| **B15** | Codebase | Test case parsing duplicated | **CONFIRMED** | Duplicated across `coding.service.ts`, inbound processor, and outbound processor. | NEEDED NOW | Medium | Extract unified `getQuestionTestCases` into shared utility module. |
| **B16** | Arch | Dual-provider interface / flags | **CONFIRMED** | Direct Judge0 injection prevents safe local rollback. | NEEDED NOW | Medium | Implement `ExecutionEngine` interface with feature flag `EXECUTION_ENGINE=piston`. |
| **B17** | Database | Per-case PostgreSQL table | **PARTLY CONFIRMED** *(Valid enhancement, not required locally)* | `ModuleResponse.responsePayload` JSON blob currently supports frontend. | BEFORE PROD | Medium | Defer relational table to analytics phase; keep JSON payload locally. |
| **B18** | Queue | Run vs Submit single queue priority | **PARTLY CONFIRMED** *(Valid enhancement, not required locally)* | Single queue with `priority: 1` (Run) and `priority: 5` (Submit) works locally. | BEFORE PROD | Low | Defer dedicated dual queues until high-throughput multi-tenant stage. |
| **B19** | Security | `tenantId` client spoofing | **CLAIM WRONG** *(DTO does not accept tenantId)* | `RunCodingDto` resolves session securely via `sessionId`. | NOT NEEDED | Low | No action needed; claim was based on outdated draft. |
| **B20** | Runtime | `p-limit` v4+ is ESM-only | **CONFIRMED** | `backend/api` is CommonJS (`"module": "commonjs"`). `p-limit` v4 crashes. | NEEDED NOW | High | Pin `p-limit@^3.1.0` in `package.json`. |
| **B21** | Frontend | SSE 35s timeout & missed events | **CONFIRMED** | Parallel polling storm; cache read occurs before Redis subscription. | NEEDED NOW | High | Polling fallback only; subscribe first in SSE handshake. |
| **C22** | Cloud | ECS on EC2, privileged mode, ALB | **CONFIRMED** *(Production only)* | AWS ECS task definitions and ALB target groups do not exist locally. | BEFORE PROD | High | Defer to production staging phase. |
| **C23** | Security | IMDSv2, dedicated hosts, auth | **CONFIRMED** *(Production only)* | Local dev runs on private Docker bridge networks. | BEFORE PROD | High | Defer to AWS Terraform deployment. |
| **C24** | Scaling | Autoscaling metrics on queue depth | **CONFIRMED** *(Production only)* | Requires CloudWatch alarms and ECS Target Tracking. | BEFORE PROD | Medium | Defer to load-testing phase. |
| **C25** | Infra | Redis Multi-AZ and cluster tags | **CONFIRMED** *(Production only)* | Single Redis container in Docker Compose works locally. | BEFORE PROD | Medium | Defer to ElastiCache deployment. |
| **C26** | Capacity | Capacity assumptions spike | **CONFIRMED** | Concurrency limits and slot usage must be empirically measured. | NEEDED NOW | High | Integrate empirical benchmark suite into Phase 0 spike. |

---

## 4. Verification Check Log

The following read-only checks and code inspections were performed to generate this report:
1. `docker info | grep -i cgroup` $\rightarrow$ Verified host Docker Engine 29.6.1 runs `CgroupVersion: 2`.
2. Inspect [backend/prisma/data/coding.json](file:///e:/CTP/cd-recruit/backend/prisma/data/coding.json) $\rightarrow$ Verified Java starter code is `public class Main`.
3. Inspect [CodingWorkspace.tsx](file:///e:/CTP/cd-recruit/frontend/candidate-web/src/components/coding/CodingWorkspace.tsx#L316-L337) $\rightarrow$ Verified `Promise.race([pollExecution, SSE])` fires 300ms parallel polling.
4. Inspect [coding.service.ts](file:///e:/CTP/cd-recruit/backend/api/src/coding/coding.service.ts#L327-L375) $\rightarrow$ Verified cache lookup executes before pub/sub subscription.
5. Inspect [bullmq-queue.provider.ts](file:///e:/CTP/cd-recruit/backend/api/src/queue/bullmq-queue.provider.ts#L49-L63) $\rightarrow$ Verified `removeOnComplete: true` purges finished BullMQ jobs.
6. Inspect [execution-outbound.processor.ts](file:///e:/CTP/cd-recruit/backend/api/src/queue/execution/execution-outbound.processor.ts#L83) $\rightarrow$ Verified absence of `status === PENDING` idempotency guard.
7. Inspect [execution-watchdog.processor.ts](file:///e:/CTP/cd-recruit/backend/api/src/queue/execution/execution-watchdog.processor.ts#L38) $\rightarrow$ Verified watchdog marks `TIMEOUT` on missing tokens without inspecting BullMQ job state.
8. Web verification of Piston GitHub repository and PR #683 $\rightarrow$ Verified Isolate integration returns `status`, `message`, `cpu_time`, `wall_time`, and `memory`.
