# CD-Recruit

AI-powered technical assessment platform. Candidates complete a timed multi-module assessment (MCQ, SQL, Coding, AI Prompting, Simulation) that is automatically graded by the Correlation Engine and reviewed by recruiters.

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) ≥ 24
- [Node.js](https://nodejs.org/) ≥ 20 (for local API dev without Docker)
- [npm](https://www.npmjs.com/) ≥ 10

## Quick Start — Local Infrastructure

Start all backing services (Postgres, Redis, Keycloak, MinIO):

```bash
docker compose -f docker/docker-compose.dev.yml up -d
```

Check that all four services are running:

```bash
docker ps
```

Expected containers: `cdrecruit_postgres_dev`, `cdrecruit_redis_dev`, `cdrecruit_keycloak_dev`, `cdrecruit_minio_dev`.

Stop all services:

```bash
docker compose -f docker/docker-compose.dev.yml down
```

## Service URLs

| Service                | URL                                     | Credentials                              |
| ---------------------- | --------------------------------------- | ---------------------------------------- |
| Postgres               | `localhost:5432`                        | cdrecruit / cdrecruit123 / db: cdrecruit |
| Redis                  | `localhost:6379`                        | no auth                                  |
| Keycloak Admin Console | http://localhost:8080                   | admin / admin                            |
| Keycloak Realm         | http://localhost:8080/realms/cd-recruit | —                                        |
| MinIO Console          | http://localhost:9001                   | minioadmin / minioadmin                  |
| MinIO API              | http://localhost:9000                   | minioadmin / minioadmin                  |

> ⚠️ **Keycloak realm settings are placeholder defaults.** Verify client redirect URIs against actual frontend dev server ports before Phase 4 (Auth) work begins. See `docker/keycloak/realm-export.json` for details.

## Running the Backend API Locally

```bash
# Install dependencies
npm install

# Apply database migrations (first time only — already applied for Phase 1)
npm run db:migrate

# Seed reference data
npm run db:seed

# Start NestJS API with hot-reload
npm run dev:api
```

The API will be available at `http://localhost:3001/api/v1`.

## Project Structure

```
cd-recruit/
├── backend/
│   ├── api/              # NestJS REST API (Node.js)
│   ├── correlation-engine/  # FastAPI grading service (Python)
│   ├── prisma/           # Schema, migrations, seed data
│   └── shared/           # Re-exports from packages/shared-types
├── frontend/
│   ├── candidate-web/    # Candidate assessment SPA
│   ├── admin-web/        # Recruiter review dashboard
│   └── shared/           # Re-exports from packages/shared-types
├── packages/
│   └── shared-types/     # Single source of truth for all shared TypeScript types
├── docker/               # Dockerfiles and docker-compose files
└── docs/                 # API contract, DTOs, architecture decisions
```

## Key Docs

- [docs/API_CONTRACT.md](docs/API_CONTRACT.md) — Full REST API specification
- [docs/DTO.md](docs/DTO.md) — NestJS DTO class reference
- [backend/prisma/README.md](backend/prisma/README.md) — Database schema and seed notes
