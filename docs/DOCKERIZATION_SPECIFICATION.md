# CD-Recruit: Dockerization & Container Architecture Specification

> **Target Audience:** DevOps / Platform Engineering / Infrastructure Team  
> **Repository:** `cd-recruit/codebase`  
> **Branch:** `dev-phase2-deploy`  
> **Scope:** Full containerization specification for building production images and deploying staging & live environments.

---

## 1. Monorepo Structure & Build Constraints

The application is structured as an **npm monorepo** with 5 interrelated workspaces:

```
codebase/
├── package.json               # Root workspace manifest & orchestration scripts
├── packages/
│   ├── shared-types/          # Canonical TypeScript interfaces & enums
│   └── design-tokens/         # Token definitions & CSS utilities
├── backend/
│   ├── prisma/                # Prisma ORM schema & database migrations
│   └── api/                   # NestJS monolith backend (Port 3001)
└── frontend/
    ├── candidate-web/         # Candidate assessment SPA (Vite + React 19)
    └── admin-web/             # Recruiter & Admin Dashboard (TanStack Start + React 19)
```

### Critical Build Dependency Order
Both frontend applications and the backend API import packages from `@cd-recruit/shared-types` and `@cd-recruit/design-tokens`.
**Rule for Dockerfiles:** In any Docker build stage, you must copy the package manifests, run `npm ci`, and build the shared packages **before** compiling the application targets:
```bash
npm --workspace=packages/shared-types run build
npm --workspace=packages/design-tokens run build
```

---

## 2. Container Specifications & Requirements

### 1. Backend Monolith API (`@cd-recruit/api`)
* **Framework:** NestJS 11 (Node.js 20 LTS)
* **Listening Port:** `3001` (Internal container port)
* **Build Steps:**
  1. Base on `node:20-alpine`.
  2. Install native build dependencies: `apk add --no-cache python3 make g++ curl`.
  3. Copy `packages/shared-types`, `packages/design-tokens`, `backend/prisma`, and `backend/api`.
  4. Run shared package builds.
  5. Run Prisma generation: `npx --prefix backend/api prisma generate --schema=backend/prisma/schema.prisma`.
  6. Run `npm --workspace=backend/api run build` (outputs to `backend/api/dist`).
  7. Prune development dependencies (`npm prune --production`).
* **Runtime Container:**
  * Minimal `node:20-alpine` runner.
  * Run as non-root user: `USER node`.
  * Entrypoint: `node dist/main`.
* **Health Check:**
  * HTTP GET endpoint: `http://localhost:3001/api/v1/health` (Returns status 200 with database/storage health).

---

### 2. Candidate Web Client (`@cd-recruit/candidate-web`)
* **Framework:** Vite 6 / React 19 SPA
* **Delivery:** Static bundle served via high-performance Nginx.
* **Build Arguments (Injected at build time):**
  * `VITE_API_BASE_URL` (e.g., `https://api.cdrecruit.com/api/v1`)
  * `VITE_WS_URL` (e.g., `wss://api.cdrecruit.com`)
* **Nginx Requirements:**
  * Base: `nginx:alpine`
  * Enable Gzip compression for text, json, javascript, css, svg.
  * **SPA Fallback Routing:** Ensure all client-side paths route through `index.html`:
    ```nginx
    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }
    ```
  * **Static Caching:** Immutable cache headers for `/assets/` (`Cache-Control "public, max-age=31536000, immutable"`).
  * **Health Check:** Simple `/healthz` returning 200 OK.

---

### 3. Admin Web Dashboard (`@cd-recruit/admin-web`)
* **Framework:** TanStack Start / Vite / React 19
* **Port:** `5173`
* **Build Arguments:**
  * `VITE_API_BASE_URL` (e.g., `https://api.cdrecruit.com/api/v1`)
* **Runtime:** Node.js runner executing `npm run preview -- --host 0.0.0.0 --port 5173` (or node SSR server).

---

## 3. Sandboxes & Accompanying Services

### 1. Judge0 Code Sandbox Tier (Target of Staging Load Testing)
* **Image:** `judge0/judge0:1.13.1`
* **Architecture:**
  * `judge0-server`: Receives submissions via HTTP on port `2358` and queues jobs in Redis (`judge0:queue`).
  * `judge0-worker`: Consumes execution jobs from Redis and executes code using the Linux **isolate** sandbox.
* **Kernel & Host Privilege Requirements:**
  * Workers must run with `privileged: true` and `security_opt: [ "seccomp:unconfined" ]`.
  * Host must support cgroups v2 (`systemd.unified_cgroup_hierarchy=1`).
* **Horizontal Scaling (For Load Testing):**
  * The worker tier scales horizontally: `--scale judge0-worker=4` (or 8 for high concurrency).
  * Resource limit environment variables:
    ```env
    CPU_TIME_LIMIT=5.0
    MAX_CPU_TIME_LIMIT=10.0
    MEMORY_LIMIT=262144
    MAX_MEMORY_LIMIT=524288
    MAX_PROCESSES_AND_OR_THREADS=64
    MAX_OUTPUT_SIZE=1024
    ENABLE_PER_PROCESS_AND_THREAD_TIME_LIMIT=true
    ENABLE_PER_PROCESS_AND_THREAD_MEMORY_LIMIT=true
    ```

