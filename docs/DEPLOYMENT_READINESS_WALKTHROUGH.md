# CD-Recruit — Deployment Readiness & Production Cutover Walkthrough

> **Target Audience:** DevOps / Platform Engineers, Site Reliability Engineers, and Engineering Leads  
> **Applicable Environments:** Staging, Pre-Production, and Live Production (AWS Cloud)

---

## 1. Overview & Scope

This walkthrough provides the step-by-step procedures to validate platform stability under load, scale containerized worker fleets, and execute seamless production cutovers from local containers to managed AWS cloud infrastructure (**AWS RDS PostgreSQL** and **AWS S3**).

---

## 2. Production Pre-Flight Checklist

Before deploying CD-Recruit to production, verify each of the following requirements:

- [ ] **Infrastructure Mode**: Set `INFRA_MODE=full` in production environment variables (`NODE_ENV=production` forbids `local`).
- [ ] **Staff JWT Secret**: `JWT_SECRET` must be set to a cryptographically random string of at least 32 characters (`openssl rand -base64 32`).
- [ ] **Candidate Session Secret**: `CANDIDATE_JWT_SECRET` must be configured separately from `JWT_SECRET`.
- [ ] **Database Connection Strings**:
  - `DATABASE_URL`: Dedicated master application connection with connection pooling (e.g. AWS RDS Aurora Serverless v2 or RDS PostgreSQL 16).
  - `SANDBOX_DB_URL`: Separate read-only user/database instance for candidate SQL execution.
- [ ] **Storage Protocol**: S3 buckets `cdrecruit-prod-general` and `cdrecruit-prod-biometric` created with private ACLs and server-side encryption.
- [ ] **Judge0 CE Sandbox**: Clustered deployment with kernel cgroup v2 support and horizontal worker scaling.
- [ ] **Observability**: Prometheus metrics scraping on port `9090` and Grafana monitoring on port `3100`.

---

## 3. Load Testing with k6

The platform includes automated k6 load testing scripts located in `k6/scripts/judge0_load_test.js` to benchmark Judge0 execution throughput and API latency under concurrent assessment submissions.

### Running the Load Test
```bash
# Execute standard load test
npm run test:load

# Execute with custom virtual users and duration
k6 run --vus 50 --duration 5m ./k6/scripts/judge0_load_test.js
```

### Performance Target Thresholds
- **HTTP Latency ($p95$)**: $< 400\text{ ms}$ for standard REST endpoints.
- **Judge0 Execution Latency ($p95$)**: $< 2.5\text{ seconds}$ under 50 concurrent submissions.
- **Error Rate**: $< 0.1\%$ across all API calls.

---

## 4. Scaling Judge0 CE Worker Tier

The Judge0 CE execution engine separates submission ingestion (`judge0-server`) from code compilation and execution (`judge0-worker`). In high-volume recruitment drives with hundreds of concurrent candidates, scale the worker tier horizontally:

```bash
# Scale to 4 worker processes locally or in staging:
docker compose -f docker/docker-compose.dev.yml -f docker/docker-compose.judge0.yml up -d --scale judge0-worker=4

# In Kubernetes / ECS:
# Scale judge0-worker Deployment replicas to 8-16 depending on CPU load.
```

### Worker Host Kernel Requirements
- **Privileges**: Workers must run with `privileged: true` and `security_opt: [ "seccomp:unconfined" ]` to manage Linux `isolate` sandboxes.
- **Cgroups**: Host system must enable unified cgroups v2 (`systemd.unified_cgroup_hierarchy=1`).

---

## 5. AWS RDS PostgreSQL Cutover Runbook

CD-Recruit requires **zero code changes** to migrate from local PostgreSQL to AWS RDS:

### 1. Provision RDS PostgreSQL Instance
- Engine: PostgreSQL 16.x
- Enable SSL/TLS enforcement.
- Configure Multi-AZ for high availability.

### 2. Apply Prisma Database Migrations
Run Prisma migration deployment from a deployment task or bastion container:

```bash
DATABASE_URL="postgresql://cdrecruit_admin:<STRONG_PASSWORD>@<RDS_ENDPOINT>.rds.amazonaws.com:5432/cdrecruit?sslmode=require" \
npm --workspace=backend/api run prisma migrate deploy
```

### 3. Seed Reference Data
Seed the 32 role templates and initial administrator credentials:

```bash
DATABASE_URL="postgresql://cdrecruit_admin:<STRONG_PASSWORD>@<RDS_ENDPOINT>.rds.amazonaws.com:5432/cdrecruit?sslmode=require" \
npm --workspace=backend/api run prisma:seed
```

### 4. Configure Isolated SQL Sandbox
Provision a restricted database schema/user with read-only privileges for candidate SQL assessments:

```env
SANDBOX_DB_URL="postgresql://sandbox_user:<PASSWORD>@<RDS_ENDPOINT>.rds.amazonaws.com:5432/cdrecruit_sandbox?sslmode=require"
```

---

## 6. AWS S3 Cutover Runbook (Replacing MinIO)

The backend storage client connects via the standard AWS S3 SDK. To switch from local MinIO to AWS S3:

### 1. S3 Environment Variables
Configure the following environment variables on the backend container:

```env
MINIO_ENDPOINT=s3.ap-south-1.amazonaws.com
MINIO_PORT=443
MINIO_USE_SSL=true
MINIO_REGION=ap-south-1
MINIO_ACCESS_KEY=AKIA...
MINIO_SECRET_KEY=...
MINIO_BUCKET_GENERAL=cdrecruit-prod-general
MINIO_BUCKET_BIOMETRIC=cdrecruit-prod-biometric
```

### 2. Bucket CORS Policy
Ensure the `cdrecruit-prod-biometric` bucket has CORS configured for direct browser uploads:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedOrigins": ["https://candidate.cdrecruit.com", "https://admin.cdrecruit.com"],
    "ExposeHeaders": ["ETag"]
  }
]
```

---

## 7. Post-Deployment Smoke Test & Verification

Once deployed to staging or production, execute these smoke test checks:

1. **API Health Probe**:
   ```bash
   curl -i https://api.cdrecruit.com/api/v1/health
   # Must return HTTP 200 with {"status":"ok","database":"healthy","storage":"healthy"}
   ```
2. **Admin Authentication**:
   - Access `https://admin.cdrecruit.com/login`.
   - Log in with provisioned admin credentials.
   - Verify dashboard metrics and recruitment drive list load within 200ms.
3. **Candidate Invite & Session Flow**:
   - Create a test recruitment drive and register a test candidate.
   - Open candidate assessment URL in a clean browser window.
   - Complete System Check, Biometric KYC check, and verify camera stream uploads to S3.
   - Run sample Coding and SQL tests to confirm Judge0 and PostgreSQL sandbox connectivity.
   - Submit assessment and verify hiring report appears in the Recruiter Dashboard.
