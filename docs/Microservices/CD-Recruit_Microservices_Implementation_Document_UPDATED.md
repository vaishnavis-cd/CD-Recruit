# CD-Recruit — Microservices Implementation Document

> **Purpose:** Companion implementation document for the CD-Recruit microservices architecture and migration plan.
>
> **Source of truth:** `CD-Recruit_Microservices_Migration_Architecture_and_Plan_UPDATED.md`
>
> **Scope:** Turn the confirmed architecture into an implementation sequence for the existing monorepo, including the **emailing implementation inside `hiring-service`**.
>
> **Important:** This document does **not** replace the architecture document. It does not introduce a new service boundary or change the selected protocols, data ownership rules, AWS topology, migration waves, or locked principles. It only turns them into implementation work and makes the email implementation explicit.

---

## 0. Implementation Rules

The architecture remains the source of truth. Implementation must follow these rules:

1. **No big-bang rewrite.** Use the strangler-fig migration. The monolith remains operational until a replacement is proven.
2. **Contracts first.** `.proto` files and Zod event/command schemas merge before implementation.
3. **One owner per directory.** Do not allow two agents to edit the same service directory during the same task window.
4. **One file per commit for extraction work.** This keeps AI-agent changes reviewable and reversible.
5. **No cross-service database access.** A UUID reference, API call, event, or S3 claim-check replaces a Prisma relation that crosses a boundary.
6. **No cross-service domain imports.** `@cd-recruit/contracts` is the only legal cross-service package.
7. **No candidate-facing dependency on IAM, billing, hiring, or email.**
8. **No live LLM generation in `runtime-service`.** LLM invocation remains in `grading-service`.
9. **No host-execution fallback.** Candidate code reaches execution only through `execution-service`.
10. **Email is asynchronous.** Email delivery must never block a drive, invite, session begin, submit, grading, or reviewer action.
11. **Existing `INFRA_MODE=local|full` stays unchanged.**
12. **Destructive changes require explicit sign-off.** Quarantine before deletion.

---

# 1. Target Runtime Shape

The implementation must produce these ten service applications without changing their boundaries:

| # | Service | Primary responsibility | Runtime |
|---|---|---|---|
| 1 | `runtime-service` | Candidate session lifecycle, delivery, autosave, telemetry, WebSocket, submission bundle | ECS Fargate |
| 2 | `execution-service` | Piston code execution, SQL, NoSQL sandbox execution | Fargate API + EC2 sandbox |
| 3 | `integrity-service` | Proctoring signals, correlation, flags, integrity scoring | ECS Fargate |
| 4 | `biometric-service` | Face verification, selfie/ID, evidence tickets, evidence lifecycle | ECS Fargate |
| 5 | `grading-service` | Async grading, rubrics, Say-Do, AI confidence | ECS Fargate |
| 6 | `billing-service` | Credits, ledger, pools, payments, reconciliation | ECS Fargate |
| 7 | `hiring-service` | Drives, invites, roster, partner API, scheduling, **email worker** | ECS Fargate |
| 8 | `content-service` | Questions, role templates, scenario templates, snapshots | ECS Fargate |
| 9 | `iam-service` | Staff identity, roles, organizations, settings, platform control plane | ECS Fargate |
| 10 | `insights-service` | Read models, dashboards, reports, reviewer decisions, ATS export | ECS Fargate |

Email is **inside hiring-service**. It is not `email-service`, `notification-service`, or service #11.

---

# 2. Repository Implementation

## 2.1 Monorepo structure

Keep the monorepo and add the target application layout:

```text
cd-recruit/
├─ apps/
│  ├─ monolith/
│  ├─ local-all-in-one/
│  ├─ runtime-service/
│  ├─ execution-service/
│  ├─ integrity-service/
│  ├─ biometric-service/
│  ├─ grading-service/
│  ├─ billing-service/
│  ├─ hiring-service/
│  ├─ content-service/
│  ├─ iam-service/
│  ├─ insights-service/
│  ├─ admin-web/
│  ├─ candidate-web/
│  └─ platform-web/
│
├─ libs/
│  ├─ contracts/
│  │  ├─ proto/
│  │  ├─ events/
│  │  ├─ commands/
│  │  ├─ manifests/
│  │  ├─ generated/
│  │  └─ mocks/
│  ├─ kit-config/
│  ├─ kit-logging/
│  ├─ kit-otel/
│  ├─ kit-health/
│  ├─ kit-auth/
│  ├─ kit-messaging/
│  ├─ kit-storage/
│  ├─ kit-llm/
│  ├─ kit-cache/
│  └─ kit-db/
│
├─ infra/
│  └─ lib/
│     ├─ network/
│     ├─ data/
│     ├─ messaging/
│     ├─ edge/
│     ├─ identity/
│     ├─ sandbox/
│     ├─ observability/
│     └─ services/
│
├─ tools/
├─ docs/
└─ docker-compose.yml
```

