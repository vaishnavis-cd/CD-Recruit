# Architectural Decision Records (ADRs)

This document contains the foundational Architectural Decision Records for the **CD-Recruit** technical hiring and assessment platform.

---

## ADR 1: Monorepo Structure with npm Workspaces

### Context
CD-Recruit consists of multiple applications (Recruiter Admin Web, Candidate Assessment Web, Backend API) and shared domain definitions (DTOs, TypeScript types, design tokens). Maintaining separate git repositories led to type drift, contract synchronization lag, and multiple CI/CD pipelines.

### Decision
Adopt an **npm workspaces monorepo**:
- `frontend/admin-web`: TanStack Start + React 19 recruiter and operations dashboard.
- `frontend/candidate-web`: Vite + React 19 assessment shell with strict state-machine routing.
- `backend/api`: NestJS 11 REST API monolith and correlation engine.
- `packages/shared-types`: Canonical DTO contracts and TypeScript interfaces consumed by frontends and backend.
- `packages/design-tokens`: Shared CSS design tokens, themes, and visual tokens.

### Consequence
- Shared types and tokens are compiled during `"postinstall": "npm run build:shared"`.
- Instant type-safety across backend endpoints and frontend callers.
- Single atomic commits across full-stack feature releases.

---

## ADR 2: Dual-Mode Infrastructure Strategy (`INFRA_MODE`)

### Context
Running the full suite of backing containers (PostgreSQL, Redis, MinIO S3, MongoDB, Judge0, Face Verify) consumes substantial system memory and introduces startup friction for frontend developers or rapid prototyping.

### Decision
Implement **dual infrastructure routing** controlled by `INFRA_MODE` (`local` vs `full`):
- **`INFRA_MODE=local`**: Uses in-memory queue schedulers for BullMQ jobs, `FakeStorageService` for MinIO/S3, and mock responders for Judge0 and biometric verification. Requires only PostgreSQL.
- **`INFRA_MODE=full`**: Connects to real local Docker containers or production cloud instances (AWS RDS, AWS S3, Redis cluster, Judge0 worker fleet).
- A startup assertion in `main.ts` strictly forbids `INFRA_MODE=local` when `NODE_ENV=production`.

### Consequence
- Lightning-fast onboarding and lightweight frontend workflows.
- Zero code changes required between local container staging and AWS production cutover.

---

## ADR 3: Native In-House Staff JWT Authentication (Decommissioning Keycloak)

### Context
Keycloak was originally planned for Staff identity management on port `8080`. In practice, Keycloak required ~1GB RAM, introduced Java cold-boot latency, and necessitated complex dual-write synchronization between the PostgreSQL database and Keycloak Admin REST APIs.

### Decision
Decommission Keycloak in favor of an **In-House Native Staff JWT Authentication System**:
- Single source of truth: PostgreSQL `Staff` table with `passwordHash`, `refreshTokenHash`, and `refreshTokenExpiresAt`.
- Password security: Node.js native `crypto.scrypt` (memory-hard, GPU-resistant salt derivation) verified in constant time.
- Token architecture: Short-lived symmetric HS256 access tokens (15 minutes) signed with `JWT_SECRET`.
- Refresh token rotation: Cryptographically random 80-character hex strings stored as SHA-256 hashes in PostgreSQL with single-use rotation and replay prevention.
- Candidate sessions remain completely isolated using HMAC session tokens governed by `SessionOwnerGuard`.

### Consequence
- Eliminated external Java container dependency and cold boots.
- Instant, deterministic user creation, password reset, and role management via standard Prisma queries.
- Zero network latency for token issuance and validation.

---

## ADR 4: Polyglot Sandboxed Code & Query Execution

### Context
Candidates submit untrusted code (Python, TypeScript, Go, Java, C++) and queries (SQL, MongoDB) that must be safely compiled, executed, and benchmarked against test suites without compromising host security or leaking data.

### Decision
1. **Coding & Debugging Execution**: Deploy **Judge0 CE** utilizing Linux `isolate` sandboxes with strict kernel cgroups (`CPU_TIME_LIMIT=5.0`, `MEMORY_LIMIT=262144`, restricted process counts).
2. **SQL Execution**: Route candidate queries through a dedicated, sandboxed PostgreSQL database connection (`SANDBOX_DB_URL`) with read-only permissions and strict execution timeouts.
3. **NoSQL Execution**: Run interactive MongoDB queries in an isolated MongoDB container (`27017`) using ephemeral collections with test assertions.

