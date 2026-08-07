# Cost Computation Model

This only becomes meaningful *after* the stress test gives you a real
breakpoint number. Don't try to cost-model before you have that number —
you'll just be guessing at both variables.

## Step 1 — Get your breakpoint from the stress test

From `stress.js` + Grafana, find:
- **N_max**: the concurrency level where `journey_errors` rate or `step_coding_total` p95 crosses your acceptable threshold.
- **W_judge0**: the judge0 worker/sandbox count active at that point (from the `judge0_workers_busy` panel) — this is usually the actual bottleneck, not raw CPU.
- **DB_conn**: Postgres active connections at that point vs your pool size (`pg_stat_activity_count` vs configured pool max).

## Step 2 — Per-unit compute cost

For each component, get $/hour at the instance size that sustained N_max with headroom (size for **p95 sustained load**, not the instantaneous peak — peak-sizing is how you overpay):

| Component | What to price | Notes |
|---|---|---|
| Judge0 workers | vCPU/RAM per worker node × number of nodes to hit target concurrent sandboxes | Compiled-language submissions (Java/C++) need more RAM per sandbox than interpreted (Python/JS) — price for your actual language mix, not just Python |
| API (NestJS) | Instance/container size × count behind load balancer | |
| Postgres | Managed-service tier at the connection/IOPS level the test required | |
| Redis | Managed-service tier at the ops/sec + memory level the test required | |
| MinIO/object storage | Storage cost for evidence clips (GB stored × retention days) + egress if reviewers stream clips | `EVIDENCE_CLIP_RETENTION_DAYS=90` in your `.env` directly drives storage volume — multiply avg clip size × candidates/month × 90-day retention |
| LLM grading (Anthropic/Groq) | Real $/1K tokens × submissions/month × avg tokens per grading call | **Not covered by the load test itself** since you stubbed it — get this number from a small real-call sample (10-20 real submissions) instead, separately from the load test |
| KYC vendor (if `KYC_MODE=paid`) | Vendor's per-verification price × candidates/month | Also not exercised by the stubbed load test — get from vendor's pricing page |

## Step 3 — Cost per 1,000 submissions

```
cost_per_1000 = (sum of hourly infra cost at sustained N_max) / (submissions/hour sustained at N_max) × 1000
```

This is the number that's actually useful in a planning conversation — it
normalizes across different traffic patterns (a spiky hiring-event day vs
steady weekly volume) better than a flat monthly infra bill does.

## Step 4 — Judge0-specific capacity math

Since sandbox spin-up is your bottleneck, size judge0 workers directly off
the test data rather than off general CPU/RAM headroom:

```
required_workers ≈ (peak submissions/sec) × (avg sandbox lifetime, sec: spin-up + execution + teardown)
```

Add ~30-50% headroom above this for burst absorption (candidates finishing
a timed module tend to submit in tight clusters near the time limit, not
uniformly).

## What this model can't tell you

- Real LLM/KYC cost, since those were stubbed for the infra test — price those from a small real-call sample separately, then add to the totals above.
- Cross-region/CDN cost for the candidate-web static assets, if candidates are geographically distributed — this load test measures API/backend load from one location, not global asset delivery, unless you distribute the load generators.