Do not add an `apps/email-service`.

## 2.2 Nx boundaries

Required tags:

```text
type:app
type:lib
scope:runtime
scope:execution
scope:integrity
scope:biometric
scope:grading
scope:billing
scope:hiring
scope:content
scope:iam
scope:insights
scope:contracts
scope:kit
```

Rules:

```text
service app -> own scope
service app -> contracts
service app -> approved kit/*
service app -X-> another service app
kit/* -X-> domain scope
contracts -X-> domain business logic
```

---

# 3. Global Contracts First

Before extracting any service, create and review:

```text
libs/contracts/
├─ proto/
│  ├─ billing.proto
│  ├─ execution.proto
│  ├─ biometric.proto
│  ├─ hiring.proto
│  └─ insights.proto
├─ events/
│  ├─ iam/
│  ├─ content/
│  ├─ hiring/
│  ├─ runtime/
│  ├─ integrity/
│  ├─ biometric/
│  ├─ grading/
│  └─ billing/
├─ commands/
│  ├─ grading-run.v1.ts
│  ├─ email-send.v1.ts
│  └─ webhook-deliver.v1.ts
└─ manifests/
   ├─ routes.ts
   └─ subscriptions.ts
```

## 3.1 Required contract checks

CI must fail when:

- a protobuf breaking change is introduced without `v2`;
- a Zod contract changes incompatibly without versioning;
- an app imports another service;
- a domain type enters `kit-*`;
- an event omits `tenantid`;
- an event exceeds the size rule;
- an event or command contains prohibited PII;
- an unapproved route is added.

---

# 4. Wave 0 — Foundations and In-Place Hardening

Wave 0 must happen before service extraction.

## 4.1 Read-only audit

Perform the complete Appendix D audit from the architecture document:

- module × Prisma model usage;
- cross-domain `include` / `select`;
- raw SQL;
- triggers and functions;
- cross-module transactions;
- `EventEmitter2`;
- scheduled work;
- singletons and in-memory state;
- WebSocket gateways;
- BullMQ queues;
- environment variables and secrets;
- outbound providers;
- local filesystem;
- all writers of `session.status`;
- auth/role checks;
- cross-boundary types;
- test coverage;
- unresolved `[VERIFY]` items;
- face-model license;
- NoSQL engine license.

No destructive changes are made during the audit.

## 4.2 Database split preparation

Create one schema directory per future service:

```text
database/
├─ runtime/
├─ execution/
├─ integrity/
├─ biometric/
├─ grading/
├─ billing/
├─ hiring/
├─ content/
├─ iam/
└─ insights/
```

During preparation:

- identify every cross-domain Prisma relation;
- replace the relation with a UUID reference plus the required projection/snapshot;
- retain indexes for every new UUID lookup;
- remove cross-domain writes;
- move domain-specific transactions into the future owning service.

## 4.3 Platform foundations

Implement:

- CDK `NetworkStack`;
- ECR repositories;
- ECS cluster/service baseline;
- ALB;
- Aurora clusters;
- Valkey;
- S3;
- KMS;
- Secrets Manager;
- SSM Parameter Store;
- EventBridge;
- SQS + DLQs;
- Scheduler;
- API Gateway;
- CloudWatch;
- OTel/ADOT;
- baseline IAM task roles.

## 4.4 Unchanged monolith staging

Before extraction:

```text
monolith image
    ↓
ECR
    ↓
ECS Fargate
    ↓
ALB
    ↓
Aurora
```

The synthetic drive must succeed before Wave 1.

---

# 5. Wave 1 — Execution and Billing

## 5.1 Execution implementation

Create:

```text
apps/execution-service/
├─ src/
│  ├─ code/
│  ├─ sql/
│  ├─ nosql/
│  ├─ piston/
│  ├─ sandbox/
│  ├─ queue/
│  └─ main.ts
├─ Dockerfile
└─ prisma/
```

Implement:

- `RunCode`;
- `RunSql`;
- `RunNosql`;
- admission control;
- execution timeout;
- queue wait tracking;
- candidate-safe result projection;
- S3 snapshot access;
- sandbox DB isolation;
- Piston only through the execution boundary.

