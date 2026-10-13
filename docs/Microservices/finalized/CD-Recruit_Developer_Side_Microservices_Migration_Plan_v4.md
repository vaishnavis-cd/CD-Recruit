# CD-Recruit / Proctora — Developer-Side Microservices Migration Plan

**Version:** 4.0  
**Date:** 13 October 2026  
**Status:** Engineering execution plan — **service extraction is blocked until the prerequisites and exit gates below pass**  
**Repository snapshot audited:** branch `dev-microservice`, commit `4bec750` (recheck before implementation)  
**Architecture source of truth:** `CD-Recruit_Microservices_Architecture_Specification_v0.2.md`

## 1. Purpose and relationship to the other documents

This is the developer's work plan: what to inspect, what to change, in what order, how to test it and when a code boundary is safe to split. It is not a guide to creating AWS accounts or selecting every AWS SKU.

- The **formal architecture specification** defines target boundaries, decisions, risks, data ownership, communication rules and deployment-team inputs.
- The **end-to-end explanation** explains user journeys and infrastructure in accessible language.
- This **developer plan** defines code prerequisites, extraction sequence, tasks, contracts, test gates, rollback and coding-agent prompts.

If code/audit evidence conflicts with a diagram, stop and report the conflict. Do not silently make the diagram true by changing behavior. Use an Architecture Decision Record (ADR) for approved changes.

## 2. Audit status: what is done, and what is not done

### Completed discovery prerequisites

- [x] Frontend topology audit completed.
- [x] Admin Web SSR-versus-static audit completed.
- [x] Combined monolith dependency, cross-domain transaction, capacity and telemetry audit completed.
- [x] Current branch/commit, top-level NestJS module inventory and Prisma model count recorded in the audit.
- [x] Existing k6 tests identified and their current five-VU limitation recorded.

### Technical prerequisites still blocking service extraction

- [ ] Billing's current cross-domain `billing_begin()` transaction replaced with an explicit reservation/consumption state machine.
- [ ] Hidden-test access removed from Candidate Runtime code paths and verified with security tests.
- [ ] Entity/data ownership register and cross-domain Prisma/database dependency plan approved.
- [ ] Durable autosave/telemetry checkpoint semantics defined and tested; answer state must not exist only in Valkey.
- [ ] Internal gRPC contracts, idempotency/deadline/error semantics and private service identity defined.
- [ ] Transactional outbox/inbox, duplicate handling, retry budgets and DLQs implemented for the first events that cross process boundaries.
- [ ] Large biometric evidence uploads moved from Node multipart buffering to presigned direct S3 uploads and tested.
- [ ] Service-specific NestJS composition roots/task roles/secrets designed and proven; do not deploy the complete monolith under differently named public routes.
- [ ] Frontend and email prerequisites completed as described below.
- [ ] A safe 250/500/1,000/2,000 VU load-test plan and regional cost model exist.

**Audit completion is not architecture readiness.** No feature module may be extracted into a new process until P0 gates are implemented and passed. The team can prepare contracts, test harnesses and isolated branches in parallel, but must not make production routing depend on an unproven service.

## 3. Target service model

Six logical groups, eight ECS service definitions and a separate EC2 sandbox pool are the current proposal. The Control Plane stays together as a codebase initially, but Staff, Partner and Platform must run as deliberately composed process entrypoints with separate permissions.

| Physical deployable | Existing code areas | Target responsibility | Important boundary |
|---|---|---|---|
| `candidate-runtime-api` | Candidate, Session, Assessment, public module delivery, WebSocket | Candidate token redemption, timing, session state, question delivery, answer persistence, submission bundle/outbox | No hidden tests, ledger DB, biometric decrypt key, platform DB or LLM key |
| `execution-api` | Judge0/Piston adapter, Coding/SQL/NoSQL runner parts | Private execution job API, quotas, sandbox dispatch, sample-run output, hidden test run when called by authorized grading | Never public; no host-level fallback; no production data; no general egress |
| `billing-api` | Billing, Ledger, pools, account, price book, payments, webhook, reconciliation | Price versions, purchases, credits, reservations, posted ledger, overrides, reconciliation | Only owner of Billing DB/ledger invariants |
| `biometric-api` | Proctoring evidence/identity and FaceVerify/ONNX adapters | Identity inference, evidence tickets, metadata, evidence access and retention | Dedicated S3 prefix/key/role; Runtime does not proxy large video buffers |
| `grading-worker` | AI evaluation, scoring orchestration, future Say-Do worker | Durable async scoring, deterministic tests, AI rubric scoring, confidence/provenance | Worker only; no permanent public API required at launch; no placeholder-as-real score |
| `staff-api` | Auth/staff and IAM + Hiring + Content + Insights modules | Tenant Admin routes for drives, roster, questions, org settings, reports | Shared code/process means a wider Control Plane blast radius; no restricted DB creds |
| `partner-api` | Partner integration | ATS candidate ingestion/status/result polling and agreed exports | Separate runtime/role, partner keys and scope; no platform or hidden-test privileges |
| `platform-api` | Platform, PlatformAuth, PlatformAudit, platform billing control | Super Admin, product configuration, tenant controls, audited overrides and system-health view | Separate issuer/audience and task role; should not depend on Runtime/Staff API for health display |

