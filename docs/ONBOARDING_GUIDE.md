# CD-Recruit — Developer Onboarding & Architecture Guide

Welcome to the **CD-Recruit** engineering team! This document is a complete guide to getting your local development environment up and running smoothly, understanding the monorepo structure, and managing common setup issues.

---

## 1. Frequently Encountered Setup Questions

### Q1: Why did the `@cd-recruit/shared-types` "Module Not Found" error occur, and how is it fixed?

* **The Root Cause**:
  1. **Unbuilt Build Artifacts (`dist/`)**: `@cd-recruit/shared-types` is a TypeScript workspace package that exports pre-compiled JavaScript (`./dist/cjs/index.js`, `./dist/esm/index.js`) and TypeScript definitions (`./dist/esm/index.d.ts`). Since `dist/` is gitignored (standard practice), a fresh `git clone` does not contain built files.
  2. **Missing Workspace Dependencies**: Previously, neither `backend/api/package.json` nor `frontend/admin-web/package.json` declared `"@cd-recruit/shared-types": "*"` in their `dependencies`. This prevented NPM from reliably creating `node_modules/@cd-recruit/shared-types` symlinks in workspace subdirectories.
  3. **Unexecuted Build Hook**: Running `npm install` on a fresh clone without an explicit `postinstall` script installed NPM packages without compiling `packages/shared-types`. Attempting to launch Node/NestJS or Vite dev servers directly resulted in Node throwing `Cannot find module '@cd-recruit/shared-types'`.

* **How It Is Solved**:
  - `"@cd-recruit/shared-types": "*"` is explicitly listed under `dependencies` across `backend/api`, `frontend/admin-web`, and `frontend/candidate-web`.
  - A `"postinstall": "npm run build:shared"` hook in the root `package.json` automatically compiles `packages/shared-types` immediately after `npm install` finishes.
  - Development scripts (`dev:api`, `dev:admin`, `dev:candidate`) invoke `npm run build:shared` before starting their respective dev servers.

---

### Q2: Why do 39 vulnerabilities appear when running `npm install`?

* **The Root Cause**:
  1. **Transitive DevDependencies**: Over 80% of the reported security advisories originate from nested build-time development tools (e.g. `@nestjs/cli`, `webpack`, `picomatch`, `tmp`, `postcss`). These dependencies are used strictly on local developer machines during compilation and are never deployed into production runtime environments.
  2. **SemVer Major Version Locks**: NPM strictly respects major version boundaries during standard `npm install` to protect against breaking changes. Resolving advisories in packages like `express`/`qs` or `react-router` requires major framework migrations (e.g. NestJS v10 → v11 or React Router v6 → v7).
  3. **Lockfile Version Snapshots**: The `package-lock.json` pins exact sub-dependency versions established during project creation.

* **Recommended Action**:
  - **Do NOT run `npm audit fix --force` blindly**, as force-upgrading major versions can break application code and component interfaces.
  - Safe patch updates can be performed via `npm audit fix`. Major upgrades are evaluated per release cycle.

---

## 2. Infrastructure Setup — All 6 Core Containers

The platform relies on 6 core backing services running in Docker containers:

| Container Name | Service | Local Port | Health Check Endpoint / Verification | Default Credentials |
| :--- | :--- | :--- | :--- | :--- |
| `cdrecruit_postgres_dev` | PostgreSQL 16 | `5434:5432` | `pg_isready -U cdrecruit -d cdrecruit` | User: `cdrecruit`<br>Pass: `cdrecruit123`<br>DB: `cdrecruit` & `cdrecruit_judge0` |
| `cdrecruit_redis_dev` | Redis 7 | `6379:6379` | `redis-cli ping` | No Auth |
| `cdrecruit_keycloak_dev` | Keycloak 24 (OIDC) | `8080:8080` | `http://localhost:8080/health/ready` | Admin: `admin`<br>Pass: `admin`<br>Realm: `cd-recruit` |
| `cdrecruit_minio_dev` | MinIO Storage | `9000` (API)<br>`9001` (Console) | `http://localhost:9000/minio/health/live` | Admin: `minioadmin`<br>Pass: `minioadmin` |
| `cdrecruit_judge0_server` | Judge0 CE Server | `2358:2358` | `http://localhost:2358/about` | API Key: None (Dev mode) |
| `cdrecruit_judge0_worker` | Judge0 Sandboxed Worker | Internal | Process queue worker | Connected to Redis & Postgres |