### 2. Redis 7 (BullMQ & Session Cache)
* **Image:** `redis:7-alpine`
* **Port:** `6379`
* Used by NestJS BullMQ for async grading and session timeouts, and by Judge0 for job queues.

### 3. MongoDB 6.0 (NoSQL Assessment Module)
* **Image:** `mongo:6.0`
* **Port:** `27017`
* **Initialization:** Mount `docker/mongo-init/` to `/docker-entrypoint-initdb.d` to initialize seed databases for the candidate NoSQL querying challenges.

### 4. Face Verification Microservice
* **Path:** `services/face-verify/`
* **Framework:** Python 3.11 + FastAPI + DeepFace
* **Port:** `8000` (Internal), `8001` (Host)
* Used by candidate consent flow for webcam verification against uploaded ID proof embeddings.

---

## 4. Seamless Cloud Cutover (AWS S3 & AWS RDS)

The application supports **seamless dual-routing**: running on containerized Postgres/MinIO for local staging, or pointing directly to AWS Managed Services without touching application code.

### 1. AWS RDS PostgreSQL Cutover
* **Code Changes Required:** **Zero.** Prisma connects over TLS natively.
* **Environment Variable:**
  ```env
  DATABASE_URL=postgresql://cdrecruit_admin:<PASSWORD>@<RDS_ENDPOINT>.rds.amazonaws.com:5432/cdrecruit?sslmode=require
  ```
* **SQL Sandbox Isolation:**
  Candidates execute queries in the SQL assessment module. In production, **never** allow candidate queries to run against the primary application schema:
  ```env
  SANDBOX_DB_URL=postgresql://sandbox_user:<PASSWORD>@<RDS_ENDPOINT>.rds.amazonaws.com:5432/cdrecruit_sandbox?sslmode=require
  ```
* **Applying Migrations:**
  ```bash
  docker run --rm --env-file .env cdrecruit-api:latest npx prisma migrate deploy --schema=backend/prisma/schema.prisma
  ```

### 2. AWS S3 Cutover (Replacing MinIO)
The backend's storage client uses the S3 protocol. The application dynamically reads `AWS_REGION` and handles pre-existing buckets with standard IAM permissions:
```env
MINIO_ENDPOINT=s3.ap-south-1.amazonaws.com    # Or your target AWS S3 endpoint
MINIO_PORT=443
MINIO_USE_SSL=true
MINIO_REGION=ap-south-1
MINIO_ACCESS_KEY=AKIA...                     # AWS IAM Access Key
MINIO_SECRET_KEY=...                         # AWS IAM Secret Key
MINIO_BUCKET_GENERAL=cdrecruit-prod-general
MINIO_BUCKET_BIOMETRIC=cdrecruit-prod-biometric
```

---

## 5. Deployment Ports & Routing Overview

| Tier / Service | Container Port | Staging Host Port | Production Reverse Proxy Routing |
| :--- | :--- | :--- | :--- |
| `candidate-web` | `80` | `5174` | `https://candidate.cdrecruit.com` |
| `admin-web` | `5173` | `5173` | `https://admin.cdrecruit.com` |
| `api` | `3001` | `3001` | `https://api.cdrecruit.com` |
| `judge0-server` | `2358` | `2358` | Internal VPC / Cluster Network Only |
| `judge0-worker` | - | - | Internal VPC / Cluster Network Only |
| `redis` | `6379` | `6379` | Internal VPC / Cluster Network Only |
| `mongodb` | `27017` | `27017` | Internal VPC / Cluster Network Only |
| `face-verify` | `8000` | `8001` | Internal VPC / Cluster Network Only |
| `grafana` | `3000` | `3100` *(Remapped from 3001)* | `https://monitor.cdrecruit.com` |
| `prometheus` | `9090` | `9090` | Internal VPC / Cluster Network Only |

---

## 6. Architecture Evolution & Live Status

1. **Admin Authentication (Native In-House Staff JWT — Complete):**
   * Keycloak has been decommissioned.
   * Production and staging deployments use native NestJS Staff JWT authentication (`crypto.scrypt` password hashing + HS256 JWT tokens).
   * Endpoints `POST /api/v1/auth/login`, `POST /api/v1/auth/refresh`, and `POST /api/v1/auth/logout` are live. Configure `JWT_SECRET` (minimum 32 characters) in production.
2. **Interactive Assessment Modules (All 8 Active):**
   * All 8 assessment modules (MCQ, SQL, NoSQL, Coding, Debugging, AI Prompting, Contextual Simulation, Test Scenarios) are integrated with candidate execution endpoints and automated grading.
   * Ensure MongoDB (`27017`) and Judge0 CE (`2358`) clusters are accessible in the VPC network for candidate submissions.
