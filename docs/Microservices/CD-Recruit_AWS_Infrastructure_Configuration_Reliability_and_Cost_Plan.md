# CD-Recruit / Proctora — AWS Infrastructure Configuration, Data Reliability & Cost Plan

> **Status:** Draft v1 for review · **Date:** 12 Oct 2026
> **Scope:** Hosting and running configuration for the 6-service cost-optimized architecture: compute, data stores, networking, backups, reliability, and cost.
> **Not in scope:** Rewriting the migration plan (waves, ownership, extraction order). That happens once this architecture is stable.
> **Builds on:** the 6-service diagram, `CD-Recruit_Microservices_Migration_Architecture_and_Plan_UPDATED.md`, `PRICING_AND_CREDIT_POOL_SPECIFICATION.md`, and the Technical Architecture Document.

---

## 0. How to read this document

| Tag | Meaning |
|---|---|
| **[DECIDED]** | Already agreed in an earlier document or in this discussion |
| **[PROPOSED]** | My recommendation; needs your sign-off |
| **[VERIFY]** | A fact to confirm before build (price, quota, legal, library compatibility) |

- **Price basis.** Dollar figures use us-east-1 list prices from AWS pages and public price trackers read on 12 Oct 2026. Mumbai (ap-south-1) is usually a few percent to roughly 15% higher for these services. Re-run the numbers in the AWS Pricing Calculator for ap-south-1 before committing. Treat every figure as ±20%.
- **Starting values.** Every size, count and threshold is a starting value to be confirmed by the Wave-2 load test (2,000-candidate simulation). The *structure* is the decision; the *numbers* are dials.
- **Rule of the house.** No production data in non-prod, ever. Non-prod uses synthetic data only.

---

## 1. Executive summary

1. **The cost shape is "a floor plus a spike".** Most of the month the platform is idle. A 2,000-candidate drive adds only about **$20–35** of infrastructure (excluding LLM grading). The idle floor is about **$610/month** in prod. So the design goal is to shrink the floor without capping the spike, not to optimise the spike.
2. **The money is in always-on things:** databases (about 38%), Fargate tasks (about 20%), NAT/ALB/NLB (about 17%), and the idle sandbox host (about 9%). Almost everything else is small.
3. **Data is classified by moat (how much it hurts if lost or leaked) and by transit (how much and how fast it moves).** High-moat, low-transit data (finance, platform/super-admin) gets a small, isolated, heavily protected home. High-transit, low-moat data (telemetry) bypasses the transactional database and the NAT gateway entirely and goes straight to S3.
4. **Two Aurora clusters, not ten.** `cdr-restricted` holds finance and super-admin data. `cdr-app` holds everything else. Each service still has its own database, role and secret inside its cluster.
5. **Elasticity comes from a scheduled capacity planner plus target tracking.** The planner raises floors before a drive window and lowers them after. Target tracking handles surprises.
6. **Backups are cheap, so we keep them strong.** At pilot data volumes, backups cost single-digit dollars a month. The finance tier gets four independent recovery layers. Biometric evidence deliberately has *no* backup, because the retention promise outranks recoverability.
7. **What we cut** is listed in Section 10 with a reason for each, and a trigger for bringing it back.

### Headline numbers (us-east-1 list basis, ±20%)