EC2 sandbox requirements remain unchanged:

- isolated subnets;
- no NAT;
- deny-all egress;
- no useful instance role;
- IMDSv2;
- read-only root;
- tmpfs;
- CPU/memory/time/pids/file limits;
- runtimes baked into the image;
- no runtime downloads;
- no host-execution fallback.

## 5.2 Billing implementation

Freeze `billing.proto` before more billing implementation lands.

Required RPC:

```proto
service BillingAcquisition {
  rpc Acquire(AcquireRequest) returns (AcquireResponse);
}
```

Required transaction remains local to billing:

```text
lock credit pool
    ↓
check balance / fallthrough
    ↓
create idempotent ledger entry
    ↓
decrement pool
    ↓
commit
```

Billing must never write:

```text
runtime.session
hiring.drive
iam.organization
```

Billing receives the required inputs over the RPC.

## 5.3 Billing shadow mode

The monolith calls the new billing adapter:

```text
monolith
   ↓
BillingPort
   ↓
in-process adapter
   ↓
billing shadow logic
```

Validate:

- acquisition result;
- ledger entry;
- pool balance;
- reversals;
- reconciliation;
- idempotency;
- failure behavior.

Do not switch enforcement until the agreed verification gate passes.

---

# 6. Wave 2 — Runtime, Integrity and Biometric

## 6.1 Runtime service

Move:

- session creation;
- invite projection;
- time-gate;
- begin flow;
- MCQ delivery;
- AI Prompting delivery;
- Simulation delivery;
- autosave;
- telemetry ingestion;
- WebSocket;
- submit;
- submission bundle creation.

Runtime must be able to operate when:

```text
hiring down
content down
insights down
grading down
```

The critical candidate path remains:

```text
Candidate
   ↓
runtime
   ↓
billing Acquire
   ↓
local session transition
```

## 6.2 Integrity service

Move:

- proctoring signal ingestion;
- signal correlation;
- integrity flags;
- confidence;
- disposition handling.

Do not allow integrity to update runtime session state.

The only session reference is a UUID.

## 6.3 Biometric service

Move:

- ONNX face verification;
- selfie/ID references;
- evidence upload tickets;
- reviewer signed URLs;
- purge;
- biometric metadata.

Evidence flow:

```text
Browser
   ↓
presigned upload ticket
   ↓
S3 biometric
   ↓
biometric service
   ↓
evidence.stored
```

The clip must not pass through the main API as an uploaded application payload.

---

# 7. Wave 3 — Grading and Insights

## 7.1 Grading

Move:

- deterministic module scoring;
- rubric scoring;
- AI confidence;
- Say-Do Correlation Engine;
- composite scoring;
- grading run persistence;
- provenance.

Trigger:

```text
runtime.session.submitted
        ↓
grading.run FIFO
        ↓
grading-service
        ↓
grading.score.completed
```

The `PLACEHOLDER` provenance rule remains mandatory.

## 7.2 Insights

Build event-driven read models:

```text
report_view
funnel counters
score distributions
time per module
integrity counts
reviewer agreement
Needs Review
dashboard aggregates
```

No direct reporting joins against another service database.

---

# 8. Wave 4 — Control Plane

Extract only when the existing triggers in §13 fire:

```text
iam
hiring
content
insights
```

Hiring extraction includes the email worker described in §9.

When extracted:

```text
monolith hiring module
       ↓
hiring-service
       ├─ drive
       ├─ candidate roster
       ├─ invite
       ├─ partner API
       ├─ scheduler
       └─ email worker
```

Do not create a separate notification application.

---

# 9. Emailing Implementation — Confirmed

## 9.1 Architecture

The confirmed email path is:

```text
Business action
     ↓
hiring-service
     ↓
Outbox
     ↓
email.send SQS queue
     ↓
Hiring Email Worker
     ↓
Email provider adapter
     ↓
Amazon SES
```

Local:

```text
hiring-service
     ↓
email.send
     ↓
Email Worker
     ↓
Mailpit
```

Email is outside the candidate critical path.

## 9.2 What sends an email

The implementation covers the email use cases already represented in the architecture:

| Use case | Trigger | Recipient data source | Delivery |
|---|---|---|---|
| Assessment invite | Invite is created/upserted | Hiring candidate/roster store | `email.send` → SES |
| Invite reminder | Scheduled reminder | Hiring candidate/roster store | `email.send` → SES |
| Candidate notice after decision | `insights.decision.made` consumed by hiring | Hiring candidate/roster store | `email.send` → SES |

