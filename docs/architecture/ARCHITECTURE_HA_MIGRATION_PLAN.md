# CD-Recruit — High Availability & Architecture Migration Blueprint

## Executive Summary

This document defines the architectural strategy and complete migration plan to address feedback regarding platform resilience and single-point-of-failure risks:

> **Feedback Addressed:**  
> *"Monolith with no high availability: one NestJS backend serves admin, candidate, CV, AI and code execution, so a candidate spike or a single failure can affect everything."*

---

## 1. Architectural Verdict: What Are We Changing Into?

We are transitioning the backend from a single-process monolith into a **Tiered Service-Oriented Architecture (Decoupled Modular Monolith)** deployed across isolated operational tiers.

### Why Not a Full Microservices Rewrite?
* **Database Cohesion:** Splitting the PostgreSQL database across 10 microservices breaks Prisma schemas, foreign keys, database joins, and ACID transactions.
* **Overhead & Latency:** Introducing distributed transaction sagas, service meshes, and gRPC adds immense operational friction and slows feature velocity.
* **Cost:** Multiple idle micro-databases and individual service gateways drastically inflate cloud hosting expenses.

### Why the Tiered Monolith Is Optimal:
* **Zero Blast Radius:** Candidate spikes during hiring drives (e.g., 10,000 students starting tests simultaneously) are absorbed entirely by auto-scaling candidate pods without affecting the Admin/Recruiter portal.
* **Isolated Compute:** Heavy biometrics (ONNX/Sharp), AI prompt evaluations, and sandbox code execution are isolated from the main HTTP event loop.
* **Unified Codebase:** Maintains a single TypeScript monorepo, single Prisma schema, and fast local development.

---

## 2. Evaluation Across the 8 Core Parameters

| Parameter | Current Single Monolith | ❌ Full Microservices | 🏆 Tiered Modular Architecture (Target) |
| :--- | :--- | :--- | :--- |
| **1. Scalability** | Low (Candidate surges freeze admin/all APIs) | High, but complex orchestration | **High** (Candidate API & Workers auto-scale independently from 2 to 50+ pods) |
| **2. Pricing (Cost)** | Low baseline, but costly to scale whole app | High baseline ($$$ for idle gateways & multi-DBs) | **Highly Cost-Effective** (Scale candidate pods on-demand during exam drives) |
| **3. Testability** | Easy | Very Hard (Requires service mocking & contract tests) | **Easy & Fast** (Unit/E2E tests run locally via `npm test` or single Docker Compose) |
| **4. Traceability** | Simple | Complex (Requires distributed tracing/Jaeger) | **High** (`x-correlation-id` passed seamlessly across HTTP & BullMQ jobs) |
| **5. Licensing** | Open Source | Open Source | **100% Permissive Open Source** (NestJS, React, PostgreSQL, Redis, MinIO, ONNX) |
| **6. Reliability & HA** | Single Point of Failure (SPOF) | High isolation, but network failure points | **High Availability** (Multi-replica tiers behind Load Balancer + Multi-AZ DB) |
| **7. Practicality** | High risk under load | 3–6 months rewrite; blocks product roadmap | **Immediate** (Same codebase; configured via runtime roles and reverse proxy) |
| **8. Observability** | Single log stream | Distributed across 10+ log sinks | **Unified** (Centralized JSON logging + Prometheus metrics in Grafana at `:3100`) |

---

## 3. Target System Topology

```mermaid
graph TD
    subgraph Clients
        AdminUI[Admin Recruiter Dashboard<br/>React 19 / TanStack Start]
        CandUI[Candidate Assessment Shell<br/>React 19 / Vite]
    end

    subgraph Ingress & Routing
        LB[Load Balancer / Nginx / AWS ALB]
    end

    subgraph Tier 1: Admin API Nodes (High Availability)
        Admin1[Admin API Replica 1]
        Admin2[Admin API Replica 2]
    end

    subgraph Tier 2: Candidate Assessment Engine (Auto-scaling)
        Cand1[Candidate API Pod 1]
        Cand2[Candidate API Pod 2]
        CandN[Candidate API Pod N... HPA Auto-scaled]
    end

    subgraph Tier 3: Async BullMQ Workers
        Worker1[Background Queue Worker 1]
        Worker2[Background Queue Worker 2]
    end

    subgraph Tier 4: Isolated Compute & Sandbox
        Judge0[Judge0 Polyglot Sandbox Cluster]
        WorkerThreads[Node.js Worker Threads: ONNX & Sharp]
    end

    subgraph Data & Storage Layer
        PG[(PostgreSQL 16 Multi-AZ + PgBouncer)]
        Redis[(Redis 7 Cluster / Sentinel)]
        MinIO[(MinIO / AWS S3 Storage)]
    end

    AdminUI -->|/api/v1/admin/*, /api/v1/drives/*| LB
    CandUI -->|/api/v1/candidate/*, /api/v1/session/*| LB

    LB -->|Admin Traffic| Admin1 & Admin2
    LB -->|Candidate Traffic| Cand1 & Cand2 & CandN

    Cand1 & Cand2 & CandN -->|Webcam Frames| WorkerThreads
    Cand1 & Cand2 & CandN -->|Code Submissions| Judge0
    Cand1 & Cand2 & CandN -->|Enqueue Reports/AI/Scoring| Redis

    Redis --> Worker1 & Worker2

    Admin1 & Admin2 --> PG
    Cand1 & Cand2 & CandN --> PG
    Worker1 & Worker2 --> PG

    Admin1 & Admin2 --> MinIO
    Cand1 & Cand2 & CandN --> MinIO
    Worker1 & Worker2 --> MinIO
```