### Consequence
- Complete host isolation against malicious code and fork bombs.
- Accurate CPU and wall-time execution benchmarking.
- Realistic database querying without exposing the core application schema.

---

## ADR 5: In-Process Correlation Engine within NestJS Monolith

### Context
Evaluating candidate submissions across multiple modalities (code correctness, SQL efficiency, AI prompt quality, and contextual simulations) originally envisioned an external Python FastAPI scoring service. Network latency and cross-service communication overhead introduced delays in assessment finalization.

### Decision
Migrate the **Correlation Engine directly in-process** as a native NestJS module (`backend/api/src/modules/correlation/` or similar):
- Asynchronously processes multi-signal assessment data upon candidate submission.
- Calls LLM evaluation providers (Anthropic Claude, Groq) with structured rubric prompts when evaluating open-ended AI prompting and simulation stages.
- Computes synthesized domain scores, seniority benchmarks, and anomaly scores directly in PostgreSQL.

### Consequence
- Drastically reduced operational complexity and eliminated inter-service network failure points.
- Instant access to candidate session history and database models.

---

## ADR 6: Multi-Stage Assessment Engine Across 8 Specialized Modules

### Context
Modern engineering evaluation requires assessing diverse competencies: knowledge breadth, database fluency, algorithmic problem solving, debugging real codebases, interacting with AI tools, architectural reasoning, and quality assurance.

### Decision
Implement **8 first-class assessment modules** in the core data model and UI:
1. **`MCQ`**: Timed multiple-choice conceptual questions with randomized answer ordering.
2. **`SQL`**: Interactive schema queries validated against expected result sets.
3. **`NOSQL`**: MongoDB aggregation pipelines and document operations.
4. **`CODING`**: Polyglot algorithmic problem solving with hidden and visible test cases via Judge0.
5. **`DEBUGGING`**: Fixing defects in realistic code snippets against regression test suites.
6. **`AI_PROMPTING`**: Evaluating prompt engineering efficacy, zero-shot and few-shot formatting against LLM judges.
7. **`SIMULATION`**: Multi-stage workplace scenarios evaluating decision-making, incident response, and trade-offs.
8. **`TEST_SCENARIOS`**: Crafting comprehensive QA test plans and edge-case suites.

### Consequence
- Universal evaluation coverage tailored to 32 role templates across 8 departments and 4 seniority levels.
- Flexible drive creation allowing recruiters to mix and match modules with custom weights and time allocations.

---

## ADR 7: Privacy-Preserving Telemetry, Biometric KYC & Evidence Streaming Pipeline

### Context
High-stakes hiring assessments require robust anti-cheating verification while respecting candidate privacy and complying with data privacy regulations (GDPR/DPDP).

### Decision
Implement a multi-layered, privacy-conscious proctoring architecture:
1. **Pre-Assessment KYC & Liveness**: Candidate webcam selfie captured and verified against uploaded ID proof using an internal Python DeepFace microservice (`services/face-verify` on port 8001).
2. **Client-Side Telemetry Streaming**: Event listeners track window blur, tab switches, copy-paste attempts, and fullscreen exits. Events are batched and posted to `POST /api/v1/proctoring/events`.
3. **Short-Clip Evidence Snapshots**: Periodic low-resolution webcam snapshots or 10-second webm clips recorded locally and uploaded directly to MinIO/AWS S3 via presigned PUT URLs (`POST /api/v1/proctoring/upload-url`).
4. **Data Retention**: Biometric evidence clips are governed by strict retention policies (`EVIDENCE_CLIP_RETENTION_DAYS=90`) and access requires recruiter authentication.

### Consequence
- Minimal network bandwidth consumption on client connections.
- Secure, auditable proctoring trail without invasive kernel-level drivers.

---

## ADR 8: MediaPipe CV Proctoring Deferral for Candidate Web

### Context
The original specifications outlined local candidate webcam frame analysis via MediaPipe (including face, object, and pose detection) to capture suspicious events in-memory.

### Decision
For Phase 2 production release, candidate-side automated MediaPipe Computer Vision models processing (outside of initial KYC liveness/selfie verification checks) is deferred for the following reasons:
1. Client-side WASM initialization overhead and performance degradation on low-end candidate devices.
2. Inconsistencies in dynamically downloading 30MB+ task models over high-latency client networks.

### Consequence
- The frontend `cv` detection adapters (`cv/real.ts`) are structured as success-resolved no-ops instead of throwing exceptions.
- Proctoring verification relies on telemetry (tab switches, paste actions, and fullscreen exits) and candidate metadata logs rather than automated vision triggers.