Additional components that are not counted as ECS service definitions:

- EC2 Auto Scaling sandbox pool for untrusted execution.
- Three static frontend sites (after Admin Web converts to a static SPA).
- SQS-triggered SES email Lambda proposed for low-volume email processing.
- EventBridge/Scheduler/Lambda for capacity planning and one-shot scheduled jobs where justified.
- One-off migration/dump/restore tasks.

If email needs a dedicated ECS worker, or if Grading API becomes necessary, update the service count and cost model before authority sign-off.

## 4. Frontend findings and required decision

### Classification

| Frontend | Audit classification | Intended target |
|---|---|---|
| `frontend/candidate-web` | Independent React/Vite SPA | Static S3 + CloudFront (`assess.<domain>`) |
| `frontend/admin-web` | Independent TanStack Start/Nitro build today; inspected routes use client data/auth and no required server-only feature was found | Convert to standard Vite + TanStack Router SPA; static S3 + CloudFront (`app.<domain>`) |
| `frontend/super-admin-web` | Independent React/Vite SPA | Static S3 + CloudFront (`platform.<domain>`) |

These are not microfrontends. Compile-time shared types/design tokens do not make them runtime-composed microfrontends. Keep folder/package names stable; use “Platform Web (Super Admin)” as a documentation alias rather than renaming folders.

### Admin Web conversion gate

Before removing TanStack Start's Node/Nitro runtime:

- Produce a standard `dist/index.html` through the chosen Vite + TanStack Router SPA setup.
- Verify direct navigation/deep links: `/drives/:id`, `/results/:id`, `/dashboard`, `/billing` and unknown routes.
- Verify login, logout, token expiry/refresh, 401 redirect and route guards.
- Test Monaco, Recharts, CSV parsing, forms and all browser-only imports.
- Test CloudFront history fallback and API routing/origin, CORS, Authorization headers and security headers.
- Confirm no hidden server action/secret or request-specific feature appears during the conversion.
- Keep the old build available for rollback until reviewers approve the new build and regression results.

This is an engineering requirement; the deployment team controls the final S3/CloudFront configuration.

## 5. Critical product invariants before code movement

### 5.1 Billing/Runtime invariant

The audit confirmed that `billing.billing_begin()` currently updates the session and reads organisation/drive data while mutating Billing tables in one PostgreSQL transaction. This is the principal blocker for independent database ownership.

Required lifecycle:

`NONE → HELD → CONSUMED`  
`HELD → RELEASED` or `HELD → EXPIRED` under the agreed recovery policy.

1. Runtime asks Billing `ReserveCredit` before starting the server-authoritative timer.
2. Billing writes only Billing-owned records; the reservation is idempotent by operation/session key.
3. Runtime records the chargeable milestone only after verified presence and the agreed first-real-question delivery/ack protocol.
4. The milestone and its outbox row are durably committed together.
5. Billing consumes the held reservation idempotently and posts the ledger entry exactly once.
6. Unchargeable sessions release their hold via an idempotent command; expiry/reconciliation must handle late events and races.
7. Posted ledger entries are never directly edited/deleted; corrections are reversal/compensating entries with full audit information.

The front-end cannot prove with mathematical certainty that a human saw rendered pixels. Product/finance must approve the engineering contract: authenticated client acknowledgement plus server delivery record. Freeze this semantics before coding beyond characterization tests.

### 5.2 Hidden-test boundary

The audit found `coding.service.ts` queries test cases and filters hidden cases inside the current monolith. This is not acceptable for the target boundary.

- Candidate Runtime receives public questions and visible/sample test data only.
- Runtime asks private Execution API to run candidate sample code.
- Grading Worker requests the final hidden-test run from Execution API using the snapshot ID.
- Execution API/Grading Worker have narrowly scoped scoring-snapshot read permission; Candidate Runtime has none.
- Tests must assert that candidate APIs, DTOs, logs, error messages, S3 URLs and browser payloads never reveal hidden tests/answer keys/rubrics.

This is a P0 fix prior to public production and before Runtime extraction.

### 5.3 Durable answers and telemetry

The 15-second heartbeat is temporary presence data; it may move to Valkey with a TTL after test coverage. Accepted candidate answers/autosave state is different. Do not acknowledge an answer checkpoint if it is only in Valkey.

- Use monotonically increasing `sessionId + sequence/version` identifiers.
- Acknowledge only after the defined durable write completes.
- Deduplicate retransmits and apply only monotonic/newer state versions.
- Batch writes where safe; do not delay durability beyond the approved candidate data-loss window.
- Confirm whether raw edit/focus/paste/keystroke telemetry exists. The prior architecture proposed it, but the latest combined audit did not prove the entire stream is implemented.
- If raw telemetry is required, define event types, minimization, sequence/ack semantics, chunking, retention, purge, reviewer access and expected bytes/object count before choosing storage cadence.

The audit's proposed DB-write target `<15 writes/sec` is unproven: if all 2,000 candidates save every 30 seconds and the server flushes each active candidate's state every 60 seconds, the autosave flush alone implies ~33.3 writes/sec. The actual active-typing ratio and batching behavior need measurement. Preserve durability over achieving an arbitrary write-rate target.

