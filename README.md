# CD-Recruit

AI-powered technical assessment platform. Candidates complete a timed multi-module assessment (MCQ, SQL, Coding, AI Prompting, Simulation) that is automatically graded by the Correlation Engine and reviewed by recruiters.

> 📘 **New to the team?** Read the detailed [docs/ONBOARDING_GUIDE.md](docs/ONBOARDING_GUIDE.md) for full architecture details, NPM vulnerability analysis, and troubleshooting.

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) ≥ 24
- [Node.js](https://nodejs.org/) ≥ 20
- [npm](https://www.npmjs.com/) ≥ 10

---

## ⚡ Quick Start (4-Step Setup)

### 1. Start All 6 Backing Containers
Launch PostgreSQL, Redis, Keycloak, MinIO, Judge0 Server, and Judge0 Worker simultaneously:

```bash
npm run infra:up
```

Verify all 6 containers are healthy:
```bash
docker ps
```
*Expected containers:* `cdrecruit_postgres_dev`, `cdrecruit_redis_dev`, `cdrecruit_keycloak_dev`, `cdrecruit_minio_dev`, `cdrecruit_judge0_server`, `cdrecruit_judge0_worker`.

### 2. Install Workspace Dependencies
Installs Node modules and automatically builds `@cd-recruit/shared-types`:

```bash
npm install
```

### 3. Migrate Schema & Seed Data
Applies database migrations to PostgreSQL and seeds reference data (users, candidates, questions):

```bash
npm run db:migrate
npm run db:seed
```

*(Or run `npm run setup:all` to execute build, migration, and seeding in one step)*

### 4. Start Applications
Launch services in separate terminal windows:

```bash
# Terminal 1: NestJS Backend REST API (http://localhost:3001/api/v1)
npm run dev:api

# Terminal 2: Admin Web Dashboard (http://localhost:3000)
npm run dev:admin

# Terminal 3: Candidate Assessment Web (http://localhost:5173)
npm run dev:candidate
```

---

## Service URLs & Credentials

| Service | URL | Credentials |
| :--- | :--- | :--- |
| **Postgres** | `localhost:5434` | `cdrecruit` / `cdrecruit123` / db: `cdrecruit` |
| **Redis** | `localhost:6379` | No Auth |
| **Keycloak Admin Console** | `http://localhost:8080` | `admin` / `admin` |
| **MinIO Console** | `http://localhost:9001` | `minioadmin` / `minioadmin` |
| **MinIO API** | `http://localhost:9000` | `minioadmin` / `minioadmin` |
| **Judge0 Server API** | `http://localhost:2358` | No API Key (Dev Mode) |
| **NestJS REST API** | `http://localhost:3001/api/v1` | Swagger: `http://localhost:3001/docs` |
| **Admin Web (Recruiter)** | `http://localhost:3000` | — |
| **Candidate Web** | `http://localhost:5173` | — |

---

## Project Structure

```
cd-recruit/
├── backend/
│   ├── api/                # NestJS REST API (Node.js)
│   ├── correlation-engine/ # FastAPI grading service (Python)
│   ├── prisma/             # Schema, migrations, seed data
│   └── shared/             # Re-exports from packages/shared-types
├── frontend/
│   ├── candidate-web/      # Candidate assessment SPA (Vite/React)
│   ├── admin-web/          # Recruiter review dashboard (Vite/React)
│   └── shared/             # Re-exports from packages/shared-types
├── packages/
│   └── shared-types/       # Single source of truth for all shared TypeScript types
├── docker/                 # Dockerfiles, init scripts, and compose stacks
└── docs/                   # Onboarding guide, API contract, DTOs
```

## Key Documentation

- [docs/ONBOARDING_GUIDE.md](docs/ONBOARDING_GUIDE.md) — Comprehensive developer onboarding & architecture guide
- [docs/API_CONTRACT.md](docs/API_CONTRACT.md) — Full REST API specification
- [docs/DTO.md](docs/DTO.md) — NestJS DTO class reference
- [backend/prisma/README.md](backend/prisma/README.md) — Database schema and seed notes