When the ATS partner owns the candidate-facing message for a specific partner flow **[LOCKED]**, do not send a second message from CD-Recruit.

## 9.3 Email command contract

Use the versioned command defined in the architecture:

```ts
export const EmailSendV1 = z.object({
  commandId: z.string().uuid(),
  templateKey: z.string(),
  templateVersion: z.string(),
  candidateId: z.string().uuid(),
  entityId: z.string().uuid().nullable(),
  correlationId: z.string(),
  idempotencyKey: z.string(),
});
```

The command must not contain:

- raw candidate email;
- message body;
- unrelated candidate PII.

The worker resolves recipient data from hiring-owned storage.

## 9.4 Email queue

Create:

```text
cdr-<env>-hiring-email-send
cdr-<env>-hiring-email-send-dlq
```

Properties:

- SQS Standard;
- at-least-once delivery;
- visibility timeout greater than the normal send operation;
- bounded retry;
- `maxReceiveCount = 5` unless load testing proves a different value is required;
- DLQ alarm;
- queue-age alarm.

FIFO is not required unless ordering becomes a business requirement.

## 9.5 Email worker

Recommended structure:

```text
apps/hiring-service/src/email/
├─ email.module.ts
├─ email.port.ts
├─ email.worker.ts
├─ email.consumer.ts
├─ email.renderer.ts
├─ email.repository.ts
├─ email.types.ts
├─ adapters/
│  ├─ ses-email.adapter.ts
│  ├─ mailpit-email.adapter.ts
│  └─ mock-email.adapter.ts
└─ templates/
   ├─ assessment-invite/
   ├─ assessment-reminder/
   └─ candidate-notice/
```

Responsibilities:

### `email.consumer.ts`

- receives SQS message;
- validates `EmailSendV1`;
- starts tracing context;
- passes the command to the worker;
- acknowledges only after successful handling or terminal classification.

### `email.worker.ts`

- checks idempotency;
- loads candidate recipient;
- loads the selected template version;
- builds subject/body;
- applies sender/reply-to configuration;
- invokes the `EmailPort`;
- records delivery state;
- emits operational telemetry.

### `email.renderer.ts`

- renders HTML;
- renders text fallback;
- applies template version;
- does not query another service.

### `email.port.ts`

Keep the provider interface inside hiring:

```ts
export interface EmailPort {
  send(input: {
    to: string;
    subject: string;
    html: string;
    text: string;
    replyTo?: string;
  }): Promise<{
    providerMessageId?: string;
  }>;
}
```

No cross-service email library is required.

## 9.6 Email delivery record

The worker should retain an internal delivery record in the hiring-owned database.

Recommended fields:

```text
id
command_id
idempotency_key
candidate_id
entity_id
template_key
template_version
status
attempt_count
last_error_code
last_error_message
provider_message_id
queued_at
sent_at
failed_at
created_at
updated_at
```

The exact persistence model remains inside hiring and must not become a cross-service schema.

Recommended statuses:

```text
QUEUED
PROCESSING
SENT
RETRYABLE_FAILURE
PERMANENT_FAILURE
DEAD_LETTER
SKIPPED_PARTNER_OWNED
```

## 9.7 Idempotency

Use the architecture's deterministic key:

```text
email:{purpose}:{entityId}:{candidateId}:{templateVersion}
```

Before sending:

```text
idempotency key exists + SENT
        → acknowledge duplicate
```

Do not claim exactly-once external email delivery. The system guarantees durable intent and duplicate suppression at the application boundary, while the provider boundary remains at-least-once.

## 9.8 Retry behavior

Retry:

- transient network failures;
- provider throttling;
- temporary AWS errors;
- temporary dependency failures.

Do not retry forever:

- invalid recipient;
- invalid template;
- failed contract validation;
- malformed command.

Permanent failures:

```text
worker
  ↓
record permanent failure
  ↓
DLQ / operator action
```

The candidate session must not be affected.

## 9.9 SES adapter

Production adapter:

```text
@aws-sdk/client-sesv2
```

Configuration:

```text
AWS_REGION
EMAIL_FROM
EMAIL_REPLY_TO
EMAIL_DRIVER=ses
```

Provision before production:

- SES domain identity;
- DKIM;
- SPF;
- DMARC;
- SES production access;
- IAM permission restricted to send operations.

The hiring task role must not receive unrelated AWS permissions.

## 9.10 Local adapter

Local:

```text
EMAIL_DRIVER=mailpit
MAILPIT_HOST=localhost
MAILPIT_PORT=1025
```

Developer flow:

```text
Invite created
   ↓
email.send
   ↓
Mailpit
   ↓
developer opens Mailpit UI
```

No real candidate email is sent from local development.

## 9.11 Email template rules

Templates must be:

- versioned;
- deterministic;
- reviewable;
- tested;
- free of provider logic;
- free of database queries;
- safe for HTML escaping.

Every template should have:

```text
template-key
version
subject
html
text
required variables
optional variables
```

Example:

```text
assessment-invite/v1
assessment-reminder/v1
candidate-notice/v1
```

A template change creates a new version rather than silently changing an existing delivery intent.

## 9.12 Email security

Never place in logs:

- full recipient address;
- message body;
- candidate resume data;
- session answers;
- evidence references that reveal sensitive content.

Log only:

```text
templateKey
templateVersion
candidateId hash/reference
commandId
correlationId
providerMessageId
status
latency
error class
```

---

# 10. Email Failure Handling

| Failure | Candidate | Recruiter | System action |
|---|---|---|---|
| SES unavailable | Unaffected | Email pending | SQS retry |
| Temporary AWS throttling | Unaffected | Email delayed | Retry with backoff |
| Invalid email | Unaffected | Delivery failure visible | Permanent failure + DLQ/operator action |
| Worker restart | Unaffected | Email may be delayed | SQS redelivery + idempotency |
| Hiring service restart | Unaffected | Email may be delayed | Outbox + SQS |
| SQS outage | Unaffected | Email intent retained by outbox until relay succeeds | Outbox retry |
| Duplicate SQS delivery | Unaffected | One intended delivery | Idempotency check |
| Template deployment error | Unaffected | Message fails validation | Permanent failure + DLQ |
| ATS owns email | Unaffected | Partner handles candidate email | `SKIPPED_PARTNER_OWNED` |

Email must never be treated like billing. A failed email is not a failed drive.

---

# 11. Email Observability

Required metrics:

```text
email_queue_age_seconds
email_messages_received_total
email_messages_sent_total
email_messages_failed_total
email_messages_dlq_total
email_send_latency_ms
email_retry_total
email_provider_error_total
email_template_render_error_total
```

Required logs:

```text
service=hiring
component=email-worker
correlationId
commandId
templateKey
templateVersion
status
providerMessageId
latency
```

Required alarms:

- DLQ > 0;
- queue age above the agreed threshold;
- sustained send failures;
- sustained provider throttling;
- worker not consuming;
- outbox lag above the common 30-second warning.

---

# 12. Email Testing Plan

## 12.1 Unit

Test:

- template rendering;
- HTML escaping;
- text fallback;
- template-version selection;
- invalid variables;
- idempotency key generation;
- partner-owned skip logic;
- SES adapter mapping;
- Mailpit adapter.

## 12.2 Consumer/contract

Validate every `EmailSendV1` command against the Zod contract.

Cases:

```text
valid
missing candidateId
invalid templateVersion
missing idempotencyKey
unknown template
duplicate command
```

## 12.3 Integration

Run:

```text
invite transaction
    ↓
outbox
    ↓
SQS
    ↓
worker
    ↓
Mailpit
    ↓
assert rendered message
```

This test is mandatory in CI.

## 12.4 Failure tests

Inject:

```text
SES timeout
SES throttling
network failure
invalid address
invalid template
worker restart
duplicate SQS delivery
DLQ transfer
```

Expected result:

- no candidate-path failure;
- no silent loss;
- retry where retryable;
- DLQ where permanent;
- delivery state remains inspectable.

## 12.5 Staging smoke

The nightly synthetic drive must verify:

```text
create organization
    ↓
create drive
    ↓
create candidate
    ↓
create invite
    ↓
email command created
    ↓
email worker consumes
    ↓
SES staging send
    ↓
provider accepted
```

Where production email cannot be used in synthetic tests, route the staging email adapter to a controlled mailbox/test recipient.

---

# 13. AWS Implementation

## 13.1 Infrastructure stacks

Implement in this order:

```text
NetworkStack
    ↓
DataStack
    ↓
MessagingStack
    ↓
IdentityStack
    ↓
SandboxStack
    ↓
ServiceStack × 10
    ↓
EdgeStack
    ↓
ObservabilityStack
```

## 13.2 Hiring infrastructure additions

Within the hiring service stack:

```text
Hiring ECS service
    ↓
Hiring task role
    ├─ hiring DB
    ├─ SQS email-send consume/delete
    ├─ EventBridge publish where required
    └─ SES SendEmail permission
```

Create:

```text
email-send queue
email-send DLQ
```

