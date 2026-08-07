# Execution Guide — CD-Recruit Candidate-Flow Load Test

One document, start to finish: run order, VU strategy, what's measured where,
how it's visualized, and the two areas that need special handling (biometrics
and Judge0).

---

## 1. Run order and prerequisites

```
infra:up → db:migrate → db:seed → generate_load_test_invites.js → k6 run
```

Before any run:
- App stack up (local: 6 containers healthy + `dev:api` + `dev:candidate`; staging: full deployed stack).
- Routes in `k6/lib/config.js` verified against your real Swagger (`/docs`) — this is still the biggest unknown in the package.
- Invite pool sized for the run you're about to do (see table below — this is iteration-count-based, not VU-count-based, per the fix a few messages back).
- AI-grading + KYC calls pointed at `mock-services/ai-grading-stub` for anything beyond a handful of users (see README "Stubbing AI grading"). Skip the stub only for smoke-scale (2-5 users) — real calls at that volume are negligible cost.
- Observability stack up (`docker compose -f observability/docker-compose.observability.yml up -d --build`) if you want Grafana visibility — optional for smoke, recommended from `load.js` onward.

---

## 2. VU / concurrency strategy

| Stage | Where | Concurrency | Duration | Purpose | Invite pool needed |
|---|---|---|---|---|---|
| **Smoke** | Local | 2-5 VUs (`SMOKE_VUS` env) | ~1-3 min | Correctness gate — does the script/env work at all | = VUs × iterations/VU |
| **Load** | Local or staging | Ramp to 50 VUs | ~14 min (2 ramp-up + 10 steady + 2 ramp-down) | Latency/error behavior at expected concurrency | ~150-200 |
| **Stress** | **Staging only** | Open-model arrival rate up to ~100 journeys/sec (proxy for ~1000 concurrent) | ~24 min across ramping stages | Find the real breakpoint per layer | 20,000+ |
| **Soak** | Staging | 100 VUs constant | 90 min | Leaks: judge0 containers, DB connections, Redis memory, disk fill | ~1,500-2,000 |

Never run stress/soak locally — your laptop becomes the bottleneck before your
backend does, and you end up benchmarking your own machine.

---

## 3. What's measured, by phase — latency capture per step

Every phase of the candidate journey has its own tagged metric in
`journey.js`, so a p95 blowup in one step doesn't get diluted into an
aggregate number. This is the actual list, in journey order:

| Phase | Metric name | What it tells you |
|---|---|---|
| Invite open | `step_invite_open` | Candidate-web + API responsiveness on first contact |
| Session start | `step_session_start` | Auth/session-creation path, DB write latency |
| System check | `step_system_check` | Recording-endpoint latency (fabricated result, see §4) |
| Evidence upload | `step_evidence_upload` | MinIO presigned-URL + PUT latency — real file, real storage path |
| KYC verify | `step_kyc_verify` | Liveness/verification call latency (stubbed at scale, see §4) |
| Heartbeat | `step_heartbeat` | Session-keepalive latency, sent every 15s during think-time |
| MCQ submit | `step_mcq_submit` | Simple write-path latency |
| SQL submit | `step_sql_submit` | Query-validation/grading-trigger latency |
| Coding total | `step_coding_total` | Full round trip incl. judge0 — the one to watch closely |
| Judge0 queue wait | `step_judge0_queue_wait` | Sandbox saturation proxy (async mode only — see §6) |
| AI prompting submit | `step_ai_prompting_submit` | Submission-acceptance latency (grading itself is stubbed/async) |
| Simulation event | `step_simulation_event` | Event-ingestion latency |
| Final submit | `step_final_submit` | Session-close + downstream trigger (grading queue, notifications) |
| Journey total | `journey_total_duration` | End-to-end candidate experience time |

Each `load.js`/`stress.js` threshold checks a subset of these at p90/p95 —
adjust the numbers in the scenario files once you have a real baseline; the
values there now are starting guesses, not measured targets.

---

## 4. Biometrics & system-check strategy (two layers, don't conflate them)

