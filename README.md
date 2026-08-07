# CD-Recruit Candidate-Flow Load Test Package

Full journey: invitation → session start → system/biometric check → MCQ →
SQL → Coding (Judge0) → AI Prompting → Simulation → final submit.

## Before you touch k6 at all

1. **App is up.** Local: `npm run infra:up` (verify 6 healthy containers with `docker ps`) → `db:migrate` → `db:seed` → `dev:api` + `dev:candidate`. Staging: full stack deployed there, sized close to prod.
2. **Fix the route assumptions in `k6/lib/config.js`.** The route paths there are my best guess from NestJS convention + your README, since `docs/API_CONTRACT.md` wasn't in the package you sent — swap them for the real contract before your first smoke run.
3. **Seed real invites.** See `seed/generate_load_test_invites.js` — adjust the Prisma field names to your actual schema, then run:
   ```
   node seed/generate_load_test_invites.js --count 1000 --out k6/data/invites.csv
   ```
   Run `seed/cleanup_load_test_invites.js` after every staging test — don't let synthetic candidates pile up in a shared DB.
4. **Stub AI grading + KYC** (per your earlier answer):
   ```
   node mock-services/ai-grading-stub/server.js
   ```
   Then point the correlation-engine's Anthropic/Groq client base URL, and any KYC vendor client, at `http://localhost:4500` for the test window. If those clients don't read a base URL from an env var, that's a one-line code change before this will work — check `backend/correlation-engine` for how the client is constructed. **Switch it back to real endpoints after the test** — don't leave grading stubbed in a shared staging env by accident.

## Run order (don't skip steps)

```bash
# 1. Smoke — correctness gate, not a perf number
k6 run k6/scenarios/smoke.js --env API_BASE_URL=http://localhost:3001/api/v1 --env CANDIDATE_WEB_URL=http://localhost:5173

# 2. Load — expected concurrency, local or staging
k6 run k6/scenarios/load.js --env API_BASE_URL=... --env CANDIDATE_WEB_URL=...

# 3. Stress — STAGING ONLY, finds the real breakpoint
k6 run k6/scenarios/stress.js --env API_BASE_URL=https://staging.../api/v1 --env CANDIDATE_WEB_URL=https://staging...

# 4. Soak — staging, 90 min, catches leaks the others miss
k6 run k6/scenarios/soak.js --env API_BASE_URL=... --env CANDIDATE_WEB_URL=...
```

Why staging-only for stress/soak: your laptop's own CPU/network becomes
the bottleneck before your backend does, at 1000 VUs — you'd end up
measuring your load generator, not your system.

## Sizing your invite pool (important - read before load/stress/soak)

Every iteration consumes one invite from the CSV, indexed by a global
counter (`exec.scenario.iterationInTest`) modulo the pool size — **not**
one invite per VU. A VU that stays alive for 10 iterations uses 10
different invites, not the same one 10 times. This means your pool needs
to cover **total iterations for the whole run**, not just peak VU count:

| Scenario | Rough sizing |
|---|---|
| `smoke.js` | `SMOKE_VUS × SMOKE_ITERATIONS_PER_VU` (e.g. 5 VUs × 1 = 5 invites) |
| `load.js` | `peak_VUs × (steady_state_duration / avg_journey_duration)` — e.g. 50 VUs over 10 min with a ~6 min avg journey ≈ 50 × 1.7 ≈ **85, seed 150-200 for headroom** |
| `stress.js` | Estimate from the arrival-rate stages × their durations directly (it's an open model, so this is more predictable than VU-based math) — at up to 100 journeys/sec sustained for 15+ min, that's **tens of thousands**; seed generously, e.g. 20,000+ |
| `soak.js` | `100 VUs × (90 min / avg_journey_duration)` — e.g. ~100 × 15 ≈ **1500, seed 2000+** |

**If the pool runs out**, the modulo wraps and later iterations reuse an
already-consumed/expired invite — which then fails, but looks like a
backend problem rather than test-data exhaustion. If you see errors
climbing steadily partway through a long run with no matching change in
latency or infra metrics, check this first before assuming it's a real
capacity issue.



The original script assumed `POST /coding/execute` returns the finished
result in one call. Check which is actually true for your API:
- If NestJS proxies synchronously (blocks until judge0 finishes) → `--env JUDGE0_MODE=sync` (default).
- If it returns a token and you poll → `--env JUDGE0_MODE=async`. This also populates the `step_judge0_queue_wait` metric, which is the number you actually want for sandbox-saturation analysis.

## Biometric/system-check testing — two different tools for two different questions

- **Backend load (this package, k6):** presigned MinIO upload URL → real `PUT` of a dummy JPEG (`k6/data/sample-evidence-frame.jpg`), plus a fabricated "system check passed" payload. This is a legitimate load test of MinIO throughput and the check-recording endpoint. k6 cannot open a real webcam — it doesn't need to for capacity testing.
- **Real UX correctness (separate, smaller effort, not included here):** if you need to verify actual camera capture/liveness detection works correctly with the backend under load, that's a 5-20 VU real-browser test (Playwright + a synthetic virtual camera device via `ffmpeg`/`v4l2loopback`, or k6's xk6-browser module). This validates correctness, not capacity — don't try to run this at 1000 VUs, it's not representative and is extremely heavy on the load-generation side.

## Observability

```bash
cd observability
# find your real docker network first:
docker network ls | grep cdrecruit
# edit docker-compose.observability.yml: replace CHANGE_ME_NETWORK_NAME
# and the container-name targets (redis, postgres, judge0-server) to match
# your actual container names from `docker ps`.
docker compose -f docker-compose.observability.yml up -d --build
```

- Grafana: `http://localhost:3300` (anonymous admin access, dev-only — lock this down before pointing at staging with real network access)
- Prometheus: `http://localhost:9090`
- Dashboard auto-loads: **CD-Recruit Load Test**, with the k6-latency-vs-judge0-saturation correlation panel front and center — that's the chart that answers "does latency degrade exactly when sandbox count hits N."

Point k6 at Prometheus with:
```bash
k6 run --out experimental-prometheus-rw k6/scenarios/load.js \
  --env K6_PROMETHEUS_RW_SERVER_URL=http://localhost:9090/api/v1/write \
  --env API_BASE_URL=... --env CANDIDATE_WEB_URL=...
```
**Note:** k6's Prometheus remote-write metric naming can vary slightly by
k6 version/flags. After your first run, check Prometheus for the real
names (`{__name__=~"k6_.*"}`) and adjust the dashboard queries in
`observability/grafana/dashboards/cd-recruit-load-test.json` if they don't
match exactly.

## Cost computation

See `COST_MODEL.md` — this only makes sense after you have a real
stress-test breakpoint number; don't cost-model before that.

## Known discrepancy in your own repo (worth fixing)

`README.md` says Postgres is on `localhost:5434`; `.env.example` says
`localhost:5433`. Doesn't affect this load-test package (which talks to
the internal container port), but worth reconciling so a new teammate
doesn't waste time on it.