## 6. Current coupling register to burn down

| Coupling/risk found | Evidence | Required change before relevant extraction |
|---|---|---|
| `billing_begin()` mutates session and Billing state in one transaction | Billing invariant migration and `SessionService.beginSession` | Extract Runtime state change from Billing procedure; add reservation/consumption/release state machine and characterization tests |
| Candidate Runtime reads hidden test cases | `coding.service.ts` code path found in audit | Move hidden test loading behind private Execution API; deny Runtime S3 scoring permissions |
| Runtime reads drive schedule/config via direct Prisma joins | `session.service.ts` path in audit | Create a versioned invite/drive projection and frozen session configuration snapshot |
| Multipart video uploads buffer in API memory | `proctoring.controller.ts` | Presigned direct S3 uploads; metadata-only API calls |
| Shadow billing simulation enters session start | `ShadowBillingService` via session path | Make shadow/reconciliation behavior non-blocking and durable; no SAVEPOINT coupling once Billing splits |
| One Prisma schema contains all 41 models | `backend/prisma/schema.prisma` | Model ownership register, per-domain client/schema strategy, staged expand/contract migrations |
| Existing tests are 5 VUs | existing k6 scripts | Repair/extend test profiles; never describe target capacity as validated without run evidence |
| Potential raw telemetry stream not confirmed | audit did not establish a complete implementation | Search and document actual producers/consumers before costing/retention decisions |

Search and document all other `$queryRaw`, triggers, cross-domain joins, EventEmitter listeners, cron jobs, queue processors, WebSocket gateways, shared singleton state and background jobs before extraction. The table is not a substitute for the full dependency scan.

## 7. Service contracts and communication rules

### Synchronous gRPC

Propose private gRPC/Protobuf contracts for:

- `BillingService.ReserveCredit`
- `ExecutionService.RunSample`
- `ExecutionService.RunHiddenTests` (authorized worker caller only)
- `BiometricService.IssueEvidenceUpload` / verification status
- Approved staff/platform-to-business operations that require immediate confirmation

Each contract must define authentication/authorization metadata, input validation, error mapping, deadline, cancellation, idempotency, metrics and version compatibility. No direct public listener exists for these service RPCs.

### Async events/commands

Use outbox-backed events for facts that happened (session submitted, payment captured, content snapshot published, score completed) and queue commands for durable work (grading, email, reconciliation). SQS standard queues are fine by default when consumers are idempotent and order-independent. If credit transition order requires FIFO/per-session ordering, prove it with state-transition tests and select a suitable mechanism; do not assume all queues are ordered or exactly-once.

### Minimum event envelope

Every event should include `eventId`, `eventType`, `schemaVersion`, `occurredAt`, `producer`, `tenantId` (where applicable), `aggregateId`, `aggregateVersion`, `correlationId`, `causationId` and a small payload. Avoid raw PII/evidence. Large body is an S3 pointer plus hash and content type. Consumers persist processed event IDs or use equivalent durable idempotency.

### Initial event seams

- `billing.payment.captured` / `billing.credits.granted`
- `billing.reservation.held` / `billing.credit.consumed` / `billing.credit.released`
- `content.snapshot.published`
- `hiring.invite.upserted` / `hiring.drive.scheduled`
- `runtime.session.created` / `runtime.session.started` / `runtime.session.submitted`
- `grading.score.completed`
- `biometric.identity.verified` / `biometric.evidence.stored`
- `notification.email.requested` / delivery status events

Finalize event names/payloads in the shared contracts package before implementing producers/consumers. These names are proposals, not proof that the events exist today.

## 8. Self-managed JWT and authorization implementation plan

Separate application trust domains and never accept frontend route guards as access control:

- Candidate JWT: candidate audience, short lifetime, scoped to session/drive; mint only after invite validation.
- Tenant staff JWT: staff issuer/audience, role + organization scope.
- Platform JWT: separate issuer/audience and key boundary, MFA for privileged operations.
- Internal service caller identity: explicit service identity and allowed RPC; private networking is not the only control.
- Partner key: per-partner, scoped, hashed at rest, rotatable, rate-limited and audited.

Implementation requirements:

1. Strict JWT algorithm, signature, issuer, audience, expiry and key-ID validation.
2. Asymmetric signing is recommended; protect signing keys and test rotation/compromise recovery. If using KMS signing, benchmark the operational/cost implications and cache public keys; do not call a remote identity server on every API request.
3. Refresh tokens are random, stored hashed, rotated on use, revocable and monitored for replay.
4. Every protected endpoint applies tenant/role/resource authorization in backend code and query scope.
5. Platform operators use MFA, short-lived sessions and audited impersonation/override actions.
6. No tokens, secrets or unnecessary PII in logs.
7. Decide if refresh credentials should move out of localStorage to HttpOnly Secure SameSite cookies after a dedicated threat-model/CORS/CSRF review; do not make that change casually in one SPA only.

## 9. Control Plane composition and service roles

The codebase keeps IAM, Hiring, Content and Insights together at first. To achieve separate permission and failure boundaries, do not launch the whole monolith under three public paths. Create explicit NestJS application composition roots (e.g., staff bootstrap, partner bootstrap, platform bootstrap), with:

- only the allowed controller/module set loaded;
- per-role validated environment variables and secrets;
- separate DB credentials/secrets and task roles;
- separate health/readiness endpoints;
- no route to the restricted cluster for Staff/Partner;
- Platform health reads that do not require Staff API or Candidate Runtime.

The shared Control Plane remains a compromise: Staff API's four domains may still share a process and task permissions, which broadens its blast radius relative to separate IAM/Hiring/Content/Insights services. Extraction of those domains is conditional on measured operational need.

## 10. Email requirements

Email is mandatory. Proposed low-cost implementation: business services write notification commands through a durable outbox/queue; an SQS-triggered Lambda sends via SES; delivery status/bounce/complaint events update a durable status record and alarms. This avoids an always-on email ECS worker at low volume. If templates/personalization or throughput need a dedicated worker, document the added deployable and cost.

Required use cases: account/email verification, password recovery, assessment invitation, schedule/reminders, purchase/payment confirmation, assessment completion/result availability, and operational alerts. Decide whether ATS integrations own candidate emails in partner-specific flows.

Readiness gates: sender domain verification, SPF/DKIM/DMARC, SES production access/quota, template versioning, retries with bounded attempts, idempotency, bounce/complaint handling and observable delivery failures. Email is not complete just because SDK calls compile.

## 11. Capacity and load validation plan

### 11.1 The current test evidence is insufficient

The audit observed only five VUs in existing k6 scripts. No 2,000 candidate assertion may be used as a guarantee until test results are reviewed and repeated after material traffic-path changes.

### 11.2 Test profiles

| Stage | VUs | Profile | Proposed threshold (requires approval) |
|---|---:|---|---|
| 1 | 250 | Ramp 3 min, steady 15 min | API p95 <250 ms; error rate <0.01%; no DB pool timeouts |
| 2 | 500 | Ramp 5 min, steady 20 min | API p95 <350 ms; error rate <0.05%; scaling behaves predictably |
| 3 | 1,000 | Ramp 8 min, steady 30 min | API p95 <500 ms; execution queue wait target <1 s |
| 4 | 2,000 | Ramp 10 min, steady 45 min | API p95 <800 ms; error rate <0.20%; zero credit duplication and no accepted-answer loss |
| Stress | 2,500 | Spike 2 min, steady 10 min | Graceful degradation/HOLD/queueing; no uncontrolled 500 cascade or silent data loss |

Targets are provisional; split out candidate HTTP, first question, execution Run, reserve credit, submission acknowledgement and grading completion metrics. API average response time alone is not enough.

### 11.3 Traffic formula from the audit

For 2,000 active candidates over 3 hours:

- Heartbeat: 2,000/15 = 133.3 RPS; 1.44M requests.
- Autosave: 2,000/30 = 66.7 RPS if all candidates are actively saving; 720k requests.
- Anomaly events at 0.15/candidate/minute: 5 events/sec; 54k over 3 hours.
- Code runs: 20 runs/candidate/3h = 40,000 runs; 3.70/sec average and assumed 10/sec peak.
- Misc/navigation assumption: 10/sec.
- Aggregate baseline: 218.7 RPS; with 20% retry/reconnect allowance: 262.4 RPS.

The 380–450 RPS peak from the audit must be supported by an actual scenario calculation/test. The previous 18,000 anomaly count is inconsistent with 0.15 per minute; it implies 9 per session, or 0.05/minute.

Measure request payloads, response bytes, retry rate, S3 object count, payload compression, DB writes, connection pool waits, event-loop lag, WebSocket reconnects, code-run concurrency, inference queue and grading job duration. Treat image/video counts and raw edit/focus/paste telemetry as test assumptions until confirmed.

### 11.4 Load model for Execution

The 10 RPS peak code-run assumption is not sufficient to size the pool by itself. If run duration is 2 seconds, steady concurrency at 10 RPS is ~20 jobs; if runs remain active for 5 seconds, it may be ~50. Apply Little's Law (`concurrency ≈ arrival rate × average duration`) and also test p95/p99 duration and per-job CPU demand. The provisional four `c6i.xlarge` warm hosts provide 16 vCPU; this may be insufficient at the worst-case peak, so use measured queue wait and active slots to set the ASG ceiling.

## 12. Recovery priorities and scaling ownership

- Platform/Super Admin has top operational recovery priority: at least two production Platform API tasks across AZs; static site and health dashboard should work when Runtime/Staff fail. Shared `cdr-restricted` Aurora remains a dependency for state-changing platform functions.
- Runtime/Billing/Execution must be prewarmed for scheduled drives. Scale task/worker counts before start, keep them during the submission drain, and scale down only after buffers/grading submission handoff is safe.
- Staff API may use a smaller idle footprint and scale during admin work.
- Partner API scales with batch ingestion/partner load.
- Grading Worker may scale from zero outside drive windows if the business accepts a cold-start grading delay; submitted jobs must remain durable and visible.
- Sandbox capacity uses a mixed On-Demand/Spot policy after interruption behavior is proven.

Exact ACUs, task counts, node types, NAT count, Valkey mode and scaling alarms are jointly validated from load tests; deployment selects actual AWS sizing/quotas.

## 13. Cost approach for engineering