No email queue is shared with runtime, billing or grading.

## 13.3 IAM policy principle

The hiring task role should have:

```text
AllowReceiveMessage      email queue
AllowDeleteMessage       email queue
AllowSendMessage         required internal commands/events
AllowSendEmail           SES
AllowDBAccess            hiring DB
```

It must not gain:

```text
billing DB
runtime DB
biometric KMS decrypt
ledger-worm write
Bedrock invocation
execution host control
```

---

# 14. Data Migration Implementation

For each extracted service:

1. Freeze the owning contract.
2. Characterize existing behavior.
3. Create the new Prisma schema.
4. Create service-local migrations.
5. Export owned data.
6. Restore into the new service DB.
7. Build projections for data owned elsewhere.
8. Verify row counts and critical invariants.
9. Run shadow/dual-run when applicable.
10. Flip traffic gradually.
11. Keep the old module quarantined until explicit deletion approval.

For email specifically:

```text
existing email intent/data
      ↓
identify current provider calls
      ↓
characterization tests
      ↓
EmailPort
      ↓
outbox-backed email.send
      ↓
Mailpit/local
      ↓
SES/staging
      ↓
production
```

Do not delete an existing Resend/Postmark path until SES delivery is proven in staging and production rollback is known.

---

# 15. Communication Implementation

## 15.1 Synchronous

Implement only the approved synchronous edges:

```text
runtime → billing
runtime → execution
integrity → biometric
hiring → billing
hiring → content
insights → grading
insights → integrity
insights → biometric
insights → runtime
```

Every call must have:

- timeout/deadline;
- correlation id;
- idempotency where mutation occurs;
- retry policy;
- circuit breaker;
- bulkhead;
- bounded call depth.

## 15.2 Async

Event flow:

```text
service DB transaction
      ↓
outbox row
      ↓
relay
      ↓
EventBridge
      ↓
SQS subscription queue
      ↓
consumer
      ↓
inbox/idempotency
      ↓
local transaction
```

Email commands use the same durability principle, but remain a hiring-internal command.

---

# 16. Storage Implementation

## 16.1 S3

Use the existing target buckets/prefixes:

```text
artifacts
content-snapshots
biometric
ledger-worm
static assets
```

Rules:

- presigned uploads for evidence;
- no application proxy for large evidence;
- hash submission bundles;
- scoring data separated from candidate-visible data;
- lifecycle policies for sensitive evidence;
- Object Lock only for billing ledger exports.

## 16.2 Aurora

Maintain:

```text
core cluster
runtime cluster
billing cluster
sandbox RDS
```

Logically:

```text
one DB + one role per service
```

Connection limits are explicit and RDS Proxy/PgBouncer is used as selected in the architecture.

---

# 17. Security Implementation

## 17.1 Staff

Keep the selected identity design behind `AuthPort`:

```text
Cognito or Keycloak
      ↓
RS256 JWT
      ↓
service-local JWKS validation
```

No service calls IAM merely to validate every request.

## 17.2 Candidate

Runtime issues:

```text
candidate JWT
sub=sessionId
org_id
drive_id
aud=candidate
short expiry
```

Integrity and biometric validate it using runtime's JWKS.

## 17.3 Service identity

Use:

```text
security groups
+
short-lived service JWT
+
caller/RPC authorization
```

mTLS remains a later hardening step only if triggered.

---

# 18. Observability Implementation

Every service must produce:

```text
structured logs
health/readiness
metrics
traces
correlation IDs
tenant IDs
```

Tracing must survive:

```text
HTTP
→ gRPC
→ EventBridge
→ SQS
→ consumer
```

For SQS:

- copy correlation/causation/trace context into message attributes;
- restore context in consumer before processing.

Required dashboards:

```text
drive launch
candidate start
grading pipeline
email delivery
sandbox
billing
```

---

# 19. CI/CD Implementation

Per-service pipeline:

```text
lint
  ↓
unit tests
  ↓
contract tests
  ↓
integration tests
  ↓
build
  ↓
container scan
  ↓
push ECR
  ↓
CDK diff
  ↓
staging deploy
  ↓
smoke test
  ↓
approval
  ↓
production deploy
```

Production promotion uses the same image digest.

For Tier 0:

```text
CodeDeploy blue/green
```

For other services:

```text
rolling deployment + circuit-breaker rollback
```

---

# 20. Local Development

Keep:

```text
INFRA_MODE=local|full
```

Drivers:

```text
MESSAGING_DRIVER=memory|elasticmq|aws
STORAGE_DRIVER=memory|s3
LLM_DRIVER=mock|bedrock|anthropic
AUTH_DRIVER=dev|cognito|keycloak
EXEC_DRIVER=mock|piston
SCHEDULER_DRIVER=memory|aws
EMAIL_DRIVER=mock|mailpit|ses
```

Core containers:

```text
postgres
valkey
elasticmq
seaweedfs
mailpit
local-kms
jaeger
traefik
```

Example:

```bash
docker compose --profile core up
pnpm dev:up
pnpm dev -- --services=hiring,email
pnpm test:contract
```

The actual workspace scripts can map to the existing repo conventions; do not rename locked commands without reason.

---

# 21. Service-by-Service Definition of Done

A service cannot be considered extracted until:

- own DB and DB role;
- own Prisma client/schema;
- own migration path;
- own Dockerfile/image;
- own ECS task definition;
- own pipeline;
- health/readiness;
- structured logs;
- OTel;
- outbox/inbox;
- versioned contracts;
- SQS + DLQ where applicable;
- autoscaling;
- alarms;
- least-privilege IAM;
- failure drill;
- runbook;
- contract tests;
- characterization tests for moved behavior;
- no old cross-domain DB writes;
- monolith path quarantined;
- staging synthetic journey passes.

For `hiring-service`, additionally:

- email worker;
- email queue;
- email DLQ;
- SES adapter;
- Mailpit adapter;
- template versions;
- email delivery persistence;
- idempotency;
- provider error handling;
- email metrics and alarms.

---

# 22. Exact Implementation Order

Use this order so the team does not create downstream rework:

```text
1. Wave 0 read-only audit
2. Freeze billing Acquire contract
3. Create contracts package
4. Create Nx boundaries
5. Create CDK baseline
6. Deploy unchanged monolith to staging
7. Split DB schemas/modules
8. Build kit foundations
9. Build execution-service
10. Build billing-service shadow
11. Verify billing
12. Build runtime-service
13. Build integrity-service
14. Build biometric-service
15. Move billing to enforce
16. Build grading-service
17. Build insights-service
18. Build/complete control-plane extractions when triggers fire
19. Move hiring email worker with hiring extraction
20. Run load/failure/chaos tests
21. Rehearse restore
22. Remove quarantined monolith paths only with sign-off
```

Email implementation can be built before hiring extraction as an adapter-backed capability in the current hiring module, then moved with the hiring service without changing the command contract.

---

# 23. Email-Specific Implementation Order

For emailing alone, implement:

```text
1. Inventory current Resend/Postmark calls
2. Characterization tests for existing email behavior
3. Define EmailPort
4. Define EmailSendV1
5. Add email outbox/command creation
6. Add email-send SQS + DLQ
7. Build Mailpit adapter
8. Build email worker
9. Add template renderer/versioning
10. Add email delivery persistence
11. Add idempotency
12. Add retry/DLQ behavior
13. Add SES adapter
14. Verify SES domain/DKIM/SPF/DMARC
15. Request SES production access
16. Deploy to staging
17. Run invite/reminder/notice smoke tests
18. Load test large invite bursts
19. Enable production
20. Retire Resend/Postmark only after successful cutover
```

---

# 24. Email Acceptance Criteria

Email is ready for production only when all are true:

| Acceptance test | Required result |
|---|---|
| Invite created | durable `email.send` intent exists |
| SQS redelivery | duplicate is suppressed |
| Worker restart | message eventually completes |
| SES transient failure | retry occurs |
| Permanent invalid address | no infinite retry; DLQ/operator path |
| SES unavailable | drive/invite still succeeds |
| ATS-owned email flow | no duplicate candidate email |
| Template change | new version only |
| Candidate data | no raw PII in shared events |
| Production role | SES send permission only |
| Local | Mailpit receives rendered mail |
| Staging | synthetic invite produces expected email |
| Queue overload | SQS buffers without blocking hiring request |
| Observability | queue age/DLQ/send failures visible |
| Rollback | provider adapter can be disabled/reverted without changing hiring state |

---

# 25. Migration Rollback Rules

Every extraction needs a known reverse path:

```text
new service
   ↓
weighted route / adapter
   ↓
observe
   ↓
increase
```

Rollback:

```text
stop new traffic
    ↓
route back to monolith
    ↓
leave data in new service unless reconciliation says otherwise
    ↓
investigate
    ↓
retry extraction
```

For email:

```text
SES adapter failure
      ↓
email adapter can be switched to controlled fallback
      ↓
queue remains durable
```

