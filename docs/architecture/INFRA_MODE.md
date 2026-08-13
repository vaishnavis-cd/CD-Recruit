# Infrastructure Modes in CD-Recruit (INFRA_MODE)

CD-Recruit supports a zero-dependency development mode to simplify local setup.

## What INFRA_MODE=local changes
- **Redis/BullMQ**: No connection is established with Redis. Delayed jobs (grace-window auto-submission) and repeatable jobs (heartbeat staleness checks) run via an in-memory scheduler using Node.js timeouts and intervals.
- **MinIO/Object Storage**: No connection is established with MinIO. Signed URLs for evidence clips return `null` (or the value of `FAKE_EVIDENCE_URL` if configured). Image/selfie uploads return success (`true`) directly without attempting a write.
- **Keycloak**: Keycloak remains unintegrated with the core business logic (no Keycloak SDK calls are made by the application).

## Known behavior differences from real mode — read before debugging
- **Volatile Queue**: The fake in-memory queue does not persist state. Restarting the NestJS API (including automatic nodemon reload) drops all active grace-window timers. Do not test long-running disconnect grace windows across application restarts in local mode.
- **No Queue Resiliency**: The fake queue does not replicate BullMQ features like retries, backoff, or concurrency limits.
- **Mock Storage**: The fake storage provider does not validate bucket existence or permissions, and returns static/null URLs. It cannot be used to verify object storage access controls.
- **Production Guardrail**: `INFRA_MODE=local` is strictly blocked in production (`NODE_ENV=production`) at startup in `main.ts` to prevent accidental data loss or security bypass.

## Cutover checklist — flipping back to INFRA_MODE=full
1. Ensure your local `.env` has the correct Keycloak port mapping: `KEYCLOAK_URL=http://localhost:8085`.
2. Start the full infrastructure suite:
   ```bash
   docker compose -f docker/docker-compose.dev.yml --profile full up -d
   ```
   Confirm all containers (`postgres`, `redis`, `keycloak`, `minio`) are healthy.
3. Confirm that the required MinIO buckets exist. `MinioService.ensureBucketsExist()` will attempt to create `cd-recruit-biometric` and `cd-recruit-general` on startup. You can verify this in the MinIO console (`http://localhost:9001`).
4. Set `INFRA_MODE=full` in `.env` and start the API.
5. Manually verify the disconnect grace window:
   - Disconnect a test session.
   - Confirm that the auto-submit job is enqueued in Redis.
   - Restart the NestJS API mid-wait and verify that the auto-submit job still executes after the delay expires.
6. Verify that the heartbeat repeatable job is registered in Redis and runs periodically.
7. Confirm that `AdminService` yields a valid presigned URL pointing to a playable object in the `cd-recruit-biometric` bucket.