Do not use either existing cost draft as an approved number. The latest audit reports $301.90 idle/$362.90 one drive/$545.80 four drives/$1,033.60 twelve drives, while the prior infrastructure plan reports $715 base and $20–35 infra plus $60–160 LLM per drive. They differ in resources and assumptions; the lower worksheet undercounts database/high-availability and backup/edge/email/queue/telemetry items and excludes some event chunk objects.

Working placeholder only, using the previous full-topology draft assumptions:

| Scenario | Temporary estimate | Status |
|---|---:|---|
| Idle base | ~$715/month | Unverified |
| One drive | ~$795–910/month | Unverified |
| Four drives | ~$1,035–1,495/month | Unverified |
| Twelve drives | ~$1,675–3,055/month | Unverified |

Do not use these figures as a quote or final budget. Deployment must price the selected region in the AWS Pricing Calculator and include ECS/Fargate, EC2+Spot/On-Demand hours, both Aurora clusters/readers/backups, Valkey, NAT/ALB/WAF/CloudFront, S3 storage/requests/transfer, SQS/EventBridge/Scheduler, SES, CloudWatch/CloudTrail, KMS/Secrets Manager, vault copies, sandbox data stores and LLM tokens. Provide idle, one/four/twelve drives and burst/high-retry models. The LLM estimate differs between drafts; measure real token/provider usage.

## 14. Service extraction waves and exit gates

### Wave 0 — Baseline, contracts and prerequisites; no extraction

Tasks:

- Recheck branch/status and reproduce build/test results.
- Add characterization tests for session begin, billing, answer persistence, payment webhook idempotency and score provenance.
- Freeze the Billing lifecycle contract and model.
- Map all 41 Prisma models, cross-domain relations, cross-domain transactions, stored functions, event listeners, cron jobs and queues.
- Add protobuf contracts and generated mocks for Billing and Execution; agree error/timeout/idempotency behavior.
- Decide event schemas/outbox/inbox patterns; keep raw high-volume telemetry off EventBridge.
- Audit frontend auth storage/refresh and complete the Admin SPA migration design.
- Create a safe 250/500/1,000/2,000 load-test plan and prepare cost inputs.

Exit: P0 invariants/security blockers are fixed/tested; contracts reviewed; current monolith remains deployable; no changes route production traffic to new services.

### Wave 1 — Billing seam and Execution isolation

- Refactor `billing_begin()` into Billing-owned reservation state transitions; remove session table updates/reads from Billing procedure.
- Move `SessionService.beginSession` state transitions into Runtime code.
- Add idempotency and safe timeout/reconciliation behavior.
- Extract `Judge0Service`/Piston and SQL/NoSQL runner adapters behind private Execution API. Fix hidden test path first and deny scoring bucket read to Runtime.
- Build isolated EC2 sandbox AMI/runner, resource limits, no-egress tests, Spot interruption/run retry and no host fallback.

Exit: 1,000 simulated session-start attempts pass with no unexplained credit discrepancy; code runs work only via Execution API; sandbox boundaries are test-proven.

### Wave 2 — Candidate Runtime

- Extract Candidate/Session/Assessment and candidate delivery modules.
- Replace direct Hiring/Drive joins with versioned invite projection and immutable drive/content snapshot.
- Add outbox-backed session events and durable submit bundle.
- Move heartbeats to Valkey only after loss semantics are tested; keep accepted answers durable.
- Ensure timer is server-authoritative and WebSocket reconnect replays state.

Exit: 500-VU path passes; accepted answer checkpoints survive Runtime task/Valkey interruption in defined tests; Runtime operates with Hiring/Content temporarily unavailable after projections exist.

### Wave 3 — Biometric and Grading

- Implement presigned evidence upload and evidence metadata lifecycle.
- Extract Biometric role/key/permissions.
- Move AI evaluation/score work into SQS-driven Grading Worker; add retry/DLQ/replay and scoring provenance contracts.

Exit: 200 concurrent evidence uploads do not buffer full videos in Runtime/Staff process memory; interrupted grading job is retried exactly once in business effect; placeholder Say-Do score is blocked from reports/export.

### Wave 4 — Control Plane runtime roles and commercial self-service

- Create separate Staff/Partner/Platform composition roots and ECS task roles.
- Implement dynamic price-book, self-service signup, payment capture → credit grant, account/credit controls and audit history.
- Complete SES delivery/retry/bounce/complaint tracking.
- Convert Admin Web to static Vite SPA and add Super Admin deployment pipeline.
- Build Platform health/status view independent of Runtime/Staff and test incident visibility.

Exit: standard customer purchase needs no human credit activation; platform and partner endpoints cannot access each other's privileged data; all overrides/price changes are audited; email delivery failures are observable.

### Wave 5 — Production hardening

- Run the 2,000-active-candidate test for 45 minutes with complete flows.
- Run 2,500-VU stress test and prove graceful degradation.
- Test task kill, AZ/service health loss, queue duplicates/reordering, SQS DLQ redrive, payment replay, Valkey failure, DB failover and restore.
- Recalculate cost based on observed traffic and approve budget.

Exit: approved availability/error/latency/data-loss metrics passed; recovery drill achieves approved RPO/RTO; platform can diagnose candidate/admin failures; cost ceiling is signed off.

