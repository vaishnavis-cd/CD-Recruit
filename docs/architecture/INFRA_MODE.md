# Infrastructure Modes in CD-Recruit (INFRA_MODE)

CD-Recruit supports a dual-mode infrastructure architecture (`INFRA_MODE`) to enable fast, zero-dependency local development while maintaining seamless parity with production cloud environments (AWS RDS, AWS S3, Redis, and Judge0 clusters).

---

## 1. What `INFRA_MODE=local` Changes

When `INFRA_MODE=local` is configured in `.env`:

* **Redis & BullMQ**:
  - No connection is attempted to Redis.
  - Delayed jobs (such as candidate disconnect grace-window auto-submission) and repeatable jobs (heartbeat staleness checks) run via an in-memory Node.js scheduler using timeouts and intervals (`LocalScheduler`).
* **MinIO / S3 Object Storage**:
  - No connection is established with MinIO or AWS S3.
  - The application injects `FakeStorageService`.
  - Image and selfie uploads succeed immediately (`true`) without attempting a network write.
  - Presigned URLs for evidence clips return `null` (or the value of `FAKE_EVIDENCE_URL` if explicitly set for testing).
* **Judge0 Code Sandbox**:
  - Uses mock execution responses for coding challenges if Judge0 CE is unreachable.
* **Face Verification Microservice**:
  - Falls back to simulated biometric approval if `services/face-verify` is not running.
* **Authentication**:
  - In-House Staff JWT (`crypto.scrypt` + HS256) runs entirely in-process against PostgreSQL.

---

## 2. Known Behavior Differences — Read Before Debugging

* **Volatile Job Scheduler**: The fake in-memory queue does not persist state across process restarts. Restarting the NestJS API (or nodemon automatic reload upon code edit) drops all active grace-window timers. Do not test long-running disconnect grace windows across API reboots in `local` mode.
* **No Queue Concurrency & Backoff**: The in-memory scheduler does not simulate BullMQ features like exponential backoff, retry attempts, or distributed locks.
* **Mock Object Storage**: The fake storage provider does not create buckets or enforce S3 IAM access controls. Use `INFRA_MODE=full` to verify presigned upload/download URL validity.
* **Production Guardrail**: `INFRA_MODE=local` is strictly blocked in production (`NODE_ENV=production`) during NestJS bootstrap in `main.ts` to prevent accidental operational bypass or data loss.

---

## 3. Switching to `INFRA_MODE=full` (Docker or Cloud)

To run the complete production-grade container suite locally:

1. **Start Backing Containers**:
   ```bash
   npm run infra:up
   ```
   Confirm containers are running and healthy:
   - `cdrecruit_postgres_dev` (Port 5434)
   - `cdrecruit_redis_dev` (Port 6379)
   - `cdrecruit_minio_dev` (Ports 9000 / 9001)
   - `cdrecruit_mongodb_dev` (Port 27017)
   - `cdrecruit_judge0_server` (Port 2358)
   - `cdrecruit_judge0_worker`

2. **Configure `.env`**:
   Set `INFRA_MODE=full` in `.env` and `backend/api/.env`.

3. **Verify MinIO Buckets**:
   `MinioService.ensureBucketsExist()` will automatically create `cd-recruit-general` and `cd-recruit-biometric` on startup. You can verify this in the MinIO console (`http://localhost:9001` with `minioadmin` / `minioadmin`).

4. **Verify BullMQ in Redis**:
   With `INFRA_MODE=full`, disconnect grace-window timers and heartbeat repeatable checks persist across NestJS reloads inside Redis.

5. **Cloud Deployment (AWS RDS & S3)**:
   - In AWS staging/production, `INFRA_MODE` must always be `full`.
   - Set `DATABASE_URL` to your AWS RDS PostgreSQL endpoint.
   - Point `MINIO_ENDPOINT=s3.<region>.amazonaws.com`, `MINIO_PORT=443`, `MINIO_USE_SSL=true`, and provide AWS IAM access credentials.
