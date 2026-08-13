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

Launch the backing services (PostgreSQL, Redis, Keycloak, MinIO, Judge0):

```bash
npm run infra:up
```

#### Verify Container Health
```bash
docker ps
```
All 6 containers should show `Up` and `Healthy`.

---

### Step 3: Install Workspace Dependencies

Install dependencies from the root directory:

```bash
npm install
```
> **Note:** The `postinstall` hook will automatically compile `@cd-recruit/shared-types`.

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
npm run db:seed       # Seed default staff, role templates, and questions
```

---

### Step 5: Launch Application Services

Open separate terminal windows to launch the services:

```bash
# Terminal 1: NestJS Backend REST API (Port 3001)
npm run dev:api

# Terminal 2: Admin Web Recruiter Dashboard (Port 3000)
npm run dev:admin

# Terminal 3: Candidate Web Assessment Shell (Port 5173)
npm run dev:candidate
```

- **Admin Web Dashboard**: `http://localhost:3000`
- **Candidate Web Shell**: `http://localhost:5173`
- **NestJS REST API**: `http://localhost:3001/api/v1`
- **Swagger Documentation**: `http://localhost:3001/docs`

---

## 2. Infrastructure Services, Ports & Default Credentials

### Backing Service Container Matrix

| Container Name | Service | Local Port | Default Credentials / Notes |
| :--- | :--- | :--- | :--- |
| `cdrecruit_postgres_dev` | PostgreSQL 16 | **`5434:5432`** | User: `cdrecruit`<br>Pass: `cdrecruit123`<br>Database: `cdrecruit` |
| `cdrecruit_keycloak_dev` | Keycloak 24 (OIDC) | `8080:8080` | Realm: `cd-recruit`<br>Admin Console: `http://localhost:8080` (`admin` / `admin`) |
| `cdrecruit_redis_dev` | Redis 7 | `6379:6379` | BullMQ queues & session cache |
| `cdrecruit_minio_dev` | MinIO Storage | `9000` (API)<br>`9001` (Console) | User: `minioadmin`<br>Pass: `minioadmin` |
| `cdrecruit_judge0_server` | Judge0 CE Server | `2358:2358` | Code sandbox execution engine |
| `cdrecruit_judge0_worker` | Judge0 Sandboxed Worker | Internal | Queue worker for Judge0 execution |

---

### Default Application Login Credentials

#### Admin Dashboard (`http://localhost:3000`)
- **Admin Role**: Username `demo-admin` (or `admin@cdrecruit.local`) \| Password `password`
- **Recruiter Role**: Username `demo-recruiter` (or `recruiter@cdrecruit.local`) \| Password `password`

---

## 3. Troubleshooting & Common Setup Reference

### Q1: Why does `npm run db:migrate` report `Environment variable not found: DATABASE_URL`?

* **Cause**: `npm run db:migrate` runs `npm --workspace=backend/api run prisma:migrate`, switching working directory to `backend/api`. Prisma CLI searches for `.env` only in `backend/api/.env` or `backend/prisma/.env`, not the root directory.
* **Fix**: Ensure `.env` is copied to [`backend/api/.env`](file:///d:/Projects/cd-recruit/test-drive/CD-Recruit/backend/api/.env).
* **Warning**: Do NOT place a `.env` file in `backend/prisma/` at the same time as `backend/api/`, as Prisma CLI will report a file conflict error.

---

### Q2: Why does Prisma report `Can't reach database server at localhost:5434` or shadow DB errors?

* **Database Connection Failure (`P1001`)**: Ensure Docker containers are running (`npm run infra:up`) and Postgres is healthy on port `5434`.
* **Idempotent Enum Migration Guards**: All custom SQL enum creations use PL/pgSQL guards to prevent `type "X" already exists` errors during migration replays or shadow database checks:
  ```sql
  DO $$ BEGIN
    CREATE TYPE "ModuleType" AS ENUM ('MCQ', 'SQL', 'CODING', 'AI_PROMPTING', 'SIMULATION');
  EXCEPTION WHEN duplicate_object THEN null; END $$;
  ```
* **Database Migration Reset**: If your local development database state becomes corrupted or out of sync:
  ```bash
  npm --workspace=backend/api run prisma migrate reset --force
  ```

---

### Q3: Why did admin login result in a 401 error and immediate redirect to `/login`?

* **Keycloak RS256 Token Validation**:
  - Keycloak issues RS256 tokens signed with its RSA private key.
  - NestJS API's `JwtStrategy` automatically inspects incoming JWT headers for Keycloak's `kid` field and fetches Keycloak's JWKS public key on port `8080` to verify authentic Keycloak sessions.
  - Ensure `KEYCLOAK_URL=http://localhost:8080` is configured in `.env` and `backend/api/.env`.

---

### Q4: Why does `@cd-recruit/shared-types` throw `Module Not Found` on a fresh clone?

* **Cause**: TypeScript workspace packages produce `dist/` build artifacts that are gitignored.
* **Fix**: Running `npm install` automatically triggers a `"postinstall": "npm run build:shared"` hook to build `packages/shared-types`. If needed, run `npm run build:shared` manually.