### Optional Wave 6 — Extract individual Control Plane domains

Extract IAM, Hiring, Content or Insights only if measured scaling, release coupling, security policy or independent recovery requires it. Each extraction needs its own ADR, DB ownership/cutover plan, contracts, alarms and rollback.

## 15. Rollback and cutover principles

- Preserve the monolith's deployability until each cutover is accepted.
- Use expand/contract DB changes; do not require a synchronized rollback of multiple services.
- Route one operation at a time to a new service; never dual-write authoritative Billing state without an idempotent shadow comparison design.
- For Billing migration, compare resulting reservations/ledger state in shadow mode before enforcing the new path, then reconcile nightly.
- Do not retain vulnerable old endpoints/fallbacks after migration without a reviewed exception and sunset date.
- Keep a rollback flag only while both paths are well defined and safe. Never let `monolith_proc` and `grpc_saga` charge the same session independently.

## 16. Operational metrics required in code

- Every request/job carries correlation/trace ID and service/version.
- Candidate: active WebSockets, session start duration, heartbeat age, autosave durable-ack latency, submission durability latency.
- Billing: reservation result/age, ledger lock waits, idempotency hits/conflicts, payment webhook lag, reconcile discrepancies.
- Execution: queue wait, active slots, run durations, timeouts, sandbox healthy hosts, denied-egress test result and interruption retries.
- Biometric: ticket issuance/upload completion/inference latency and retention-purge backlog.
- Grading: queue visible/in-flight/oldest age, job duration, retry counts, DLQ count, LLM tokens/cost and provenance failures.
- Control Plane: 4xx/5xx, auth failures, tenant-scope denials, platform actions and partner throttling.
- S3/telemetry: request/object count, raw/compressed bytes, chunk count, ack/resend window and purge confirmations.

CloudWatch/log retention/ADOT/X-Ray choice is deployment-owned after cost review; correlation IDs and minimum metrics are engineering requirements regardless.

## 17. Developer versus deployment responsibilities

### Engineering owns

- Business invariants, service boundaries, DB/model ownership, contracts and data semantics.
- JWT trust domains, service-level authorization and private RPC requirements.
- Outbox/inbox, idempotency, retries, DLQs and error handling.
- Sandbox request/run safety and hidden-test concealment.
- Frontend static SPA compatibility tests and email flow requirements.
- Load scripts, measured traffic inputs, application-level scaling signals, service SLOs and recovery test cases.

### Deployment/platform team owns

- Exact AWS account structure, region, VPC/CIDR/subnets, NAT/endpoints and DNS/certificate configuration.
- ECS/EC2 exact resource types, autoscaling implementation, capacity/quota and Spot percentage.
- Aurora actual writer/reader configuration, ACU/provisioned decision, Valkey mode and service discovery.
- S3/KMS/bucket policy implementation, cross-account backup vault and Object Lock.
- AWS CDK/pipeline roles/permissions, alarms, production access and final AWS Pricing Calculator results.

### Joint

- Platform recovery priority versus shared-restricted-cluster risk.
- Approved SLOs, RPO/RTO, biometric/legal retention, key rotation recovery, service cutover and the final cost ceiling.

## 18. The next engineering task

Do not begin the service extraction yet. The next code task is the Billing characterization/state-machine task:

1. Add/verify tests around the current `SessionService.beginSession`, `LedgerService.claimSessionCredit` and `billing.billing_begin()` effects.
2. Define the `ReserveCredit`, chargeable milestone, `ConsumeCredit` and `ReleaseCredit` contract, including idempotency keys and timeout/late-event behavior.
3. Refactor the stored procedure to update only Billing-owned records; move `session.status = IN_PROGRESS` and `started_at` changes into Candidate Runtime after successful reservation.
4. Ensure consume occurs only at the approved first-real-question milestone, not merely when the candidate clicks Begin.
5. Add duplicate/concurrent begin, timeout-after-commit, Billing-outage, question-delivery-failure and reservation-expiry-race tests.
6. Have a reviewer approve the state machine and contracts before moving runner code into a separate process.

This is a prerequisite implementation task, not yet the microservices split itself.

## Appendix A — Coding-agent prompts

### Prompt A: Billing invariant/state-machine tests

> Read-only first: inspect `billing.billing_begin()`, `SessionService.beginSession`, `LedgerService.claimSessionCredit`, triggers and related tests. Return a source-cited sequence diagram and state-transition table. Identify all writes/reads across session/organization/drive/credit pool/ledger. Do not modify code until asked. Then propose characterization tests for duplicate begin, concurrent calls, timeout after commit, payment/credit edge cases, failure to render the first question, and release/expiry race. The target invariant is reservation before timer and consumption only after verified presence plus the first real question delivery/ack milestone. Never assume clicking Begin is chargeable.

### Prompt B: Hidden-test security boundary

> Inspect every code/SQL/NoSQL execution path, DTO, response, snapshot parser and S3 permission in the current monolith. Report whether Candidate Runtime can read hidden tests, expected outputs, answer keys or rubrics. Find all access locations and source lines. Propose an API contract where Runtime calls private Execution API with a snapshot ID and sample inputs, and Grading Worker alone can request hidden-test execution. Do not edit files. Include security regression tests for API response leakage, logs, error messages and bundle contents.