Do not implement email as an inline call from a user-facing HTTP request because that would make rollback and provider outages part of the request critical path.

---

# 26. Wave Exit Gates

## Wave 0

- monolith healthy on AWS;
- boundaries enforced;
- contracts package present;
- billing contract signed;
- audit complete.

## Wave 1

- Piston execution isolated;
- billing shadow reconciliation correct;
- no session writes from execution;
- `billing_begin` no longer crosses the old tables.

## Wave 2

- synthetic candidate completes;
- billing enforce is correct;
- runtime works with hiring/content unavailable;
- biometric evidence isolation verified.

## Wave 3

- submit → grade → review works;
- Say-Do provenance enforced;
- placeholder cannot become a published score.

## Wave 4

- control-plane extraction trigger justified;
- hiring extraction includes email worker;
- email staging smoke complete;
- old provider path quarantined.

## Wave 5

- load test passes;
- scheduled pre-scale works;
- sandbox soak passes;
- failure drills pass;
- DR restore rehearsal passes;
- email queue/DLQ behavior passes under load.

---

# 27. Final Operating Model

The final implementation should behave as follows:

```text
                  ┌───────────────────────┐
                  │     Candidate SPA     │
                  └───────────┬───────────┘
                              │
                              ▼
                     runtime-service
                       │         │
                Acquire│         │Run
                       ▼         ▼
                 billing     execution
                       │
                       │
          ┌────────────┴─────────────────┐
          │                              │
          ▼                              ▼
     EventBridge/SQS               integrity
          │                              │
          │                              ▼
          │                         biometric
          │
          ▼
      grading
          │
          ▼
      insights

Recruiter
   │
   ▼
hiring-service
   │
   ├──── billing
   ├──── content
   ├──── partner API
   │
   └──── email worker
            │
            ▼
       email.send SQS
            │
            ▼
           SES
```

The key email property is:

```text
Hiring business transaction
        ≠
Email provider transaction
```

The first becomes durable through the local DB + outbox. The second is asynchronous through SQS + worker + SES.

That keeps emailing reliable without turning the notification provider into a distributed transaction participant.

---

# Appendix A — Implementation Commands

```bash
pnpm contracts:gen
pnpm db:migrate:all
pnpm test:contract
pnpm test
pnpm test:e2e
pnpm dev:up
```

Example focused development:

```bash
pnpm dev -- --services=hiring
pnpm dev -- --services=runtime,billing
pnpm mock:billing
```

---

# Appendix B — Email Environment Contract

Production:

```text
EMAIL_DRIVER=ses
AWS_REGION=<region>
EMAIL_FROM=<verified sender>
EMAIL_REPLY_TO=<reply address>
```

Local:

```text
EMAIL_DRIVER=mailpit
MAILPIT_HOST=localhost
MAILPIT_PORT=1025
```

Tests:

```text
EMAIL_DRIVER=mock
```

No provider API key should be required for SES when the ECS task role is correctly configured.

---

# Appendix C — Email Queue Conventions

```text
Queue:
cdr-<env>-hiring-email-send

DLQ:
cdr-<env>-hiring-email-send-dlq
```

Required message metadata:

```text
commandId
correlationId
causationId
tenantId where applicable
templateKey
templateVersion
candidateId
entityId
idempotencyKey
```

No message body is placed on the queue.

---

# Appendix D — Final Email Flow

```text
1. Invite is created
2. Hiring transaction commits
3. Outbox row is committed in the same transaction
4. Relay publishes the email command to SQS
5. Email worker receives it
6. Worker validates the contract
7. Worker checks idempotency
8. Worker loads recipient and template
9. Worker renders HTML + text
10. Worker calls SES
11. Worker records provider response/status
12. SQS message is acknowledged
13. Metrics/traces are emitted

Failure:
9/10 fails
    ↓
retry
    ↓
eventual success

or

retry budget exhausted
    ↓
DLQ
    ↓
operator action
```

---

# Appendix E — Implementation Boundary Reminder

The following must **not** happen during implementation:

```text
runtime → direct hiring DB
runtime → direct content DB
runtime → direct billing DB
runtime → SES
runtime → IAM for every request
grading → runtime DB
insights → another service DB
email worker → candidate runtime DB
shared kit → Session/Drive/Score domain types
email-service → created as an additional service
```

The target remains:

```text
10 bounded-context services
+
thin shared kit
+
EventBridge/SQS
+
Aurora
+
Valkey
+
S3
+
KMS
+
SES
+
EC2 sandbox
```

Emailing is part of the target implementation through `hiring-service` and does not alter that service count.
