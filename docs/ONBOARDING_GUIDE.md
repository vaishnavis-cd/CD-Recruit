# CD-Recruit — Developer Onboarding Guide

Welcome to **CD-Recruit**! This guide will walk you through setting up your local development environment from scratch, running the containerized infrastructure, migrating the database, and starting the application services.

---

## 1. Quick Start & Setup Process

Follow these steps in order for first-time environment setup:

### Step 1: Environment Variable Configuration

1. Copy `.env.example` to create the root `.env`:
   ```bash
   cp .env.example .env
   ```
2. Copy `.env` into the `backend/api` workspace directory:
   ```bash
   cp .env backend/api/.env
   ```
3. Confirm `DATABASE_URL` in `.env` and `backend/api/.env` points to Postgres port **5434**:
   ```env
   DATABASE_URL=postgresql://cdrecruit:cdrecruit123@localhost:5434/cdrecruit
   ```

---

### Step 2: Start Infrastructure Containers

Launch the backing services (PostgreSQL, Redis, MinIO, MongoDB, Judge0 CE, and Face Verify):

```bash
npm run infra:up
```

#### Verify Container Health
```bash
docker ps
```
The active backing containers should show `Up` and `Healthy`:
- `cdrecruit_postgres_dev` (Port `5434:5432`)
- `cdrecruit_redis_dev` (Port `6379:6379`)
- `cdrecruit_minio_dev` (Ports `9000:9000`, `9001:9001`)
- `cdrecruit_mongodb_dev` (Port `27017:27017`)
- `cdrecruit_judge0_server` (Port `2358:2358`)
- `cdrecruit_judge0_worker` (Internal worker)

---

### Step 3: Install Workspace Dependencies

Install dependencies from the root directory:

```bash
npm install
```
> **Note:** The `postinstall` hook will automatically compile `@cd-recruit/shared-types` and `@cd-recruit/design-tokens`.

---

### Step 4: Run Database Migrations & Seed Reference Data

Execute shared type compilation, Prisma database migrations, and initial database seeding in one command:

```bash
npm run setup:all
```

*Individual commands if needed:*
```bash
npm run build:shared  # Build TypeScript workspace packages
npm run db:migrate    # Apply Prisma migrations to Postgres
npm run db:seed       # Seed default staff, role templates (32 tiers), and questions
```

---

### Step 5: Launch Application Services

Open separate terminal windows to launch the services:

```bash
# Terminal 1: NestJS Backend REST API (Port 3001)
npm run dev:api

# Terminal 2: Admin Web Recruiter Dashboard (Port 5173)
npm run dev:admin

# Terminal 3: Candidate Web Assessment Shell (Port 5174)
npm run dev:candidate
```

- **Admin Web Dashboard**: `http://localhost:5173`
- **Candidate Web Shell**: `http://localhost:5174`
- **NestJS REST API**: `http://localhost:3001/api/v1`
- **Swagger Documentation**: `http://localhost:3001/api-docs`

---

## 2. Infrastructure Services, Ports & Default Credentials

### Backing Service Container Matrix

| Container Name | Service | Local Port | Default Credentials / Notes |
| :--- | :--- | :--- | :--- |
| `cdrecruit_postgres_dev` | PostgreSQL 16 | **`5434:5432`** | User: `cdrecruit`<br>Pass: `cdrecruit123`<br>Database: `cdrecruit` |
| `cdrecruit_redis_dev` | Redis 7 | `6379:6379` | BullMQ queues & session cache |
| `cdrecruit_mongodb_dev` | MongoDB 6 | `27017:27017` | User: `admin`<br>Pass: `adminpassword`<br>NoSQL challenge dataset store |
| `cdrecruit_minio_dev` | MinIO Storage | `9000` (API)<br>`9001` (Console) | User: `minioadmin`<br>Pass: `minioadmin`<br>Buckets: `cd-recruit-general`, `cd-recruit-biometric` |
| `cdrecruit_judge0_server` | Judge0 CE Server | `2358:2358` | Polyglot code sandbox execution engine |
| `cdrecruit_judge0_worker` | Judge0 Sandboxed Worker | Internal | Queue worker executing code via Linux isolate sandbox |
| `cdrecruit_face_verify_dev` | Face Verify (FastAPI) | `8001:8000` | DeepFace webcam verification microservice |
| `cdrecruit_grafana` | Grafana Dashboard | `3100:3000` | Observability & metrics dashboard (Remapped from 3001) |