---

### Step 1: Start All 6 Infrastructure Containers

To launch all 6 containers with a single command from the project root:

```bash
npm run infra:up
```

*Equivalent Docker command:*
```bash
docker compose -f docker/docker-compose.dev.yml -f docker/docker-compose.judge0.yml up -d
```

#### Verify Running Containers

```bash
docker ps
```

You should see 6 containers running and healthy:
- `cdrecruit_postgres_dev`
- `cdrecruit_redis_dev`
- `cdrecruit_keycloak_dev`
- `cdrecruit_minio_dev`
- `cdrecruit_judge0_server`
- `cdrecruit_judge0_worker`

#### Useful Container Management Commands

```bash
# View live logs across all containers
npm run infra:logs

# Stop all containers
npm run infra:down
```

---

## 3. Application Setup & Initialization

Follow this step-by-step procedure to get the repository built and running locally.

### Step 1: Install Dependencies & Build Shared Types

From the root directory:

```bash
npm install
```

> **Note:** The `postinstall` hook will automatically execute `npm run build:shared` to build `packages/shared-types`.

If you ever make changes to `packages/shared-types/src`, rebuild manually:

```bash
npm run build:shared
```

---

### Step 2: Apply Database Migrations & Seed Data

Ensure the Docker containers (specifically PostgreSQL) are running before executing database commands:

```bash
# Apply Prisma schema migrations to PostgreSQL
npm run db:migrate

# Seed initial system users, staff accounts, questions, and reference data
npm run db:seed
```

> **Convenience Script:** You can run `npm run setup:all` to run `build:shared`, `db:migrate`, and `db:seed` in sequence.

#### Optional: Open Prisma Studio (Database GUI)

```bash
npm run db:studio
```
Available at `http://localhost:5555`.

---

## 4. Running Application Services

Open separate terminal windows for the applications you wish to run:

### Terminal 1: NestJS Backend API

```bash
npm run dev:api
```
- **API URL**: `http://localhost:3001/api/v1`
- **Swagger Documentation**: `http://localhost:3001/docs`

---

### Terminal 2: Admin Web Dashboard (Recruiter Portal)

```bash
npm run dev:admin
```
- **URL**: `http://localhost:3000`

---

### Terminal 3: Candidate Web (Assessment Portal)

```bash
npm run dev:candidate
```
- **URL**: `http://localhost:5173`

---

### Terminal 4 (Optional): Correlation Engine (Python FastAPI)

If you are working on automated scoring or grading rules:

```bash
npm run dev:correlation
```
- **URL**: `http://localhost:8000`

---

## 5. Summary Checklist for New Engineers

```bash
# 1. Start all 6 backing services (Postgres, MinIO, Keycloak, Judge0 Server, Judge0 Worker, Redis)
npm run infra:up

# 2. Install workspace dependencies & auto-build @cd-recruit/shared-types
npm install

# 3. Apply schema migrations & seed reference data
npm run db:migrate
npm run db:seed

# 4. Start services in separate terminals
npm run dev:api        # Backend REST API (Port 3001)
npm run dev:admin      # Admin Web (Port 3000)
npm run dev:candidate  # Candidate Web (Port 5173)
```

Welcome aboard! If you hit any issues, reach out to the platform lead or refer to [docs/API_CONTRACT.md](API_CONTRACT.md).