| Item | Monthly |
|---|---|
| Prod, idle floor (no drives) | **≈ $610** |
| Non-prod (scheduled, scale-to-zero DB) | **≈ $100** (≈ $250 if left running 24/7) |
| Vault account (immutable backups, log archive) | **≈ $4** |
| **Base total** | **≈ $715** |
| Each 2,000-candidate drive, infrastructure only | **+ $20–35** |
| LLM grading per drive (external, funded by credits) | + $60–160 (from the pricing spec's $0.03–0.08 per session) |

For comparison: the earlier 10-service plan was $1,250–2,300 prod plus $400–850 non-prod; the teammate diagram estimated $500–900 for prod. This plan adds finance isolation, HA, backups and a security baseline, and still lands in that band.

---

## 2. Decisions at a glance

| # | Area | Decision | Tag | Main reason |
|---|---|---|---|---|
| D1 | Region | `ap-south-1` (Mumbai) primary; `ap-south-2` (Hyderabad) for backup copies of the restricted tier only | [PROPOSED] [VERIFY with counsel] | Data residency for India customers, with launch customers in India, Malaysia and the US; one region keeps cost and ops low |
| D2 | Accounts | 4 AWS accounts: `cdr-mgmt`, `cdr-prod`, `cdr-nonprod`, `cdr-vault` | [PROPOSED] | Organizations is free; a vault account protects backups from a compromised prod account |
| D3 | Compute | ECS on Fargate, ARM64 (Graviton), one cluster per environment | [PROPOSED] | No servers to patch; per-second billing fits spiky load |
| D4 | Sandbox | EC2 Auto Scaling group, x86, isolated subnets, no instance role, mixed On-Demand and Spot | [DECIDED] pool, [PROPOSED] settings | Untrusted code needs a hard boundary; Spot covers burst cheaply |
| D5 | Database | Aurora PostgreSQL Serverless v2: `cdr-app` and `cdr-restricted` in prod; one scale-to-zero cluster in non-prod | [PROPOSED] | Pay for ACUs only when load exists; separate cluster satisfies finance/super-admin separation |
| D6 | Telemetry | Event log goes to S3 chunks, not Postgres | [PROPOSED] | The biggest single lever on database size and cost |
| D7 | Cache | ElastiCache Serverless for Valkey | [PROPOSED] | About $6/month floor, scales with spikes, multi-AZ built in |
| D8 | Edge | CloudFront flat-rate plans for the three SPAs; API and WebSocket go straight to the ALB with a regional WAF | [PROPOSED] | Flat price with WAF bundled for static assets; avoids per-request cost on chatty telemetry |
| D9 | Partner API | ALB host rule plus WAF header-keyed rate limit; **no API Gateway at launch** | [PROPOSED] | Avoids a second (private) ALB and a gateway for very low partner volume |
| D10 | Egress | Two NAT gateways in prod, one NAT (or none) in non-prod; S3 gateway endpoint everywhere; no interface endpoints | [PROPOSED] | Interface endpoints cost more than NAT at this data volume |
| D11 | Async | EventBridge bus + SQS standard queues with DLQs + EventBridge Scheduler | [DECIDED] | Matches the diagram; all are pay-per-use |
| D12 | Backups | Aurora PITR + AWS Backup to the vault account + weekly logical dumps + WORM ledger export | [PROPOSED] | Four independent layers for finance; cheap at this scale |
| D13 | Keys | Seven KMS keys split by data class | [PROPOSED] | Keys are the cheapest hard boundary ($1/month each) |
| D14 | Observability | CloudWatch logs/metrics/alarms plus correlation IDs; **no ADOT/X-Ray in prod at launch** | [PROPOSED] | Tracing sidecars cost CPU, memory and money; correlation IDs give most of the value |
| D15 | Identity provider | Cognito vs self-issued JWT is still open | [OPEN] | Not drawn in the 6-service diagram; decide in the next iteration |

---

## 3. Workload profile and scaling states

### 3.1 Traffic reality

- Most hours: staff-only traffic (recruiters, super-admin) or nothing.
- Drive windows: a sharp spike. Reference drive: **2,000 candidates**, about 3 hours of testing, identity checks in the 30 minutes before start, and an async grading backlog after submission. Reference figures from the migration doc §12: ~670 telemetry req/s, a billing hot-row ceiling of 170–330 session starts/s, and up to ~70 vCPU of concurrent code execution.
- Campus drives put thousands of candidates behind a few public IP addresses. **Any IP-based rate limit must be generous or keyed on the candidate session.**

### 3.2 Scaling states

| State | When | What is running |
|---|---|---|
| **S0 Idle** | No drive within 60 minutes | One small task per service, 1 sandbox host, DB at floor ACUs |
| **S1 Pre-window** | T−45 min to T | Floors raised: Aurora first, then ECS, then sandbox; identity-check burst on `biometric` |
| **S2 Peak** | Drive running | Floors held; target tracking adds capacity above the floor |
| **S3 Drain** | End to end + 30 min | Floors held while submissions flush and grading backlog builds; `grading-worker` scales out on queue depth |
| **S4 Return** | After drain | Floors lowered back to S0 |

### 3.3 How each component moves between states

| Component | S0 | S1 / S2 | Mechanism |
|---|---|---|---|
| Fargate services | 1 task | Floors raised by formula (Section 5.3) | Scheduled floors from the capacity planner + target tracking |
| `grading-worker` | 0 tasks | 0 → up to 20 | Queue-depth step scaling from zero |
| Sandbox hosts | 1 host | Up to ~80–100 vCPU | ASG with vCPU-based capacity, scheduled + custom metric |
| Aurora `cdr-app` | 1 ACU writer | Floor 2–8 ACU, max 16 | Scheduled min-ACU raise; Serverless v2 scales within the range |
| Aurora `cdr-restricted` | 0.5 ACU writer | Floor 1–4 ACU, max 4 | Same |
| Valkey | ~100 MB | Scales automatically | Serverless |
| S3, SQS, EventBridge | n/a | n/a | Natively elastic |

> **Why raise floors before the window?** Aurora Serverless v2 scales faster when it is already running at higher capacity, and Fargate tasks take around a minute to start. Pre-warming turns a risky ramp into a planned step. Target tracking is the safety net, not the plan.

---

## 4. Data classification: moat × transit

### 4.1 Definitions

**Moat** is how much damage loss or leak would do (legal, financial, contractual, or competitive).

| Class | Meaning | Examples |
|---|---|---|
| **A — Crown** | Legal or financial catastrophe if lost or leaked | Finance ledger and payments, price book, platform/super-admin identities and audit log, biometric evidence, signing keys |
| **B — Sensitive / IP** | Serious harm or loss of competitive advantage | Candidate PII, responses and code, scores and reports, question bank, hidden tests and rubrics, consent records, integrity flags |
| **C — Operational** | Recoverable or low-value on its own | Telemetry chunks, logs, metrics, queue messages, cache |
| **D — Public** | No harm if exposed | SPA bundles, static docs |

**Transit** is how much data moves and how fast.

| Class | Meaning | Examples |
|---|---|---|
| **T-hot** | Continuous or bursty, high volume | Telemetry stream, WebSocket frames, code-run payloads, evidence uploads at drive start |
| **T-warm** | Normal request/response | API calls, session state upserts, grading jobs |
| **T-cold** | Rare or batch | Reports, exports, backups, reconciliation |

### 4.2 Placement rules (what the two axes decide)

| Moat | Transit | Rule | Result |
|---|---|---|---|
| A | cold / warm | Small, isolated, expensive protection | `cdr-restricted` cluster, own key, WORM export, cross-account backups |
| A | hot (evidence) | Never through our services or NAT | Browser → presigned PUT → biometric S3 bucket with its own key |
| B | warm | Normal protected store | `cdr-app` cluster, per-service database, `cdr-app` / `cdr-content` keys |
| B | hot (code, keystrokes) | Keep out of the OLTP database | Buffer → compressed S3 chunks |
| C | hot | Cheapest durable store, short retention | S3 with lifecycle expiry |
| C | warm / cold | Ephemeral or bounded retention | Valkey, SQS, CloudWatch with short retention |
| D | any | Edge cache | S3 + CloudFront |

> **The "cost of bytes" rule.** Bytes should not cross a NAT gateway ($0.045/GB processed) or an ALB if S3 can take them directly. S3 gateway endpoints are free.

### 4.3 Data inventory

| Data set | Owner | Moat | Transit | Store | Key | RPO | Retention |
|---|---|---|---|---|---|---|---|
| Ledger, credit pools, payments, price book, manual billing requests, billing audit | `billing` | A | warm (spikes at drive start) | `cdr-restricted` → DB `billing` | `cdr-restricted` | ≤ 5 min (PITR) + daily WORM export | 8 years [VERIFY] |
| Super-admin identities, tenant registry, plans/trial policy, platform audit log | `platform` (control-plane process role) | A | cold | `cdr-restricted` → DB `platform` | `cdr-restricted` | ≤ 5 min | 8 years for audit [VERIFY] |
| Ledger WORM export | `billing` | A | cold | S3 `ledger-worm`, Object Lock | `cdr-restricted` | 24 h (daily) | 8 years [VERIFY] |
| Biometric evidence clips, ID photos | `biometric` | A | hot at start, then cold | S3 `biometric` | `cdr-biometric` | none by design | Purge at decision + appeal window (~30 days) [VERIFY] |
| JWT signing keys | IAM module / `candidate` | A | warm | KMS asymmetric keys | own CMKs | n/a | rotate by `kid` overlap |
| Consent records, biometric metadata (scores, verdicts, evidence refs) | `biometric` | B (consent record is legal evidence) | warm | `cdr-app` → DB `biometric` | `cdr-app` | ≤ 5 min | Per DPIA [VERIFY] |
| Orgs, staff users, roles | `iam` | B | warm | `cdr-app` → DB `iam` | `cdr-app` | ≤ 5 min | Account lifetime |
| Drives, invites, candidate roster | `hiring` | B | warm | `cdr-app` → DB `hiring` | `cdr-app` | ≤ 5 min | Per contract |
| Question bank, scenario templates (IP) | `content` | B (IP) | cold | `cdr-app` → DB `content` | `cdr-app` | ≤ 5 min + weekly logical dump | Indefinite |
| Hidden tests, answer keys, rubrics (snapshots) | `content` | B (IP) | warm | S3 `content-scoring` | `cdr-content` | S3 versioning | With question |
| Sessions, responses, autosave state | `candidate` | B | warm | `cdr-app` → DB `runtime` | `cdr-app` | ≤ 5 min | Decision + policy |
| Submissions, code snapshots, report files | `candidate`, `grading` | B | warm | S3 `artifacts` | `cdr-app` | S3 versioning | Decision + policy |
| Event log (keystrokes, focus, paste) | `candidate` | B (contains code) / C by volume | **hot** | S3 `events` | `cdr-app` | Client re-sends unacknowledged batches (≤ 60 s) | ~90 days after decision [VERIFY] |
| Integrity flags | `candidate` | B (unproven accusations) | warm | `cdr-app` → DB `runtime` | `cdr-app` | ≤ 5 min | Decision + policy |
| Scores, AI rationale, Say-Do, confidence | `grading` | B | warm | `cdr-app` → DB `grading` | `cdr-app` | ≤ 5 min | Per contract |
| Dashboard aggregates | `insights` module | B / C | cold | `cdr-app` → DB `insights` | `cdr-app` | Rebuildable | Rolling |
| Cache, WebSocket coordination, rate counters | all | C | hot | Valkey Serverless | `cdr-app` | none | Ephemeral |
| Queue and event payloads (IDs only, claim-check) | all | C | warm | SQS / EventBridge | SQS-managed | n/a | 4 days |
| Logs and metrics | all | C | warm | CloudWatch | AWS-managed | n/a | 14–90 days |
| SPA bundles | web | D | hot (cached) | S3 + CloudFront | SSE-S3 | Rebuild from CI | Current + 30 days of versions |

### 4.4 Super-admin and finance separation (what "separate" means here)

- **One restricted tier, two databases.** Finance (`billing`) and super-admin (`platform`) have the same access population (internal platform staff plus the billing service), the same audit needs, and small volume, so they share the `cdr-restricted` cluster and key. They remain separate databases with separate roles.
- **Four layers of separation:** (1) separate cluster and subnets, (2) separate KMS key whose policy excludes every other service, (3) separate task roles and security groups, (4) separate backups, with the WORM copy in another AWS account.
- **The platform plane never holds candidate PII.** `platform` stores tenant registry rows (IDs, names, plan, trial policy), platform staff identities and the platform audit log. Platform-wide metrics are counters pushed by events. Anything needing candidate data goes through a break-glass, audited path.
- **Recruiter-facing services cannot reach the restricted cluster at all.** Balances shown to recruiters are fetched from `billing-api`, not from the database. The security group rules enforce this.
- **The platform admin SPA** (`platform.<domain>`) has its own CloudFront distribution with an IP allowlist rule, its own ALB rule, and its own task role.

---

## 5. Compute

### 5.1 ECS cluster settings (prod) [PROPOSED]

| Setting | Value | Reason |
|---|---|---|
| Cluster | `cdr-prod` (one per environment) | Simple; isolation comes from task roles and security groups |
| Capacity providers | `FARGATE` (default), `FARGATE_SPOT` (grading worker only) | Spot only where an interruption is harmless |
| CPU architecture | `ARM64` for all Fargate tasks | About 20% cheaper per vCPU and GB than x86 [VERIFY: ONNX Runtime, Prisma engines and any native modules have arm64 builds; verify Spot/ARM availability in ap-south-1, fall back to x86 on-demand if not] |
| Platform version | `LATEST` | |
| Service discovery | ECS Service Connect, namespace `cdr.internal` | Retries and outlier detection without an extra load balancer; App Mesh is not an option [VERIFY: no extra Service Connect charge beyond the proxy's CPU/memory] |
| Container Insights | Off in prod at launch | Standard ECS CPU/memory metrics are free; Insights is per-metric cost |
| Deployment | Rolling, `minimumHealthyPercent=100`, `maximumPercent=200`, circuit breaker on with rollback | Zero-downtime deploys even with 1 task |
| Root filesystem | `readonlyRootFilesystem=true` plus a `/tmp` volume | Limits blast radius of a compromised container |
| User | Non-root (UID 1000) | |
| Ephemeral storage | Default 20 GiB (no extra charge) | |
| Logs | `awslogs` driver, one log group per service | Retention in Section 11 |
| ECS Exec | Disabled on services; enabled only on the `db-admin` break-glass task definition | Prevents shell access to production containers |
| Image source | ECR (one repo per service), immutable tags (git SHA), lifecycle rule "keep last 10", scan on push | |

### 5.2 Service sizing and scaling (starting values) [PROPOSED]

Task size is fixed per service; the *count* moves between states. Idle cost uses ARM64 Fargate list rates (≈ $0.03238 per vCPU-hour, ≈ $0.003556 per GB-hour).

| ECS service | Process roles inside | vCPU / GB | S0 tasks | S2 floor (N=2,000) | Max | Scaling policy | Stop timeout | Idle $/mo |
|---|---|---|---|---|---|---|---|---|
| `candidate` | API + WebSocket + telemetry ingest + outbox relay (leader-elected via advisory lock) | 1 / 2 | 1 | 8 | 24 | Target tracking: CPU 55%; custom metric `WsConnectionsPerTask` = 300; scale-out cooldown 60 s, scale-in 600 s | 120 s | 28.8 |
| `execution-api` | Run/test API, talks to sandbox pool | 0.5 / 1 | 1 | 4 | 12 | CPU 55%; custom `SandboxQueueDepth` | 30 s | 14.4 |
| `billing-api` | Acquire, webhooks, purchases, ledger reads | 0.5 / 1 | 1 | 3 | 6 | CPU 50%; never below 2 during windows; spread across AZs | 30 s | 14.4 |
| `biometric-api` | Face verification (ONNX), liveness, evidence tickets | 1 / 2 | 1 | 6 | 16 | CPU 50% | 60 s | 28.8 |
| `grading-api` | Status, regrade triggers, report data | 0.25 / 0.5 | 1 | 1 | 3 | CPU 60% | 30 s | 7.2 |
| `grading-worker` | SQS consumer, LLM calls, Say-Do correlation | 1 / 2 | **0** | 0 (scales on backlog) | 20 | Backlog per task = 5 (Section 5.4); Fargate Spot | 120 s | 0 |
| `staff-api` | IAM, hiring, content, insights modules | 0.5 / 1 | 1 | 2 | 4 | CPU 55% | 30 s | 14.4 |
| `partner-api` | ATS partner endpoints; separate task role (no KMS sign, no scoring read) | 0.25 / 0.5 | 1 | 1 | 3 | CPU 60% | 30 s | 7.2 |
| `platform-api` | Super-admin API; only role with `platform` DB credentials | 0.25 / 0.5 | 1 | 1 | 2 | CPU 60% | 30 s | 7.2 |
| **Idle total** | | | 8 tasks | | | | | **≈ $122** |

**Scheduled one-off tasks (RunTask, billed per second, no idle cost):**
`migrate-<service>` (DDL role, before each deploy), `billing-nightly` (7-point reconciliation, expiry sweeper, `maxWaitDays` job, WORM export), `biometric-retention` (purge job), `db-dump-restricted`, `db-dump-app`, `db-admin` (break-glass, ECS Exec on).

**Why one `candidate` service instead of separate API and ingest services?** Both scale with concurrent sessions, so at launch they share one ECS service and one image. The same image can later run as `ROLE=ingest` behind its own ALB rule if the load test shows event-loop contention. This saves one always-on task and one pipeline; the split is a configuration change, not a rewrite. **Trigger:** p95 WebSocket latency degrades while ingest CPU is the dominant load.

**Why separate `partner-api` and `platform-api` tasks?** They are the same image as `staff-api` but run with different IAM task roles. The internet-facing partner role cannot reach the signing key or hidden tests; the super-admin role is the only one that can reach the restricted cluster's `platform` database. This is the cheapest way to get a hard boundary: a $7 task, not a new service.

### 5.3 Capacity formulas (floors for a drive window) [PROPOSED — calibrate in the load test]

N is the sum of `expectedAttendance` across all windows overlapping the period (window start −45 min to end +30 min).

| Floor | N < 250 | 250 – 999 | 1,000 – 2,999 | ≥ 3,000 |
|---|---|---|---|---|
| `candidate` tasks | 2 | 4 | 8 | ceil(N / 300) |
| `execution-api` tasks | 1 | 2 | 4 | 6+ |
| `billing-api` tasks | 2 | 2 | 3 | 4 |
| `biometric-api` tasks | 1 | 2 | 6 | ceil(N / 400) |
| `staff-api` tasks | 1 | 2 | 2 | 3 |
| Sandbox vCPU | max(8, ceil(0.04 × N)) for every band (0.04 is rounded up from the migration doc's ~70 vCPU for 2,000) | | | |
| Aurora `cdr-app` min ACU | 1 | 2 | 4 | 8 |
| Aurora `cdr-restricted` min ACU | 0.5 | 1 | 2 | 4 |

`grading-worker` is not in this table: it scales from zero on queue depth after submissions arrive.

### 5.4 Capacity planner and backlog scaling [PROPOSED]

**Capacity planner (the mechanism that makes spiky traffic cheap).**

| Part | Configuration |
|---|---|
| Trigger | `staff-api` publishes a `capacity.plan` event whenever a Drive's schedule or `expectedAttendance` changes. Payload: a list of windows for the next 14 days (drive ID, start, end, expectedAttendance). **No candidate PII.** |
| Component | Lambda `cdr-capacity-planner`: arm64, 256 MB, 30 s timeout, **not in the VPC**; its IAM role can only create, update and delete schedules in the EventBridge Scheduler group `drive-windows` and pass the scheduler execution role |
| Logic | Merge overlapping windows, compute the step function of floors from Section 5.3, and upsert one-time schedules (`ActionAfterCompletion=DELETE`) at each change point. The set is rebuilt on every plan event, so it is idempotent |
| Scheduler targets | Universal SDK targets: `rds:modifyDBCluster` (min/max ACU), `application-autoscaling:registerScalableTarget` (ECS min/max per service), `autoscaling:updateAutoScalingGroup` (sandbox) [VERIFY parameter casing and the ASG capacity units] |
| Order (rises) | T−45 min Aurora → T−35 sandbox → T−30 ECS floors |
| Order (falls) | End +30 min ECS and sandbox → End +45 min Aurora (database lowered last) |
| Guardrails | Hard maximums per service; never below S0; N clamped to 5,000 unless a super-admin override; Scheduler failures go to an SQS DLQ with an alarm on depth > 0 |
| Fallback | Target tracking still scales (slower); a `prewarm` CLI script performs the same calls by hand; an alarm fires at T−60 min if a window is coming and the sandbox vCPU is below the required floor |
| Deploy freeze | CI refuses prod deploys while any window is in S1–S3 |
| Build cost | About 1–2 dev-days. **Option:** ship the `prewarm` script first and automate when drives exceed about 4 per month |

**Backlog scaling for `grading-worker` (scale from zero).**
- A CloudWatch alarm on SQS `ApproximateNumberOfMessagesVisible ≥ 1` triggers a step policy that sets desired count to 1.
- Target tracking on the AWS-documented backlog-per-task metric (visible messages ÷ max(running tasks, 1)) with target 5 takes it up to 20.
- Scale-in is slow (cooldown 300 s) so a draining queue does not thrash.
- Queue settings are in Section 7.4: visibility timeout is longer than the longest job so Spot interruptions simply return the message.

### 5.5 Sandbox pool (untrusted code) [DECIDED pool, PROPOSED settings]

| Setting | Value |
|---|---|
| Auto Scaling group | `cdr-prod-sandbox`, subnets `sandbox-a` and `sandbox-b` (no route to NAT or internet) |
| AMI | Amazon Linux 2023 (x86_64), baked with Docker, gVisor (`runsc`) and Piston/Judge0 images by EC2 Image Builder; rebuilt monthly and on critical CVEs. **Replace, never patch in place** |
| Instance selection | Attribute-based: 2–8 vCPU per instance, ≥ 2 GiB per vCPU, AMD or Intel, current generation, no burstable, no bare metal; allowed families `c6a`, `c6i`, `c7a`, `c7i` |
| Capacity units | `DesiredCapacityType = vcpu`. S0: min/desired 2 vCPU (one small host); S2: formula in 5.3; max 160 vCPU |
| Purchase mix | `OnDemandBaseCapacity` = 8 vCPU during windows (S0 desired 2 is therefore all On-Demand); `OnDemandPercentageAboveBase` = 30; Spot allocation `price-capacity-optimized`; capacity rebalancing on |
| Storage | gp3 30 GiB, encrypted with the AWS-managed `aws/ebs` key |
| Instance metadata | IMDSv2 required, hop limit 1; **no instance profile permissions**, so a container escape finds no credentials. No SSM agent and no shell access |
| Load balancing | Internal NLB `cdr-prod-sandbox-nlb`, security-group-enabled, cross-zone on, health check `GET /health` every 10 s, deregistration delay 30 s. Only `sg-execution` may reach it |
| Request integrity | `execution-api` signs each job with an HMAC; hosts reject unsigned jobs |
| Per-run container limits | 1 vCPU, 256–512 MB, 5 s default timeout per language, 64 KB output, 64 PIDs, read-only root, no network, seccomp, gVisor |
| Spot interruption | Host marks itself unhealthy on the 2-minute notice and stops taking jobs; `execution-api` retries once on another host. **Runs must be idempotent and retry-safe** |
| Metrics | `execution-api` scrapes each host's `/health` and publishes busy slots and queue depth to CloudWatch (hosts have no egress) |
| Why a separate Fargate `execution-api` | It holds read access to hidden tests; if it ran on the sandbox hosts, a container escape could read every answer key |

---

## 6. Accounts, network and access

### 6.1 AWS accounts [PROPOSED]

| Account | Holds | Notes |
|---|---|---|
| `cdr-mgmt` | Organizations, IAM Identity Center, consolidated billing, SCPs | No workloads |
| `cdr-prod` | Production VPC and everything in this document | |
| `cdr-nonprod` | Staging (and any shared dev) | Synthetic data only |
| `cdr-vault` | Immutable backup vaults, WORM ledger copy, org CloudTrail and log archive | A compromised prod account cannot delete what is here |

**Why not more accounts?** Separate security-tooling and log-archive accounts add overhead a two-developer team will not maintain. The vault account covers both for now. **Trigger:** SOC 2 / ISO 27001 scoping.

**Service control policies** (applied from `cdr-mgmt`):
- Deny all regions except `ap-south-1`, `ap-south-2` and the global-service exceptions (IAM, Route 53, CloudFront, ACM in `us-east-1`).
- Deny stopping or deleting CloudTrail, leaving the organization, disabling EBS default encryption, public S3 ACLs, and root-user use.
- Deny scheduling KMS key deletion with a waiting period under 30 days.

### 6.2 Network layout [PROPOSED]

Two Availability Zones in `ap-south-1` (a third is not worth the NAT and cross-AZ cost at this stage).

| Subnet tier | Prod CIDR | Contains | Route to internet |
|---|---|---|---|
| `public-a`, `public-b` | 10.20.0.0/24, 10.20.1.0/24 | ALB, NAT gateways | Internet gateway |
| `app-a`, `app-b` | 10.20.16.0/22, 10.20.20.0/22 | Fargate tasks | Own-AZ NAT gateway; S3 gateway endpoint |
| `data-app-a`, `data-app-b` | 10.20.32.0/26, 10.20.32.64/26 | `cdr-app` Aurora, Valkey endpoints | None |
| `data-restricted-a`, `data-restricted-b` | 10.20.33.0/27, 10.20.33.32/27 | `cdr-restricted` Aurora only | None |
| `sandbox-a`, `sandbox-b` | 10.20.40.0/24, 10.20.41.0/24 | Sandbox hosts, internal NLB | **None** (no NAT, no S3 endpoint) |

Non-prod uses a separate VPC (10.30.0.0/16) with the same tiers but **no NAT**: tasks run in public subnets with public IPs, and the ALB security group only allows the team's IP addresses. This is acceptable only because non-prod holds no real data.

### 6.3 Egress design

- **Two NAT gateways in prod, one per AZ.** With a single NAT, an outage in its AZ would stop the other AZ's tasks from reaching SQS, EventBridge, ECR and the LLM, and would stop replacement tasks from pulling images, which freezes scale-out during a drive. A second NAT costs about $33/month. It stays in the plan; it is on the cost dials (Section 12.3) if you choose to accept that risk.
- **No interface VPC endpoints.** Each costs about $7/month per AZ, and at this data volume the NAT's per-GB charge is cheaper than a dozen endpoints. **Trigger:** NAT data processing exceeds about $50/month.
- **S3 gateway endpoint** on `app` subnets (free), with an endpoint policy limiting access to our buckets.
- **A regional NAT gateway is billed per AZ-hour as well, so it does not save money here.** It may simplify operations later.
- **Egress control.** Security groups cannot filter by domain, so outbound HTTPS is open to the NAT from the `app` tier. Mitigations: secrets are scoped per role, only `grading-worker` holds the LLM key, only `billing-api` holds payment-gateway keys, and only pseudonymized text leaves AWS for the LLM.

### 6.4 Security groups [PROPOSED]

| Security group | Inbound | Outbound |
|---|---|---|
| `sg-alb` | 443 from the internet (CloudFront and clients); 80 redirect | App tier ports |
| `sg-candidate`, `sg-execution`, `sg-billing`, `sg-biometric`, `sg-grading`, `sg-staff`, `sg-partner`, `sg-platform` | 8080 from `sg-alb` for public roles; service-to-service edges only as listed in 6.5 | 443 to NAT; 5432 to the matching Aurora security group; 6379 to Valkey |
| `sg-aurora-app` | 5432 from `sg-candidate`, `sg-biometric`, `sg-grading`, `sg-staff`, `sg-partner`, `sg-migrator-app`, `sg-dump-app` | none |
| `sg-aurora-restricted` | 5432 from `sg-billing`, `sg-platform`, `sg-migrator-restricted`, `sg-dump-restricted` **only** | none |
| `sg-valkey` | 6379 from the app-tier service groups | none |
| `sg-sandbox-nlb` | 8443 from `sg-execution` only | `sg-sandbox` |
| `sg-sandbox` | 8443 from `sg-sandbox-nlb` only | **none** |

### 6.5 Service-to-service edges (synchronous) [PROPOSED]

Everything not listed travels as an event (EventBridge/SQS). Maximum synchronous depth is 2.

| Edge | From → To | Purpose |
|---|---|---|
| E1 | `candidate` → `billing-api` | `Acquire` credit at session start (fail closed → HOLD) |
| E2 | Browser → `execution-api` (via ALB, candidate JWT) | Run code [CONFIRM: direct from the browser, as assumed here, versus via `candidate`] |
| E3 | `candidate` → `biometric-api` | Evidence upload tickets, verification status |
| E4 | `staff-api` → `billing-api` | Funding at drive launch, balances for recruiters |
| E5 | `staff-api` → `grading-api` | Scores and report detail, regrade requests |
| E6 | `staff-api` → `candidate` | Session status and detail |
| E7 | `staff-api` → `biometric-api` | Reviewer evidence access (MFA-gated) |
| E8 | `platform-api` → `billing-api` | Plans, price book, manual requests (maker-checker) |
| E9 | `platform-api` → `staff-api` | Tenant provisioning (keeps the `iam` DB credential out of the platform role) |

### 6.6 IAM: task-role matrix (what each process role can touch) [PROPOSED]

| Role | S3 | KMS (decrypt) | Secrets | Queues / bus | Notes |
|---|---|---|---|---|---|
| `candidate` | `artifacts` RW (`sessions/*`), `events` W, public snapshots R | `cdr-app`; sign with `cdr-jwt-candidate` | `db-runtime`, `valkey-candidate` | Publish events | Cannot read `content-scoring` or `biometric` |
| `execution-api` | `content-scoring` R | `cdr-content` | none (no DB) | none | Only holder of hidden-test read besides grading |
| `billing-api` | `ledger-worm` W (export task only) | `cdr-restricted` | `db-billing`, gateway keys, webhook secrets | `billing-events` | |
| `biometric-api` | `biometric` RWD | `cdr-biometric`, `cdr-app` | `db-biometric` | `biometric-events` | |
| `grading-worker` / `grading-api` | `events` R, `artifacts` RW (`reports/*`), `content-scoring` R | `cdr-app`, `cdr-content` | `db-grading`, `llm-api-key` (worker only) | Consume `grading-jobs` | Only LLM-key holder |
| `staff-api` | `artifacts` R, `content-scoring` RW (authoring) | `cdr-app`, `cdr-content`; sign with `cdr-jwt-staff` | `db-iam`, `db-hiring`, `db-content`, `db-insights` | Publish events | **No restricted-tier access** |
| `partner-api` | none | `cdr-app` | `db-hiring` | Publish events | No signing, no scoring |
| `platform-api` | none | `cdr-restricted` (via RDS) | `db-platform` | none | Only role with `platform` DB creds |
| Migrator tasks | none | per cluster | DDL role secret | none | One role per cluster; DDL rights only during deploy |
| Dump tasks | vault bucket W | `cdr-backup` | read-only DB role | none | Read-only on the source DB |

**Human access (IAM Identity Center, free):** `Developer` (full in non-prod, read-only in prod), `Operator` (prod deploys happen through CI only), `BreakGlass` (prod admin, MFA, time-boxed, alarm on use). Access to `cdr-restricted` through any human path requires two approvers (a separate time-boxed permission set), and every use is alarmed.

---

## 7. Data stores

### 7.1 Aurora PostgreSQL Serverless v2 [PROPOSED]

| Setting | `cdr-app-prod` | `cdr-restricted-prod` | `cdr-nonprod` |
|---|---|---|---|
| Holds (one database per service) | `iam`, `hiring`, `content`, `runtime`, `biometric`, `grading`, `insights` | `billing`, `platform` | All nine, synthetic data |
| Engine | Aurora PostgreSQL 16.x, latest minor (auto-pause needs 16.3 or later) | same | same |
| Instances | Writer + 1 reader, different AZs. Reader **promotion tier 2** | Writer + 1 reader, different AZs. Reader **promotion tier 1** | Writer only |
| Writer ACU range | 1 – 16 | 0.5 – 4 | 0 – 4, **auto-pause after 600 s idle** |
| Reader ACU range | 0.5 – 8 (scales on its own load) | 0.5 – 4 (tier 1 follows the writer, so a failover target is already sized) | none |
| Storage mode | Aurora Standard | Aurora Standard | Aurora Standard |
| Encryption | KMS `cdr-app` | KMS `cdr-restricted` | KMS `cdr-nonprod` |
| Subnet group | `data-app` | `data-restricted` | `data` |
| Automated backup retention (PITR) | 14 days | 35 days (maximum) | 1 day |
| Deletion protection | On | On | Off (IaC teardown) |
| Master user | RDS-managed secret; used only by migrator tasks | same | same |
| Log exports | `postgresql` log, 14-day retention | `postgresql` + `pgaudit`, 90-day retention | `postgresql`, 3 days |
| Performance Insights | On, 7-day free retention | same | Off |
| Enhanced Monitoring | Off | Off | Off |
| Minor-version auto-upgrade | Off; patch in a planned window outside any drive | Off | On |
| Maintenance window | Wed 02:00–02:30 IST (Tue 20:30–21:00 UTC) | Wed 02:30–03:00 IST | Any |
| RDS Proxy | **No** | **No** | **No** (a proxy blocks auto-pause) |

**Why reader tier 2 on the app cluster but tier 1 on the restricted one?** Readers in tiers 0 and 1 are kept at least as large as the writer, which roughly doubles ACU cost. The restricted cluster hosts the billing `Acquire` path, which must fail over to an already-sized instance. The app cluster can tolerate a failover target that scales up after promotion.

**Why Serverless v2 and not a provisioned instance?** Load is idle most of the month. Serverless v2 bills per ACU-hour (about $0.12 in us-east-1 [VERIFY for ap-south-1]) and the floor is 0.5 ACU (about $44/month per instance). At low average utilisation it beats the smallest provisioned class; if average utilisation stays above roughly 4 ACU, revisit provisioned instances plus a Savings Plan.

**Why not scale-to-zero in prod?** The restricted cluster serves ledger writes and payment webhooks at unpredictable times. A 15-second resume on the first request is acceptable in staging and unacceptable for money. In non-prod, auto-pause is the biggest single saving.

**Auto-pause facts that shape the design.**
- The idle timeout can be 5 minutes to 24 hours; the first connection to a paused instance resumes it, usually in under 15 seconds, so clients need connect-retry logic.
- An associated RDS Proxy keeps connections open and prevents pausing.
- A writer and its tier 0/1 readers pause and resume together.
- In non-prod set Prisma `connect_timeout=30` and `pool_timeout=30`, and make readiness probes **not** touch the database.

**Per-service database access (inside each cluster).**

| Rule | Setting |
|---|---|
| Roles per database | `<svc>_app` (DML only), `<svc>_migrator` (DDL, used only by deploy tasks), `<svc>_ro` (read-only, for dumps) |
| Isolation | `REVOKE CONNECT ON DATABASE <db> FROM PUBLIC`; each role may connect only to its own database. Postgres has no cross-database queries, so isolation is real |
| Timeouts per role | App roles `statement_timeout=15s`, `idle_in_transaction_session_timeout=60s`. **Billing role: `statement_timeout=5s`, `lock_timeout=2s`, `idle_in_transaction_session_timeout=10s`** (the hot-row path must never wait) |
| Connection pool (Prisma `connection_limit`) | `candidate` 10, `billing-api` 5, `biometric-api` 4, `grading-*` 4, `staff-api` 3 per database client, `partner-api` 3, `platform-api` 3 |
| Connection budget | At maximum task counts (Section 5.2) the app cluster sees roughly 470 connections. Check `SHOW max_connections` at the configured maximum ACU and keep the total under 60% of it [VERIFY] |
| Cluster parameters | `rds.force_ssl=1`, `log_min_duration_statement=500`, `log_lock_waits=on`, `track_io_timing=on`, `shared_preload_libraries=pg_stat_statements` (restricted adds `pgaudit` with `pgaudit.log='write,ddl,role'`) |
| Migrations | Expand/contract only; run as a one-off `migrate-<service>` task before the service rollout |

### 7.2 Event log off Postgres (telemetry path) [PROPOSED — confirm in the Wave-2 load test]

| Step | Behaviour |
|---|---|
| 1 | The browser batches events (keystroke edits, focus, paste, run/submit markers) and POSTs them every ~3 s with a monotonically increasing `seq`. The client keeps un-acknowledged batches in IndexedDB |
| 2 | `candidate` authenticates the session JWT, validates, de-duplicates on `(sessionId, seq)`, runs the paste/tab-switch correlation on an in-memory window, and appends to a per-session buffer |
| 3 | Every ~45 s or 256 KB the buffer flushes as one gzip JSONL chunk to `events/chunks/{sessionId}/{seq}.jsonl.gz` |
| 4 | The response carries `lastDurableSeq`; the client discards its local copy only up to that value. If a task dies, the client resends from the last durable value |
| 5 | Integrity flags and small session-state upserts (autosave at most every 10 s, not per keystroke) go to Postgres. **Raw events never go to Postgres** |
| 6 | On submission, a compaction step merges chunks into `events/sessions/{sessionId}.jsonl.zst` and records a manifest row. Chunks expire after 7 days. The keystroke replay reads the compacted file |

**Why:** keystroke telemetry is the highest-volume data in the system and the least valuable per byte. Putting it in Postgres would force the database to be sized for the telemetry storm rather than for transactional work, and it would put commit latency pressure on the billing hot row. **Order of magnitude (to measure):** on the order of 1–2 GB compressed per 2,000-candidate drive, which costs cents to store. **Trade-off:** correlation runs on the in-memory window and on replay, not by SQL over raw events; ad-hoc SQL analysis of raw telemetry is no longer possible.

### 7.3 Valkey cache [PROPOSED]

| Setting | Value |
|---|---|
| Service | ElastiCache Serverless for Valkey, `cdr-cache-prod` (and `cdr-cache-nonprod`) |
| Why serverless | The floor is about $6/month (100 MB minimum metered storage), it scales with spikes, and data is spread across AZs without us running replicas. Node-based `cache.t4g.micro` is about $9/month for a single node |
| Usage limits | Maximum data 1 GB, maximum 10,000 ECPU/s (a cost cap; raise per load test). Pre-warming: if the load test shows scaling lag, set a higher baseline before windows [VERIFY whether minimum limits are available and how they are billed] |
| Security | TLS in transit; KMS `cdr-app` at rest; **RBAC users per service with key-prefix ACLs** (`~candidate:*`, `~billing:*`, …) |
| Backups | **None.** Everything in the cache is reconstructible from Postgres: WebSocket fan-out, rate-limit counters, short-lived coordination. Loss degrades fan-out briefly; it never loses data |
| Rule | Billing correctness never depends on the cache; the ledger is the source of truth |

### 7.4 S3 buckets, SQS queues and the event bus

**S3 buckets (prod).** All buckets: Block Public Access on, bucket owner enforced, TLS-only policy, bucket keys on for SSE-KMS.

| Bucket | Holds | Class | Key | Versioning | Lifecycle | Notes |
|---|---|---|---|---|---|---|
| `cdr-prod-web-candidate`, `-web-admin`, `-web-platform` | SPA bundles | D | SSE-S3 | On | Noncurrent versions expire at 30 days | CloudFront OAC only |
| `cdr-prod-artifacts` | Submissions, code snapshots, public content snapshots, reports | B | `cdr-app` | On | Noncurrent expire at 30 days; abort incomplete multipart at 7 days | Per-role prefixes in the IAM matrix |
| `cdr-prod-content-scoring` | Hidden tests, answer keys, rubrics | B (IP) | `cdr-content` | On | Noncurrent expire at 365 days | Separate bucket and key so a candidate-facing role is blocked twice |
| `cdr-prod-events` | Telemetry chunks, compacted event logs | B/C | `cdr-app` | Off | `chunks/` expire at 7 days; `sessions/` Standard → Glacier Instant Retrieval at 30 days; hard expiry at 180 days (the retention job deletes earlier, per policy) | Tag objects with decision date for purge |
| `cdr-prod-biometric` | Evidence clips, ID photos | A | `cdr-biometric` | **Off** | Hard expiry backstop at 60 days after upload (the retention job purges at decision + appeal window) | **No replication, no versioning, by design.** Delete is allowed only for the retention role. Presigned PUT valid 5 minutes with size-range conditions; GET only through `biometric-api` after an MFA-gated reviewer claim, URL valid ≤ 15 minutes. CloudTrail data events on |
| `cdr-prod-ledger-worm` | Nightly ledger and billing-evidence exports | A | `cdr-restricted` | On (required) | Object Lock **Compliance**, default retention 8 years [VERIFY with counsel]; Standard → Glacier Instant Retrieval at 30 days → Deep Archive at 365 days | Replicated to the vault account (ap-south-2). **Start in Governance mode during shadow rollout; switch to Compliance only after the export is proven PII-free**, because a locked mistake cannot be deleted |
| `cdr-prod-logs` | ALB access logs | C | SSE-S3 | Off | Expire at 90 days | |

**Why no versioning or backup on biometric evidence?** The retention promise (delete at decision + appeal window) is stronger than recoverability. Versioning would keep deleted objects alive; replication would duplicate the most sensitive data. S3 durability protects against loss; the bucket policy and role limits protect against early deletion. The flag and the metadata survive in Postgres even if a clip is lost.

**SQS and EventBridge.**

| Resource | Setting |
|---|---|
| Bus `cdr-events` | One custom bus; 14-day archive for replay (events carry IDs only) [PROPOSED] |
| Queues (standard) | `grading-jobs`, `billing-events`, `candidate-events`, `control-plane-events`, `biometric-events` |
| `grading-jobs` | Visibility timeout 900 s (longer than the longest grading job), retention 4 days, long polling 20 s, `maxReceiveCount=3` → `grading-jobs-dlq` (retention 14 days), SSE-SQS |
| Other queues | Visibility timeout 120 s, retention 4 days, `maxReceiveCount=5`, DLQ each |
| Payloads | IDs and small metadata only (claim-check pattern); never PII |
| EventBridge targets | Dead-letter queue and a 24-hour maximum event age on every rule |
| Alarms | Any DLQ depth > 0; `grading-jobs` oldest-message age > 15 minutes |
| EventBridge Scheduler groups | `drive-windows` (planner), `platform-jobs` (nightly tasks), plus a `scheduler-dlq` |
| Nightly schedule (IST) | 01:00 `billing-nightly` → 01:30 ledger export → 02:00 `biometric-retention` → 02:30 `db-dump-restricted` (daily) → Sunday 03:00 `db-dump-app` |
| SES | **Not created.** Email stays on hold, as decided |

---

## 8. Edge, ingress and async entry points

### 8.1 DNS and certificates

| Item | Configuration |
|---|---|
| Route 53 | One hosted zone (about $0.50/month). `app.`, `admin.`, `platform.` → CloudFront; `api.`, `hooks.`, `partners.`, `platform-api.` → ALB (alias records) |
| Certificates | ACM wildcard `*.<domain>` in `ap-south-1` for the ALB (free); CloudFront flat-rate plans bundle a free TLS certificate |
| Health check | One Route 53 HTTPS health check on `api.<domain>/healthz` (about $0.75/month) feeding an alarm |

### 8.2 CloudFront (SPAs only) [PROPOSED]

| Distribution | Plan | Why |
|---|---|---|
| `candidate` (`app.`) | **Flat-rate Pro** (about $15/month): 10M requests, 50 TB transfer, 25 WAF rules | Headroom for campus drives |
| `admin` (`admin.`) | **Flat-rate Free** ($0): 1M requests, 100 GB, 5 WAF rules | Low traffic |
| `platform` (`platform.`) | **Flat-rate Free** ($0) with an IP-allowlist WAF rule | Low traffic, restricted audience |

Flat-rate plans bundle CDN, WAF with DDoS protection, DNS and a certificate for a fixed price. AWS states there are no overage charges [VERIFY exactly what happens to traffic if an allowance is exceeded; a single apex domain per plan and a three-Free-plan account limit apply].

| Setting | Value |
|---|---|
| Origin | S3 bucket via Origin Access Control |
| Caching | `/assets/*` immutable, one year; `index.html` `no-cache`; compression on |
| SPA fallback | Custom error responses 403/404 → `/index.html` with status 200, error TTL 0 |
| Response headers policy | HSTS (1 year), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`; `Permissions-Policy: camera=(self)` on the candidate app only |
| CSP (candidate) | `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self' https://api.<domain> wss://api.<domain>; img-src 'self' data: blob:; media-src blob:; frame-ancestors 'none'` (MediaPipe/ONNX WASM needs `wasm-unsafe-eval` [VERIFY]) |

**Why API, WebSocket and telemetry do not go through CloudFront.** They are chatty, long-lived and uncacheable. Routing about 4.8M telemetry requests per drive through a request-allowance plan would burn the allowance for no benefit. They go straight to the ALB, protected by a regional WAF.

### 8.3 Regional WAF on the ALB [PROPOSED]

Web ACL `cdr-prod-alb-acl` (about $5 + $1 per rule + $0.60 per million requests).

| Order | Rule | Scope | Action |
|---|---|---|---|
| 1 | Amazon IP reputation list (managed) | All | Block |
| 2 | Core rule set (managed) | All **except** `/candidate/code`, `/candidate/sql`, `/candidate/submit`, `/candidate/telemetry`, `/exec/*` and the `hooks.` host | Count for 7 days, then Block |
| 3 | Known bad inputs (managed) | Same scope as 2 | Count for 7 days, then Block |
| 4 | Rate limit by IP: 300 per 5 min | `/auth/*`, invite redemption | Block |
| 5 | Rate limit keyed on header `x-api-key`: 1,000 per 5 min per partner | `partners.` host | Block |
| 6 | Rate limit by IP: 600 per 5 min | `hooks.` host | Block |
| 7 | IP allowlist (corporate/VPN set) | `platform-api.` host | Block anything else |

> **Why exclude the code, SQL and telemetry paths from managed rules?** Candidates submit SQL and source code. Managed SQL-injection, XSS and path-traversal rules will block legitimate answers and make candidates fail through no fault of their own. Those endpoints are protected by authentication, size limits and schema validation in the application instead.
>
> **Why no per-IP rate limit on candidate paths?** Campus drives put thousands of candidates behind a few public IPs. Per-session limits live in the application (Valkey counters).

WAF logging: block and count actions only, to CloudWatch Logs `aws-waf-logs-cdr-prod`, 14-day retention.

### 8.4 Application Load Balancer [PROPOSED]

| Setting | Value |
|---|---|
| Load balancer | `cdr-prod-alb`, internet-facing, subnets `public-a/b`, `sg-alb`, deletion protection on |
| Listeners | 443 with `ELBSecurityPolicy-TLS13-1-2-2021-06`; 80 redirects to 443 |
| Idle timeout | 120 s (the app sends a WebSocket ping every 25 s) |
| Attributes | `drop_invalid_header_fields=true`, `desync_mitigation_mode=strictest`, `xff_header_processing=append`, access logs to `cdr-prod-logs` |
| Target groups | Type `ip`, HTTP 8080, algorithm `least_outstanding_requests`, stickiness off |
| Health check | `GET /healthz` (liveness only, **never touches the database**), interval 15 s, healthy 2, unhealthy 3, timeout 5 s |
| Deregistration delay | `candidate` 120 s (WebSocket drain); others 30 s |
| Slow start | 30 s on `candidate` |

| Priority | Host | Path | Target group |
|---|---|---|---|
| 10 | `hooks.<domain>` | `/webhooks/*` (POST only) | `tg-billing` |
| 20 | `partners.<domain>` | `/v1/*` | `tg-partner` |
| 30 | `platform-api.<domain>` | `/*` | `tg-platform` |
| 40 | `api.<domain>` | `/staff/*`, `/admin/*` | `tg-staff` |
| 50 | `api.<domain>` | `/exec/*` | `tg-execution` |
| 60 | `api.<domain>` | `/candidate/identity/*`, `/candidate/evidence/*` | `tg-biometric` |
| 70 | `api.<domain>` | `/candidate/*`, `/ws` | `tg-candidate` |
| default | any | any | Fixed 404 |

`grading-api` has no public rule; it is reached only through Service Connect.

### 8.5 Why there is no API Gateway at launch

API Gateway REST APIs can now reach a *private* ALB directly through a VPC link v2, with no NLB in between. That still requires a second, internal ALB (about $16+/month) because the shared ALB is internet-facing, plus the gateway itself. Partner volume is tiny. The WAF's header-keyed rate-limit rule gives per-partner throttling, and `partner-api` handles API-key authentication. **Trigger to add API Gateway:** a partner needs self-service key management, usage plans or quota-based billing at the edge.

### 8.6 Payment webhooks

`hooks.<domain>` routes only `POST /webhooks/*` to `billing-api`. The handler verifies the signature, records the event idempotently, and returns quickly; settlement work runs off the queue. Credits are granted only after a verified `payment.captured` event, as the pricing spec requires. The WAF skips body inspection here (signature verification is the control) but rate-limits per IP.

---

## 9. Backups, data reliability and recovery

### 9.1 Reliability targets (pilot, not an SLA) [PROPOSED]

| Target | Value |
|---|---|
| Tier 0 candidate path (`candidate`, `billing-api`, `execution-api`, `biometric-api`) | 99.5% during drive windows |
| Staff and super-admin surfaces (Tier 1) | Best effort, about 99% |
| Grading (Tier 2) | Delayed, never lost; results within about 1 hour of submission in normal operation |
| Finance and super-admin data (`cdr-restricted`) | RPO ≤ 5 minutes (PITR); RTO ≤ 1 hour for logical corruption; AZ failover typically 1–2 minutes including reconnect [VERIFY] |
| App data (`cdr-app`) | RPO ≤ 5 minutes; RTO ≤ 2 hours |
| Event log | RPO ≈ 60 seconds, bounded by the client re-sending un-acknowledged batches |
| Biometric evidence | Durability from S3; **no recovery by design** |
| Region outage | RTO 24–48 hours (rebuild from IaC and cross-region copies); RPO ≤ 24 hours. Explicitly not covered by an active-active design |

### 9.2 Recovery layers by data class

| Data class | Layer 1 (inherent) | Layer 2 (point in time) | Layer 3 (other account) | Layer 4 (different format) | Layer 5 (immutable) |
|---|---|---|---|---|---|
| **Finance + super-admin** (`billing`, `platform`) | Aurora storage: 6 copies across 3 AZs, reader failover | PITR, 35 days | AWS Backup daily snapshot copied to the vault account (35 days; monthly kept 12 months), plus a daily copy to ap-south-2 (14 days) | Daily logical dump (`pg_dump`, custom format) to the vault bucket | Nightly ledger export, Object Lock Compliance, replicated to the vault account in ap-south-2 |
| **App databases** | Same | PITR, 14 days | AWS Backup daily (14 d), weekly (8 weeks), monthly (3 months) to the vault; weekly copy to ap-south-2 | Weekly logical dumps of `iam`, `content` (the IP moat) and `biometric` (consent records) | n/a |
| **Hidden tests and answer keys** | S3 durability | Versioning (365-day noncurrent retention) | n/a | `content` DB dump references them | n/a |
| **Artifacts** | S3 durability | Versioning (30 days) | n/a | n/a | n/a |
| **Event logs** | S3 durability | Client resend window | n/a | n/a | n/a |
| **Biometric evidence** | S3 durability | **None, by design** | **None, by design** | n/a | n/a |
| **Cache, queues** | n/a | n/a | n/a | n/a | n/a |
| **Infrastructure** | n/a | Git history | IaC state bucket versioned and copied to the vault | n/a | n/a |

> **Why the finance tier gets four recovery layers beyond Aurora's own replication.** Each layer defeats a different failure: PITR defeats a bad query; the vault-account snapshot defeats a compromised prod account or a deleted cluster; the logical dump defeats a corrupt storage layer and gives a way to restore a *single database*; the WORM export gives immutable, row-level evidence for audits and disputes. Together they cost a few dollars a month.

### 9.3 AWS Backup configuration [PROPOSED]

| Item | Setting |
|---|---|
| Backup plan `cdr-restricted` | Daily at 02:30 IST, retain 35 days. Copy action → `cdr-vault-mum` (cross-account, 35 days). Copy action → `cdr-vault-hyd` (ap-south-2, 14 days). Monthly rule (1st), retain 12 months, copied to the vault |
| Backup plan `cdr-app` | Daily 14 days; weekly (Sunday) 8 weeks → vault; monthly 3 months → vault; weekly copy to ap-south-2 for 4 weeks |
| Vaults | `cdr-vault-mum`, `cdr-vault-hyd` in the vault account, encrypted with `cdr-backup` (a key that lives in the vault account, so losing a prod key never loses the backups) |
| Vault Lock | Compliance mode, minimum 7 days, maximum 400 days, **with a 7-day changeable window (`ChangeableForDays=7`) to test before it becomes permanent** [VERIFY lock semantics] |
| Access | The prod account's backup role can copy in but cannot delete or shorten retention |
| Alerts | EventBridge rule on backup/copy job `FAILED` or `EXPIRED` → SNS; alarm if no successful restricted backup in 26 hours |
| Logical dumps | Scheduled Fargate tasks (read-only DB role) write encrypted dumps to the vault bucket; the restricted dump runs daily, app dumps weekly |

### 9.4 Backup storage cost (why we do not cut backups)

Aurora includes backup storage up to the size of the cluster's database; beyond that it is billed at about $0.021 per GB-month (us-east-1).

| Assumption | App DB 30 GB, restricted DB 5 GB (first year) |
|---|---|
| PITR (within the free allocation) | $0 |
| Vault snapshots (effective ≈ 2.5–3× DB size retained) | about $2 |
| Cross-region copies (about +50%) | about $1 |
| Logical dumps, WORM exports (compressed, under 1 GB) | cents |
| **Total** | **about $3–4 per month** |

This grows roughly linearly with data size: a 500 GB app database would put backups near $35–50 per month, still small next to compute. **Compute is the cost problem; backups are not.**

### 9.5 Failure scenarios

| # | Scenario | Detection | Recovery | RTO | RPO |
|---|---|---|---|---|---|
| 1 | A Fargate task crashes or its host fails | ALB health check, ECS | ECS replaces the task | 1–2 min | 0 |
| 2 | An AZ outage | ALB, Aurora events | ALB drains the AZ; tasks relaunch in the other AZ; Aurora fails over to the reader (restricted: already sized; app: scales up after promotion); two NATs mean replacement tasks can still pull images | 2–10 min | 0 |
| 3 | A bad deploy | ECS circuit breaker, alarms | Automatic rollback; migrations are expand/contract, so the old version still works | 2–5 min | 0 |
| 4 | An operator mistake (bad query, dropped table) | Alarm or report | PITR to a new cluster, then extract the damaged database (Runbook RB-2) | 1–3 h | ≤ 5 min |
| 5 | A bug writes bad ledger rows | Nightly 7-point reconciliation | Append correcting entries (the ledger is append-only); rebuild cached balances from the ledger | Next business day | 0 |
| 6 | Storage-layer corruption | Reconciliation, errors | Restore the logical dump or a vault snapshot | 2–4 h | ≤ 24 h |
| 7 | Prod account compromise or ransomware | GuardDuty, CloudTrail, BreakGlass alarm | Rebuild in a clean account from IaC; restore from the vault account (RB-3) | 4–8 h | ≤ 24 h |
| 8 | A KMS key disabled or scheduled for deletion | Alarm on key state change | SCP prevents short deletion windows; restore the key within its waiting period; backups use a different key | < 1 h | 0 |
| 9 | S3 object deleted by mistake | Alarm | Restore the previous version (artifacts, hidden tests). **Biometric evidence: not recoverable by design** | < 1 h | 0 |
| 10 | Region outage | AWS status | Rebuild in ap-south-2 from IaC and cross-region copies (RB-4) | 24–48 h | ≤ 24 h |
| 11 | The payment gateway is down | Webhook failures, alarms | HOLD flow for candidates; webhooks retried; reconcile when back | n/a | 0 |
| 12 | The LLM provider is down | Grading queue age | Retries; DLQ; switch provider through `LlmPort` | Delayed, not lost | 0 |
| 13 | A Spot interruption (sandbox, grading) | Host health, SQS | Run retried on another host; message returns to the queue | Seconds | 0 |
| 14 | Valkey is lost | Alarm | Rebuild state from Postgres; WebSocket fan-out degrades briefly | Minutes | n/a |
| 15 | A single NAT or AZ loses egress | Alarms | Second NAT carries the other AZ | Automatic | 0 |

### 9.6 Runbooks and drills

| Runbook | Purpose |
|---|---|
| RB-1 | PITR to a new cluster, validate, cut over by swapping the secret or endpoint |
| RB-2 | Restore a single database: PITR clone → dump that database → restore into the live cluster under a new name → swap |
| RB-3 | Restore from the vault account after a prod-account compromise |
| RB-4 | Region fallback to ap-south-2 |
| RB-5 | Rotate secrets and keys after a suspected leak |
| RB-6 | Rebuild balances from the ledger and WORM export |

**Drill cadence:** a monthly automated restore test of the latest restricted logical dump into non-prod (checksum and row-count comparison, alarm on failure); a quarterly PITR drill for both clusters; a half-yearly vault-restore drill. A backup that has never been restored is an assumption, not a backup.

### 9.7 Retention and purge (policy, to be confirmed) [VERIFY with counsel / DPIA]

| Data | Retention | Mechanism |
|---|---|---|
| Biometric evidence, ID photos | Decision + appeal window (~30 days) | Scheduled `biometric-retention` task; S3 lifecycle backstop at 60 days |
| Raw event logs | ~90 days after decision | Tagged objects; retention task; lifecycle backstop at 180 days |
| Candidate responses and scores | Per customer contract (planning default 24 months) | Application purge job |
| Finance ledger and platform audit | 8 years | Object Lock; no PII in exports (CI test) |
| Application logs | 14 days (billing/platform/audit 90 days) | CloudWatch retention |
| CloudTrail | 1 year in the vault account | S3 lifecycle |
| Backups | Per Section 9.3 | AWS Backup lifecycle |

**Erasure and backups.** The ledger carries no PII (plain UUID snapshots, no foreign keys to transient entities), so an erasure request never touches it. Candidate PII in app-database backups ages out with backup retention (14 days to 3 months). Document this in the privacy notice.

### 9.8 What this design does not cover

Active-active multi-region, sub-hour region failover, per-tenant restore, S3 point-in-time restore beyond versioning, and recovery of biometric evidence. Each is a deliberate cut with a trigger in Section 10.

---

## 10. Keep / cut / defer ledger

**Rule for deciding.** Keep a feature if removing it would (1) break a legal or contractual promise, (2) risk irreversible data loss, (3) open a security boundary that is expensive to restore later, or (4) cost more to retrofit than to carry. Cut it if it is comfort-level availability or observability with a cheap manual substitute, or if its cost scales with idle time.

### 10.1 Kept despite the cost

| Item | Monthly cost | Reason |
|---|---|---|
| Separate `cdr-restricted` cluster | ≈ +$89 | Explicit requirement; limits blast radius; independent key, subnets and backups |
| Reader on both prod clusters | ≈ +$88 | AZ failure on the billing path would otherwise take down candidate starts for many minutes |
| Two NAT gateways | ≈ +$33 | Keeps scale-out and replacement working during an AZ outage in a drive window |
| Internal NLB in front of the sandbox | ≈ +$18 | Health checks and AZ-aware routing without custom code on a Tier-0 path |
| Idle sandbox host (1 small) | ≈ +$58 | Previews, demos and ad-hoc runs must not wait for a cold start |
| Vault account + AWS Backup + Vault Lock | ≈ +$4 | Survives a compromised prod account |
| Seven KMS keys | ≈ +$10 | Cheapest hard boundary between data classes |
| Regional WAF | ≈ +$12 | Baseline protection for the public API |
| GuardDuty | ≈ +$8 | Detection for a small team with no SOC |
| Rotating per-service DB secrets | ≈ +$6 | Credential hygiene; part of the "own role per service" rule |
| Nightly reconciliation and DLQ alarms | ≈ $0 | Money correctness |

### 10.2 Cut, with reason and trigger to bring back

| Cut | Reason | Bring back when |
|---|---|---|
| API Gateway for partners | Needs a private ALB; partner volume tiny; WAF header-keyed limits suffice | A partner needs self-service keys, usage plans or quota billing |
| RDS Proxy | ≈ $88/month per proxy at the Serverless v2 minimum; blocks auto-pause; Prisma pool limits suffice | Σ(tasks × pool) exceeds ~60% of `max_connections`, or failover connection storms appear |
| Interface VPC endpoints | ≈ $7/month per AZ each; NAT per-GB cost is lower at this volume | NAT data processing exceeds ~$50/month |
| ADOT/X-Ray in prod | Sidecar CPU and memory plus trace cost; correlation IDs in logs give most of the value | Cross-service latency debugging becomes a weekly task |
| Container Insights | Per-metric cost; standard ECS metrics are free | A capacity question the standard metrics cannot answer |
| CloudWatch Synthetics | ≈ $10/month for one 5-minute canary; a Route 53 health check plus CI synthetic drive in non-prod covers the need | A customer SLA that requires external transaction monitoring |
| AWS Config, Security Hub, Macie, enhanced Inspector, Network Firewall | Per-resource or per-GB costs out of proportion to a two-person team | SOC 2 / ISO scoping |
| Valkey replicas and snapshots | Cache is reconstructible; serverless is already multi-AZ | Cache holds data we cannot rebuild |
| Biometric versioning, replication and backup | Retention promise outranks recoverability | Never, unless the DPIA changes |
| Aurora Global Database / second-region replica | Large fixed cost for a pilot | A contract requires RTO under 4 hours for a region loss |
| Separate `candidate-ingest` service | Same scaling signal; saves a task and a pipeline | Load test shows event-loop contention |
| Always-on `billing-worker` and `biometric-retention` | Replaced by scheduled one-off tasks, paid per second | Continuous background work appears |
| Non-prod WAF, NAT, HA, paid CloudFront plan, per-class CMKs | No real data; IP allowlist is enough | n/a |
| Dedicated security-tooling and log-archive accounts | The vault account covers both for now | Compliance scoping |
| Shield Advanced | About $3,000/month commitment | A contract or a DDoS history requires it |
| SES | Email stays on hold, as decided | Email returns to scope |
| Reserved capacity today | No usage history yet | After about 3 months, see Section 12.4 |

### 10.3 Deferred with a measurable trigger

| Item | Trigger |
|---|---|
| Aurora I/O-Optimized | I/O charges exceed roughly 25% of the Aurora bill [VERIFY threshold] |
| Provisioned Aurora instances + Savings Plan | Average load stays above about 4 ACU for weeks |
| Compute Savings Plan | Three months of stable floor; commit to no more than about 70% of it |
| Splitting `ingest` out of `candidate` | See Section 5.2 |
| IAM database authentication instead of stored passwords | Prisma driver-adapter support confirmed [VERIFY] |
| Bedrock instead of an external LLM | A customer requires in-region AI processing, or provider outages hurt |
| Dedicated cluster for one enterprise tenant | A contract requires it (priced into the deal) |