---

## 4. Comprehensive Inventory of All Required Changes

### Tier 1 & 2: Backend Process Role Bootstrapping
* **Files:** `backend/api/src/main.ts` and `backend/api/src/app.module.ts`
* **Change:** Add runtime process role resolution via `PROCESS_TYPE` / `APP_ROLE` environment variable:
  * **`APP_ROLE=admin-api`**: Bootstraps `AdminModule`, `DriveModule`, `BillingModule`, `RoleTemplateModule`, and `AuthModule`. Excludes candidate throttling overhead and queue listeners.
  * **`APP_ROLE=candidate-api`**: Bootstraps `CandidateModule`, `SessionModule`, `ProctoringModule`, and the 8 assessment modules. Configured with aggressive autoscaling.
  * **`APP_ROLE=worker`**: Disables HTTP listening (`app.init()` only) and runs BullMQ job processors for AI prompt evaluation, simulation scoring, and PDF report compilation.

### Tier 3: Biometrics & Computer Vision Offloading (Blast Radius Fix)
* **File:** `backend/api/src/integrations/face-verify-onnx/face-verify-onnx.service.ts`
* **Change:** Move RetinaFace / ArcFace ONNX inference and `sharp` image manipulation off the main Node.js event loop into **Node.js Worker Threads** (using worker thread pools).
* **Benefit:** Web requests, candidate test timers, and WebSocket heartbeats remain responsive even when thousands of webcam frames are processed concurrently.

### Tier 4: Non-Blocking Asynchronous Workflows
* **Files:** `backend/api/src/ai-prompting/`, `backend/api/src/simulation/`, `backend/api/src/session/session-scoring.service.ts`
* **Change:** Ensure all long-latency jobs (LLM evaluations, correlation engine aggregation, candidate batch CSV imports) run asynchronously via BullMQ, returning `202 Accepted` + `jobId` immediately to HTTP clients.

### Database Connection Resilience
* **Files:** `backend/prisma/schema.prisma` and `backend/api/src/prisma/prisma.service.ts`
* **Change:** Configure connection pool sizing parameters (`?connection_limit=10&pool_timeout=20`) and add PgBouncer support to prevent PostgreSQL connection exhaustion when candidate instances scale horizontally.

### Ingress & Load Balancing Configuration
* **Files:** `docker-compose.yml` and `docker/nginx/nginx.conf` (New)
* **Change:**
  * Configure reverse proxy paths:
    * `/api/v1/admin/*`, `/api/v1/drives/*`, `/api/v1/billing/*` $\rightarrow$ `admin_upstream` (Port 3001, 2+ replicas)
    * `/api/v1/candidate/*`, `/api/v1/session/*`, `/api/v1/modules/*` $\rightarrow$ `candidate_upstream` (Port 3002, 2+ replicas)
    * `/api/v1/health` $\rightarrow$ Unified system health checks.

### Legacy Code Cleanup
* **Delete:** `services/face-verify/` (obsolete Python microservice: `app.py`, `Dockerfile`, `requirements.txt`).
* **Delete:** `backend/api/src/integrations/face-verify/` (obsolete HTTP client calling port 8001).
* **Clean References:** Remove dead imports from `backend/api/src/admin/invite.service.ts` and `backend/api/src/app.module.ts`.

---

## 5. File-by-File Action Matrix

| File / Directory | Action | Specific Change |
| :--- | :---: | :--- |
| `backend/api/src/main.ts` | **Modify** | Support `APP_ROLE` startup flags (`admin-api`, `candidate-api`, `worker`) |
| `backend/api/src/app.module.ts` | **Modify** | Conditionally load modules based on `APP_ROLE` |
| `backend/api/src/integrations/face-verify-onnx/face-verify-onnx.service.ts` | **Modify** | Delegate ONNX / Sharp processing to Node.js Worker Threads |
| `backend/api/src/prisma/prisma.service.ts` | **Modify** | Add connection pooling safeguards and PgBouncer compatibility |
| `services/face-verify/` | **Delete** | Remove unused Python service directory |
| `backend/api/src/integrations/face-verify/` | **Delete** | Remove dead HTTP client wrapper |
| `backend/api/src/admin/invite.service.ts` | **Modify** | Remove unused `FaceVerifyClient` injection |
| `docker-compose.yml` | **Modify** | Define multi-replica admin, candidate, worker, and nginx services |
| `docker/nginx/nginx.conf` | **Create** | Path-based routing and load balancing configuration |
| `README.md` | **Modify** | Update architecture topology and local development ports |
| `docs/DEVELOPER_GUIDE.md` | **Modify** | Document the Tiered Architecture and deployment operational profiles |