**Layer 1 — backend load, covered by this k6 package, run at full scale:**
- System check: fabricated "camera/mic/resolution passed" payload posted to the check endpoint — tests the recording path, not real capability detection (k6 can't open a webcam).
- Evidence upload: a real dummy JPEG `PUT` to a real presigned MinIO URL — genuinely exercises storage throughput, IAM boundary, and any processing pipeline behind it.
- KYC verify: a call to a verification endpoint, pointed at the stub server at load (`/kyc/verify`) so you're not paying a real vendor per synthetic candidate.

**Layer 2 — real-UX correctness, NOT included in this package, small scale only:**
- If you need to confirm actual webcam capture + liveness detection genuinely works while the backend is under load, that's a 5-20 VU real-browser test (Playwright/Puppeteer, or k6's xk6-browser module) with a synthetic virtual camera feed (`ffmpeg` → `v4l2loopback`, or a static test video as the input device).
- This validates correctness, not capacity. Don't try to run this at 1000 VUs — it's not representative of anything and is extremely heavy on the load-generation side (real headless Chromium instances with fake camera devices, one per VU).

---

## 5. Metrics capture, by layer

| Layer | Source | Key metrics |
|---|---|---|
| k6 (client-observed) | k6 → Prometheus remote-write | Per-phase p90/p95 (table above), error rate, VU count, iteration rate |
| API/app | Your own APM/logs, cross-checked against k6 | Request rate, error rate by route, latency by route |
| Postgres | `postgres_exporter` | Active connections vs pool size, slow queries, lock waits, `pg_stat_activity` |
| Redis | `redis_exporter` | Ops/sec, memory used, eviction count, hit/miss ratio |
| Containers | `cAdvisor` | Per-container CPU %, memory, **disk read/write bytes** (§6), network I/O |
| Host | `node_exporter` | CPU busy %, memory used %, **disk IOPS + throughput per device** (§6) |
| Judge0 | Custom `judge0_exporter` | Queue size, busy/available workers per queue — the leading saturation signal |

---

## 6. Disk / I/O metrics specifically

This got a placeholder earlier and now has real panels (`cd-recruit-load-test.json`, panels 9-10):

- **Host-level** (`node_exporter`): `node_disk_read_bytes_total` / `node_disk_written_bytes_total` (throughput) and `node_disk_reads_completed_total` / `node_disk_writes_completed_total` (IOPS), per device. Watch this if Postgres, Redis, and judge0 sandboxes all share the same underlying disk — that's real contention, not three independent bottlenecks.
- **Container-level** (`cAdvisor`): `container_fs_writes_bytes_total` / `container_fs_reads_bytes_total` per container name. This is what actually shows judge0-sandbox disk churn — each sandbox spin-up writes a fresh filesystem tree (`isolate` boxes), and compiled-language submissions (Java/C++) write more (compilation artifacts) than interpreted ones.
- **Why this matters more for you than for a typical API load test:** judge0's bottleneck is frequently disk I/O for sandbox creation/teardown before it's CPU — a host with fast CPU but slow/shared disk will show judge0 queue depth climbing while CPU graphs still look fine. If you only watched CPU, you'd miss it.

---

## 7. Judge0-specific handling

- **Queue depth & busy workers** (`judge0_queue_size`, `judge0_workers_busy`) are the leading indicator of saturation — watch these before CPU/memory.
- **Sandbox spin-up latency proxy**: in async mode, `step_judge0_queue_wait` (panel 11) directly measures submit-to-execution-start time.
- **Sync vs async**: confirm which your API actually does (`JUDGE0_MODE=sync|async` in the k6 run) — this changes what your latency numbers actually represent.
- **Language mix matters**: the `codeSamples` array in `journey.js` includes trivial, CPU-moderate, compiled, and a deliberate timeout-edge case — don't test with only `print("hello")`, it tells you nothing about real sandbox cost.
- **Watch for leaked containers** in the soak test specifically — judge0 containers that aren't torn down after execution accumulate over 90 minutes and will eventually exhaust host resources even at constant load, which is a distinct failure mode from "too much concurrent load."

---

## 8. Visualization

- Grafana at `:3300`, dashboard **CD-Recruit Load Test** auto-loads via provisioning.
- Panel 3 (judge0 queue/workers) overlaid against panel 1 (k6 latency) on the same time axis is the single most useful view — it directly answers "does latency break exactly when sandbox count hits N."
- Panels 9-10 (disk) let you rule in/out storage contention as the cause of a latency spike, rather than guessing from CPU graphs alone.
- Zoom Grafana's time picker to just the test window after each run for analysis — don't try to read it live for anything except the correctness/sanity check.

---

## 9. Cost

Only meaningful after a real stress-test breakpoint exists — see `COST_MODEL.md`. Don't cost-model before you have that number.
