# CD-Recruit — Proctora Technical Hiring & Assessment Platform

**Proctora** is a multi-module, automated technical hiring assessment platform built for enterprise recruiters and engineering teams. Candidates complete timed, multi-stage assessments (MCQ, SQL, Coding under gVisor sandbox, Contextual Simulation, AI Prompting, and Webcam Proctoring) which are evaluated, scored, and correlated into comprehensive hiring analytics.

---

## 🚀 Partner Handoff & Architecture Overview

CD-Recruit / Proctora is designed to run either as a standalone platform or co-exist seamlessly alongside an external **ATS (Applicant Tracking System)** partner application.

### Co-Existence Port Architecture Table

| Component / Service | Primary Owner | Port | Environment Var | Access Endpoint / Notes |
|---|---|---|---|---|
| **NestJS Backend REST API** | CD-Recruit | `3001` | `API_PORT` | `http://localhost:3001/api/v1` (Swagger: `/api-docs`) |
| **Admin Web (Recruiter Dashboard)** | CD-Recruit | `5174` | `VITE_ADMIN_PORT` | `http://localhost:5174/` |
| **Candidate Web (Assessment Shell)** | CD-Recruit | `3000` | `VITE_CANDIDATE_PORT` | `http://localhost:3000/` |
| **ATS Partner Backend API** | ATS Team | `8000` | `ATS_BACKEND_PORT` | `http://localhost:8000/` |
| **ATS Partner Frontend App** | ATS Team | `5173` | `ATS_FRONTEND_PORT` | `http://localhost:5173/` (Placeholder reserved) |
| **Correlation Engine** | CD-Recruit | `3001` | — | Runs in-process inside NestJS Backend |

---

## 🛠️ Prerequisites & System Requirements

- **Node.js**: `≥ 20.0.0`
- **npm**: `≥ 10.0.0`
- **Docker Desktop**: `≥ 24.0` (Required for `INFRA_MODE=full`)
- **Git**: `≥ 2.40`

---

## ⚡ Quick Start & Development Setup

### 1. Environment Configuration

Copy `.env.example` to create your local `.env` configuration:

```bash
cp .env.example .env
```

Set `INFRA_MODE`:
- `INFRA_MODE=local`: Zero-dependency mode using mock in-memory storage (ideal for quick frontend & API development).
- `INFRA_MODE=full`: Complete containerized stack with Postgres, Redis, MinIO, Keycloak, and Judge0 code sandbox.

### 2. Infrastructure Containers (Full Mode)

If running in `INFRA_MODE=full`, launch the backing service containers:

```bash
npm run infra:up
```

*Expected running containers:* PostgreSQL (`5433`), Redis (`6379`), MinIO (`9000`/`9001`), Keycloak (`8085`), Judge0 (`2358`).

### 3. Install & Seed Database

Execute dependency installation, shared type compilation, Prisma migrations, and database seeding in one command:

```bash
npm run setup:all
```

### 4. Launch Applications

Launch each application service in a separate terminal:

```bash
# Terminal 1: NestJS API Service (Port 3001)
npm run dev:api

# Terminal 2: Recruiter Admin Dashboard (Port 5174)
npm run dev:admin

# Terminal 3: Candidate Assessment Shell (Port 3000)
npm run dev:candidate
```

---

## 🔑 Infrastructure Modes (`INFRA_MODE`)

CD-Recruit supports **Ports-and-Adapters** infrastructure switching controlled by `INFRA_MODE`:

- **`INFRA_MODE=local`**: Runs without local container dependencies. Uses SQLite/in-memory fallback mock storage providers for storage, authentication, and execution sandbox.
- **`INFRA_MODE=full`**: Connects to real local container infrastructure (PostgreSQL, Redis/BullMQ, Keycloak OAuth2, MinIO biometric storage, Judge0 code execution engine).

---

## 🔒 Security & CORS Co-Existence

External ATS application backends and frontends can interact with CD-Recruit via REST API and Webhooks. CORS allowed origins are controlled dynamically in `.env`:

```env
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5174,http://localhost:5173,http://localhost:8000
```

---

## 📁 Repository Structure

```
codebase/
├── backend/
│   ├── api/                   # NestJS Monolith REST API & Correlation Module
│   └── prisma/                # Prisma ORM schema, migrations, and seed scripts
├── frontend/
│   ├── admin-web/             # Recruiter Dashboard (React 19 + Vite)
│   └── candidate-web/         # Candidate Assessment Shell (React 19 + Vite)
├── packages/
│   └── shared-types/          # Shared TypeScript DTOs, interfaces, and contracts
├── docker/                    # Docker Compose stacks for Postgres, Keycloak, MinIO, Judge0
└── docs/                      # Canonical living specs, integration docs, and references
```

---

## 📚 Living Documentation Catalog

The `docs/` folder contains authoritative specifications organized by domain:

- **Architecture & Specifications (`docs/architecture/`)**:
  - [Technical Architecture Document](docs/architecture/CD-Recruit_MVP_Architecture_and_Launch_Plan_v2.md)
  - [Three-Track Build Plan](docs/architecture/CD-Recruit_Audit_Findings_TODO_and_Three_Track_Build_Plan.md)
  - [Candidate Workflow & API Contracts](docs/architecture/CANDIDATE_WORKFLOW_AND_API_CONTRACTS.md)
  - [Infrastructure Modes Reference](docs/architecture/INFRA_MODE.md)
  - [Architectural Decisions Record](docs/architecture/DECISIONS.md)
  - [Security & Biometrics Retention Policy](docs/architecture/SECURITY.md)

- **Partner Integration (`docs/partner-integration/`)**:
  - [Complete API Endpoints Catalog](docs/partner-integration/COMPLETE_API_ENDPOINTS_CATALOG.md)
  - [Partner API Integration Requirements](docs/partner-integration/CD-Recruit_Partner_API_Integration_Requirements.md)
  - [OpenAPI / Swagger Schemas Reference](docs/partner-integration/swagger_schemas.md)

- **Technical References (`docs/references/`)**:
  - Module status audits, DTO references, UI inventory, and database ER diagrams.
