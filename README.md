# CD-Recruit — Technical Hiring & Assessment Platform

**CD-Recruit** is an enterprise-grade, multi-module technical assessment, evaluation, and integrity governance platform. Candidates complete timed, multi-stage assessments across **8 specialized evaluation modules** (Multiple Choice Questions, SQL sandboxes, NoSQL/MongoDB queries, Polyglot Coding in isolated environments, Codebase Debugging, AI Prompt Engineering, Contextual Workplace Simulations, and QA Test Scenario designs) which are automatically evaluated, scored, and synthesized into comprehensive hiring analytics backed by non-intrusive webcam proctoring and biometric verification.

---

## 🚀 Architecture & Port Topology

The platform operates as a unified monorepo designed to run locally with zero or full container dependencies, and deploy seamlessly across cloud environments (AWS RDS, AWS S3, and horizontally scaled Judge0 sandboxes).

### Local Port Allocation Table

| Service / Application | Layer / Tech | Local Port | Environment Variable | Access Endpoint / Notes |
|---|---|---|---|---|
| **NestJS Backend REST API** | Node.js 20 / NestJS | `3001` | `API_PORT` | `http://localhost:3001/api/v1` (Swagger: `/api-docs`) |
| **Admin Web (Recruiter Dashboard)** | TanStack Start / React 19 | `5173` | — | `http://localhost:5173/` |
| **Candidate Web (Assessment Shell)** | Vite / React 19 / Tailwind v4 | `5174` | — | `http://localhost:5174/` |
| **PostgreSQL (Local Dev)** | PostgreSQL 16 Alpine | `5434` | `DATABASE_URL` | `localhost:5434` (Mapped from internal `5432`) |
| **Redis & BullMQ** | Redis 7 Alpine | `6379` | `REDIS_URL` | `localhost:6379` (Async jobs & queues) |
| **MongoDB (NoSQL Module)** | MongoDB 6.0 | `27017` | `MONGODB_URL` | `localhost:27017` (Interactive queries) |
| **MinIO Object Storage** | S3-Compatible Storage | `9000` / `9001` | `MINIO_PORT` | API: `9000`, Web Console: `9001` (`minioadmin`) |
| **Judge0 Code Sandbox** | Judge0 CE (Isolate) | `2358` | `JUDGE0_API_URL` | `http://localhost:2358` |
| **Face Verification Service** | Python 3.11 / DeepFace | `8001` | `FACE_VERIFY_SERVICE_URL` | `http://localhost:8001` |
| **Grafana Observability** | Grafana Dashboard | `3100` | — | `http://localhost:3100` (Remapped from 3001) |

---

## 🛠️ Prerequisites

- **Node.js**: `≥ 20.0.0`
- **npm**: `≥ 10.0.0`
- **Docker Desktop**: `≥ 24.0` (Required for full containerized backing services)
- **Git**: `≥ 2.40`

---

## ⚡ Quick Start & Development Setup

### 1. Environment Configuration

Copy `.env.example` to create your local `.env` files:

```bash
cp .env.example .env
cp .env backend/api/.env
```

* **`INFRA_MODE=local`**: Runs without local container dependencies using mock in-memory storage and schedulers (ideal for rapid UI development).
* **`INFRA_MODE=full`**: Connects to real local containers or cloud services (PostgreSQL, Redis, MinIO/S3, MongoDB, Judge0, Face Verify).

### 2. Launch Local Backing Containers

To spin up the container suite:

```bash
npm run infra:up
```

*Running containers:* PostgreSQL (`5434:5432`), Redis (`6379`), MinIO (`9000`/`9001`), MongoDB (`27017`), Face Verify (`8001`), and Judge0 Server & Worker (`2358`).

### 3. Initialize & Seed Database

Compile shared libraries, generate Prisma client, run database migrations, and seed initial templates:

```bash
npm run setup:all
```

### 4. Launch Applications

Run each service in separate terminals from the repository root:

```bash
# Terminal 1: NestJS API Backend (Port 3001)
npm run dev:api

# Terminal 2: Recruiter Admin Dashboard (Port 5173)
npm run dev:admin

# Terminal 3: Candidate Assessment Shell (Port 5174)
npm run dev:candidate
```

---

## 📚 Essential Developer Documentation

| Document | Description |
|---|---|
| 📖 [**Master Developer Guide**](docs/DEVELOPER_GUIDE.md) | Exhaustive guide to platform architecture, the 8 assessment modules, In-House JWT auth, database workflows, proctoring pipeline, and extension recipes. |
| 🚀 [**Developer Onboarding Guide**](docs/ONBOARDING_GUIDE.md) | Step-by-step local workstation setup, port matrix, default seed credentials, and common troubleshooting. |
| 🔌 [**Complete API Endpoints Catalog**](docs/contracts/COMPLETE_API_ENDPOINTS_CATALOG.md) | Authoritative reference for all 23 controllers, routes, guards, request DTOs, and response structures. |
| 🏗️ [**Infrastructure Modes (INFRA_MODE)**](docs/architecture/INFRA_MODE.md) | Details on zero-dependency `local` mock mode vs containerized `full` mode. |
| 🐳 [**Dockerization Specification**](docs/DOCKERIZATION_SPECIFICATION.md) | Containerization blueprint for DevOps and platform engineering teams. |
| 🚢 [**Deployment Readiness Walkthrough**](docs/DEPLOYMENT_READINESS_WALKTHROUGH.md) | Load testing procedures (k6), Judge0 horizontal scaling, AWS RDS and S3 cutover runbook. |
| 🏛️ [**Architectural Decisions (ADRs)**](docs/architecture/DECISIONS.md) | Formal records of foundational architectural decisions (ADRs 1 through 8). |

---

## ☁️ Cloud Deployment (AWS RDS & AWS S3)

The application supports **seamless dual-routing**:

1. **AWS RDS PostgreSQL**: Set `DATABASE_URL=postgresql://user:password@<rds-endpoint>:5432/cdrecruit?sslmode=require`. No code changes required.
2. **AWS S3 Object Storage**: Point `MINIO_ENDPOINT=s3.<region>.amazonaws.com`, `MINIO_PORT=443`, `MINIO_USE_SSL=true`, and specify `MINIO_REGION=<region>`. The storage client dynamically connects to AWS S3.
3. **Dockerization Specifications**: Full container specifications for the platform engineering team are documented in [`docs/DOCKERIZATION_SPECIFICATION.md`](docs/DOCKERIZATION_SPECIFICATION.md).
4. **Deployment Readiness Guide**: Staging load testing procedures and Judge0 worker scaling are detailed in [`docs/DEPLOYMENT_READINESS_WALKTHROUGH.md`](docs/DEPLOYMENT_READINESS_WALKTHROUGH.md).

---

## 📁 Repository Structure

```
codebase/
├── backend/
│   ├── api/                   # NestJS Monolith REST API & In-Process Correlation Engine
│   └── prisma/                # Prisma ORM schema, migrations, and seed scripts
├── frontend/
│   ├── admin-web/             # Recruiter Dashboard (TanStack Start + React 19)
│   └── candidate-web/         # Candidate Assessment Shell (Vite + React 19)
├── packages/
│   ├── shared-types/          # Canonical TypeScript interfaces & DTO contracts
│   └── design-tokens/         # Shared CSS tokens & styling variables
├── services/
│   └── face-verify/           # Python FastAPI + DeepFace biometric verification microservice
├── docker/                    # Docker Compose development and monitoring stacks
├── k6/                        # k6 load testing suites (Judge0, API throughput)
└── docs/                      # Authoritative specifications, deployment guides, and contracts
```