---

### Default Application Login Credentials

#### Admin Dashboard (`http://localhost:5173`)
Authentication uses native In-House Staff JWT (`crypto.scrypt` hashing & HS256 tokens). Pre-seeded staff accounts:

| Role | Username / Email | Password | Access Rights |
|---|---|---|---|
| **Admin** | `admin@cdrecruit.local` (or `demo-admin`) | `password` | Full workspace access: drives, settings, audit logs, partner keys |
| **Recruiter** | `recruiter@cdrecruit.local` (or `demo-recruiter`) | `password` | Drive creation, candidate review, evaluation results |
| **Recruiter (Alt)** | `recruiter@example.com` | `password` | Drive operations & candidate reports |

---

## 3. Troubleshooting & Common Setup Reference

### Q1: Why does `npm run db:migrate` report `Environment variable not found: DATABASE_URL`?

* **Cause**: `npm run db:migrate` runs `npm --workspace=backend/api run prisma:migrate`, switching working directory to `backend/api`. Prisma CLI searches for `.env` only in `backend/api/.env` or `backend/prisma/.env`, not the root directory.
* **Fix**: Ensure `.env` is copied to `backend/api/.env`:
  ```bash
  cp .env backend/api/.env
  ```
* **Warning**: Do NOT place a `.env` file in `backend/prisma/` at the same time as `backend/api/`, as Prisma CLI will report a file conflict error.

---

### Q2: Why does Prisma report `Can't reach database server at localhost:5434` or shadow DB errors?

* **Database Connection Failure (`P1001`)**: Ensure Docker containers are running (`npm run infra:up`) and Postgres is healthy on port `5434`.
* **Idempotent Enum Migration Guards**: All custom SQL enum creations use PL/pgSQL guards to prevent `type "X" already exists` errors during migration replays or shadow database checks:
  ```sql
  DO $$ BEGIN
    CREATE TYPE "ModuleType" AS ENUM ('MCQ', 'SQL', 'NOSQL', 'CODING', 'DEBUGGING', 'AI_PROMPTING', 'SIMULATION', 'TEST_SCENARIOS');
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  ```
* **Database Migration Reset**: If your local development database state becomes corrupted or out of sync:
  ```bash
  npm --workspace=backend/api run prisma migrate reset --force
  ```

---

### Q3: Why did admin login result in a 401 error and immediate redirect to `/login`?

* **In-House Staff JWT Validation**:
  - Authentication is handled directly by `AuthController` (`POST /api/v1/auth/login`) in NestJS using native `crypto.scrypt` password verification against the PostgreSQL `Staff` table.
  - Ensure `JWT_SECRET` is defined in both `.env` and `backend/api/.env` with at least 32 characters.
  - If staff accounts were not seeded or database was reset, run:
    ```bash
    npm run db:seed
    ```
  - Verify your credentials: Username/Email `admin@cdrecruit.local` and Password `password`.

---

### Q4: Why does `@cd-recruit/shared-types` throw `Module Not Found` on a fresh clone?

* **Cause**: TypeScript workspace packages produce `dist/` build artifacts that are gitignored.
* **Fix**: Running `npm install` automatically triggers a `"postinstall": "npm run build:shared"` hook to build `packages/shared-types` and `packages/design-tokens`. If needed, run `npm run build:shared` manually.

---

### Q5: Can I run CD-Recruit without running Docker containers?

* **Yes!** Set `INFRA_MODE=local` in your `.env` and `backend/api/.env`.
* In `local` mode:
  - Redis/BullMQ uses an in-memory scheduler.
  - MinIO S3 storage uses `FakeStorageService` (simulates successful uploads).
  - PostgreSQL is still required (either via lightweight Docker or a local PostgreSQL 16 installation pointing to `DATABASE_URL`).