### Prompt C: Durable autosave and telemetry

> Inspect actual browser event producers and backend consumers. Separate heartbeat, autosave answers, proctoring anomaly flags, raw interaction telemetry, submission bundle and operational logs. For each, report observed cadence, payload size, retries, sequence/idempotency, acknowledgement point and authoritative store. Do not assume a general edit/focus/paste stream exists unless you find code. Calculate 2,000-candidate rates and S3 object count by formulas. Flag any design that acknowledges answer data while only held in Valkey. Propose bounded loss/recovery semantics; no modifications.

### Prompt D: Build the service-specific NestJS composition roots

> After approval, propose `candidate-runtime`, `execution-api`, `billing-api`, `biometric-api`, `grading-worker`, `staff-api`, `partner-api` and `platform-api` bootstraps. For each, list allowed modules/controllers/providers, config schema, database credentials, S3 prefixes, queues, gRPC clients/listeners and task-role permissions. Ensure Staff/Partner/Platform do not all start the complete AppModule. Do not start implementation until the service boundary contract is reviewed.

### Prompt E: 2,000-candidate capacity run

> Inspect current k6 scripts, browser heartbeat/autosave code and execution workload. Build a test model for 250/500/1,000/2,000 active users and 2,500 stress users, with formulas for start distribution, heartbeat/autosave, code-run concurrency, anomaly events, direct photo/video S3 uploads, final submission burst and retries. Use measured code values where available, label all assumptions, and create a read-only proposed k6 scenario matrix. Do not run tests against production or provision resources.

## 19. Final implementation rule

**The current milestone is prerequisite remediation and proof, not service extraction.** Only after Billing correctness, hidden-test protection, durable answers, private Execution routing, service contracts, and required Wave 0 gates pass should the team move the first module into a separately deployed service. This prevents an expensive distributed monolith from inheriting the exact same coupling as the current application.

---

# Addendum A — Engineering Requirements: Multi-Tenant Admission, Ceilings, Fallbacks and Failover

**Added in version 4.0 on 13 October 2026.** This section is additive; the original v3 file is preserved unchanged. The formal contract is recorded in `CD-Recruit_Microservices_Architecture_Specification_v0.2.md`.

## A1. Capacity must be counted globally and per tenant

The capacity unit is **one concurrently admitted assessment attempt/session**, not one invitation, unique email address, tenant, or drive. Aggregate every tenant and drive sharing the same production capacity pool. A candidate waiting to start does not consume an active session; a started attempt does. A distinct assignment that is active at the same time consumes another slot unless product policy forbids overlapping attempts. Duplicate tabs for the same assignment must reuse the session or be rejected idempotently.

Maintain and enforce these separate dimensions:

- Platform-wide safe admission ceiling.
- Per-tenant concurrent-session quota.
- Per-drive concurrent-session allocation and scheduled reservation window.
- Per-tenant rate budgets for APIs, WebSockets, execution jobs and evidence uploads.

The effective global ceiling must be `min(configured launch ceiling, highest load-tested safe tier, temporary operator safety ceiling)`. Proposed rollout: 1,000, 1,500, then 2,000 active sessions after each tier's acceptance gates pass. The current audit provides no proof that any tier is production-safe.

## A2. Required implementation model

**No ninth service is required.** Implement an explicit Capacity/Admission module and private contract inside Candidate Runtime; Runtime owns the authoritative admission lease ledger in its own logical database. Platform settings are applied to Runtime through a private, versioned command/contract—not by allowing Runtime to query Platform/Billing tables directly. Staff/drive scheduling must request a drive-capacity reservation through a private contract; it must not bypass Runtime's admission authority.

Proposed records (names are conceptual and can be revised in code review):

- `capacity_policy`: policy version, effective global ceiling, configured rollout tier and update/audit metadata.
- `tenant_capacity_policy`: tenant ID, approved concurrent quota and relevant per-tenant guardrails.
- `drive_capacity_reservation`: tenant ID, drive ID, start/end window, reserved concurrency, status and policy version.
- `capacity_lease`: unique lease/session/attempt IDs, tenant/drive/assignment IDs, state, allocated time, reconnect grace, release reason and idempotency key.

Tenant/drive reservations must not exceed the sum of bookable capacity in overlapping time windows. Live lease allocation must be atomic across all Runtime replicas and count global, tenant and drive usage in the same authoritative decision. Use a transactionally guarded allocation/counter or slot-claim scheme and index the ownership/time dimensions. Benchmark contention from a large simultaneous start storm; do not use one naive global row lock if it becomes a hotspot. Exact schema and transaction algorithm are a code-review decision, but **eventual-only counters or Valkey-only enforcement are prohibited**.

Admission state flow:

1. Validate invitation/token and resolve tenant, drive, assignment and candidate attempt from trusted server-side data.
2. Check drive status/window and whether the same attempt already has a valid session.
3. Atomically acquire a short-lived pending/admission lease only if global, tenant, drive and technical-safety limits permit it.
4. Reserve credit with Billing using a stable idempotency key. If reservation is unavailable or outcome is ambiguous, hold admission and reconcile with the same key; do not start the timer.
5. Activate the session only after successful admission prerequisites. Consume the credit exactly once at the established chargeable milestone: verified candidate presence plus the first real question rendered/acknowledged.
6. Release or expire pending leases through idempotent, audited state transitions. On a missed heartbeat, retain the slot through the approved reconnect grace; do not release solely because a Valkey TTL disappeared.
7. Release the active slot when a durable terminal transition is confirmed. A reconciliation job repairs orphaned/stale leases from durable session state.

If capacity is full, return a typed `CAPACITY_FULL`/retryable admission outcome with a bounded waiting-room token and recommended retry delay. Never queue unbounded start requests inside an ECS process. The client timer must not start while waiting; no credit is consumed. Enforce fair admission across tenants and honour scheduled reservations to prevent a large tenant from monopolising all slots.

## A3. Tenant isolation security requirements

- Bind every assessment token/session, capacity lease, reservation, event, S3 object namespace, cache key, job and report to tenant, drive and attempt identifiers.
- Derive tenant context from verified credentials/invitation records and authorization checks; never accept a body/query `tenant_id` as authority on its own.
- Make same-tenant/drive/attempt checks explicit in every service. Partner API credentials are tenant-bound and permission-scoped.
- Ensure background consumers revalidate tenant ownership from durable event/record identifiers, and deduplicate by event/job idempotency key.
- Do not use email equality alone to merge/link identities between tenants. Decide separately whether one natural person may hold overlapping sessions in different tenant assignments; capacity counts each active attempt unless product policy explicitly blocks it.
- Include cross-tenant access tests for direct IDs, guessed URLs, cache-key collisions, report exports, queue payloads, support impersonation and platform break-glass operations.

## A4. Fallback/failover matrix

| Fault | Required implementation behaviour/test |
|---|---|
| ECS task/AZ loss | Deploy at least required healthy replicas across AZs; session reconnects from durable state; lease survives task loss. |
| Runtime DB unavailable or quota cannot be verified | Fail closed for **new** admission; do not over-admit using per-task memory/Valkey. Existing session policy follows durable-write rules. |
| Billing timeout/outage | No timer/admission until credit reservation outcome is confirmed; repeat status/retry with same idempotency key; reconcile unknown outcomes. |
| Answer/autosave store unavailable | Do not ACK a non-durable answer. UI reports save/connection state; client sequence IDs permit safe retry. Product must explicitly approve infrastructure-fault timer/pause semantics. |
| Execution queue/pool saturated | Bounded queue, per-tenant execution quotas, visible retryable job status; no local/host execution fallback. Preserve submitted job IDs and idempotency. |
| Biometric dependency down | Hold as identity pending if verification is mandatory; do not silently bypass. A manual-review exception requires product/security approval and audit. |
| Valkey lost/evicted | Rebuild transient state from the durable source; slow/degraded mode is acceptable; answers, credit ledger and global admission correctness remain durable elsewhere. |
| SQS/EventBridge lag/duplication | Outbox/inbox, idempotent consumers, bounded retries, DLQ alarms and safe redrive; no lost or duplicate billing/grading effect. |
| S3 evidence upload failure | Retry presigned upload; verify object/checksum before final evidence acknowledgement. |
| Aurora failover/connection loss | Bounded retry, pool refresh, jitter, idempotent mutations. New admissions stop until quota authority is available. |
| SES/payment integration failure | Notifications retry through queue/DLQ. Payment remains pending until signed webhook/status reconciliation; browser redirect alone never grants credits. |
| Region loss | Restore with IaC/backups. Do not claim active-active multi-region; verify recovery objective through drills. |

No fallback may reveal hidden tests, bypass tenant authorization, debit credits twice, acknowledge data that exists only in memory/cache, or silently lower identity/scoring/security requirements.

## A5. Changes needed before service extraction/capacity sign-off

Add to the prerequisite gates:

- Capacity policy schema/API and approved ownership boundary reviewed.
- Atomic global + tenant + drive allocation tests pass with parallel starts across multiple Runtime tasks.
- Drive schedule reservation prevents overlapping commitments from exceeding bookable global capacity.
- Policy version propagation/acknowledgement is tested; a limit change is not shown as active until Runtime confirms it.
- Duplicate redemption/tab/concurrent-start, pending-lease expiry, Billing timeout-after-commit and reconnect-grace races are characterized.
- Tenant isolation tests cover all eight service roles, S3, caches, reports and async consumers.
- Admission closes safely when authoritative quota storage fails; existing-session recovery follows explicit durability/timer policy.
- Fairness/noisy-neighbour tests prove one tenant cannot consume all unreserved capacity.
- Test matrix covers 1,000, 1,500, 2,000, 2,500 stress, cross-tenant mixes, synchronized start/submit bursts and selected dependency failures.
- Deployment and finance approve a regional calculator delta for each enabled tier; no figure is inferred by linear scaling alone.

**Release rule:** the enabled admission ceiling is the last tier that passes the full end-to-end and failure tests. Higher requested capacity triggers a reviewed scale-up/test/cost process, not an automatic increase. If the configured ceiling is lowered during a live drive, never evict active sessions; reject/waitlist new starts until the count is below the new value.

