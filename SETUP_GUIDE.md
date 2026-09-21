# CD-Recruit — Teammate Branch Update & Setup Guide

This guide is for teammates who are already working on the repository and are pulling this branch.

---

## 📌 What Changed in This Branch?

1. **In-Process ONNX Face Verification & PaddleOCR:**
   - Standalone Python face verification service (`8001`) is replaced by in-process ONNX runtime (`RetinaFace` + `ArcFace 512-D`) and PaddleOCR (`DBNet` + `CRNN`) inside the backend API container (`3001`).
   - Models are packaged directly inside `docker/api.Dockerfile`.
   - Matching threshold calibrated to `0.72` with robust name & OCR extraction matching.
2. **Dynamic Evidence & Media Streamer:**
   - Identity proofs and video proctoring clips stream directly through `/api/v1/proctoring/stream/...`, eliminating MinIO S3 hostname resolution/CORS issues in browsers.
3. **NoSQL Sandbox MongoDB Integration:**
   - Injected `MONGODB_URL=mongodb://admin:adminpassword@mongodb:27017/admin` directly into API container and app config.
4. **Candidate Web SPA Routing & CORS:**
   - Candidate Web is served on port `5174` with proper COOP/COEP headers for WASM proctoring.

---

## 🚀 Steps for Teammates After Pulling

### Step 1: Pull the Latest Changes
```bash
git pull origin <branch-name>
```

### Step 2: Ensure `.env` is Up-to-Date
If running locally outside Docker, ensure your `.env` has:
```env
MONGODB_URL=mongodb://admin:adminpassword@localhost:27017/admin
```
*(If running via Docker Compose, this is automatically configured inside `docker-compose.yml`).*

---

### Step 3: Rebuild and Start the Containers
Since Dockerfiles and dependencies have been updated, rebuild the images:

```bash
docker compose up -d --build
```

---

### Step 4: Verify Database State
Ensure any migrations are up-to-date:

```bash
docker exec cdrecruit_api npx prisma migrate deploy --schema=backend/prisma/schema.prisma
```

*(Optional: If test seed data or fresh candidate tokens are needed)*:
```bash
docker exec cdrecruit_api npm run prisma:seed
docker exec cdrecruit_api npx tsx backend/prisma/generate-drive-and-invites.ts
```

---

## 🌐 Quick Access URLs

| Application | URL | Default Credentials |
| :--- | :--- | :--- |
| **Candidate Web Portal** | [http://localhost:5174](http://localhost:5174) | Candidate test interface |
| **Admin Dashboard** | [http://localhost:5173](http://localhost:5173) | `admin@cdrecruit.com` / `admin123` |
| **Backend API / Swagger** | [http://localhost:3001/api/docs](http://localhost:3001/api/docs) | NestJS REST API |
| **MinIO Console** | [http://localhost:9001](http://localhost:9001) | `minioadmin` / `minioadmin` |
| **MongoDB (NoSQL Sandbox)** | `localhost:27017` | `admin` / `adminpassword` |
| **Judge0 Code Sandbox** | [http://localhost:2358/system_info](http://localhost:2358/system_info) | Code Execution Sandbox |

---

## 🛠️ Troubleshooting for Existing Workspaces

- **View Live Logs:**
  ```bash
  docker logs -f cdrecruit_api
  ```
- **If existing volume data is retained:**
  Existing volumes (`docker_postgres_data`, `docker_redis_data`, `docker_minio_data`, `docker_mongodb_data`) are preserved and automatically reattached.
- **To completely restart containers:**
  ```bash
  docker compose down
  docker compose up -d --build
  ```
