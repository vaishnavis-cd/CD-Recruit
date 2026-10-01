# PHASE 2 — BILLING ENGINE

## Stage 2.8 — PaymentWebhookService Report

**Date:** 2026-09-30  
**Status:** PASS ✅  
**Current Test Regression:** **321 / 321 tests passing (100%)**  
**Prisma Invariants:** 28 migrations applied, 0 schema drift, schema valid  
**Build Status:** Shared build PASS, Backend build PASS  

---

### 1. Implementation Status

`PaymentWebhookService` and its supporting module architecture have been fully implemented and verified in strict accordance with the architecture-gated specification.

The service serves as the commercial ingress boundary between external payment gateways (`Razorpay`, `Stripe`) and internal billing services:
$$\text{External Gateway} \longrightarrow \text{Public Ingress (API-H2-18)} \longrightarrow \text{HMAC Verification} \longrightarrow \text{Inbox (billing.payment\_event)} \longrightarrow \text{Queue (payment-webhook)} \longrightarrow \text{Worker} \longrightarrow \text{PaymentService} \longrightarrow \text{CreditPoolService} \longrightarrow \text{LedgerService}$$

No business logic of `PaymentService`, `CreditPoolService`, or `LedgerService` was duplicated inside `PaymentWebhookService`.

---

### 2. Exact Architecture & Design Artifacts Verified

The implementation was strictly verified against:
1. `docs/super-admin/design/01-half2-domain-and-scope.md` (§1.5 F9 Payment Gateway, Webhooks, Inbox)
2. `docs/super-admin/design/02-half2-business-rules-and-invariants.md` (INV-PAY-02, Rule 6.1 captured payment requirement, Rule 6.2 webhook idempotency & replay protection, Rule 6.4 chargebacks and disputes)
3. `docs/super-admin/design/03-half2-database-schema.md` (`billing.payment_event` table specification)
4. `docs/super-admin/design/04-half2-services-and-api-contracts.md` (§1.5 `PaymentWebhookService` contract, §2.4 API-H2-18 and API-H2-19)
5. `docs/super-admin/design/05-half2-api-catalogue-and-page-specifications.md` (API-H2-18 Public Webhook Ingress, API-H2-19 Platform Replay Webhook)
6. `docs/super-admin/design/06-half2-state-permission-and-audit-matrix.md` (§1.4 Payment and PaymentEvent state machine, §3.2 Staff role permissions matrix)
7. `docs/super-admin/design/07-half1-half2-integration-contract.md` (Webhook ingress decoupling)
8. `docs/super-admin/design/DESIGN-DECISIONS.md`
9. `docs/super-admin/design/DESIGN-OPEN-QUESTIONS.md`
10. `docs/super-admin/design/DESIGN-READINESS-REPORT.md`
11. `docs/super-admin/implementation/PHASE-2-BILLING-CURRENT-STATE-REAUDIT.md`
12. `docs/super-admin/implementation/PHASE-2.7-PAYMENT-SERVICE-REPORT.md`

---

### 3. Public Webhook Ingress Design (API-H2-18)

- **Route:** `POST /api/v1/billing/webhooks/:provider`
- **Supported Providers:** `razorpay`, `stripe`
- **Authentication:** Cryptographic HMAC signature verification header. No recruiter authentication or session cookies are used.
- **Raw Body Preservation:**
  - `NestFactory.create(AppModule, { rawBody: true })` configured in `src/main.ts`.
  - Body parser `json({ limit: "50mb", verify: (req, _res, buf) => { req.rawBody = buf; } })` attaches exact unparsed raw bytes as `Buffer`.
  - Signature verification strictly uses raw payload bytes, never re-stringified JSON objects.
- **Response SLA:** Returns `200 OK` `{ received: true, eventId, idempotent, status }` immediately after event persistence and queue dispatch.

---

### 4. Cryptographic Signature Verification

- **Razorpay:**
  - Header: `X-Razorpay-Signature` (case-insensitive)
  - Algorithm: HMAC-SHA256 of `rawBody` using configured `RAZORPAY_WEBHOOK_SECRET`.
  - Comparison: Constant-time byte-length and content equality via `crypto.timingSafeEqual`.
- **Stripe:**
  - Header: `Stripe-Signature` (format: `t=timestamp,v1=signature`)
  - Signed Payload: `${t}.${rawBody.toString('utf8')}`
  - Algorithm: HMAC-SHA256 hex string comparison using configured `STRIPE_WEBHOOK_SECRET`.
  - Replay Protection: 300-second (5-minute) timestamp tolerance check against server clock.
  - Comparison: Constant-time byte equality via `crypto.timingSafeEqual`.
- **Rejection Behavior:** Missing header, malformed bytes, expired timestamp, or mismatch immediately returns `401 Unauthorized` with `INVALID_SIGNATURE` or `MISSING_SIGNATURE`. Emits `WEBHOOK_REJECTED` audit event without logging secrets or signature hashes.

---

### 5. Webhook Inbox & Idempotency (`billing.payment_event`)

- **Table:** `billing.payment_event` (Prisma model `PaymentWebhookInbox`).
- **Uniqueness Invariant:** `@@unique([provider, eventId])` is the authoritative database concurrency boundary.
- **Lifecycle States:**
  $$\text{PENDING} \longrightarrow \text{PROCESSING} \longrightarrow \text{PROCESSED (or FAILED)}$$
- **Duplicate Handling:**
  - If a webhook event arrives a second time, query finds existing inbox row.
  - Returns `{ received: true, eventId, idempotent: true, status: existing.status }` with HTTP 200 OK.
  - No duplicate payment, no duplicate pool, no duplicate ledger grant.
  - Concurrency races on insertion catch PostgreSQL unique constraint violation `P2002` and resolve idempotently.

---

### 6. Queue & Worker Architecture

- **Queue Name:** `payment-webhook`
- **Job Name:** `process-payment-webhook`
- **Polymorphic Execution:**
  - **Full/Production mode:** BullMQ worker `PaymentWebhookProcessor` (`@Processor("payment-webhook")` extending `WorkerHost`).
  - **Local/Test mode:** `LocalFakeQueueProvider` executes registered processor handler via `setImmediate`.
- **Locking & Concurrency Serialization:**
  - Worker acquires PostgreSQL row lock: `SELECT ... FROM "billing"."payment_event" WHERE id = $1 FOR UPDATE`.
  - Transitions status from `PENDING` to `PROCESSING`.
  - Concurrent duplicate executions recognize `alreadyProcessed` or `PROCESSING` and serialize safely without race conditions.

---

### 7. Commercial Payment Capture Orchestration

When a successful capture event arrives (`payment.captured`, `order.paid`, `payment_intent.succeeded`, `charge.succeeded`):
1. Resolve provider payment identity (`providerPaymentId`, `providerOrderId`).
2. Acquire PostgreSQL row lock on `billing.payment`: `SELECT ... FROM "billing"."payment" WHERE id = $1 FOR UPDATE`.
3. If payment already `CAPTURED`, `DISPUTED`, or `REFUNDED`: returns idempotently without re-minting credits.
4. If payment is in `CREATED` state:
   - Call `PaymentService.capturePayment(systemActor, payment.id, ...)`.
   - `PaymentService` updates status to `CAPTURED`.
   - `CreditPoolService` mints `PURCHASE` pool.
   - `LedgerService` writes immutable `GRANT` entry.
   - `BillingAccount` sets `hasPaidPurchase = true`.
   - Records `PAYMENT_CAPTURED` audit event.
5. If payment row is not pre-created (direct gateway checkout):
   - Inspects validated metadata (`billingAccountId`, `priceBookEntryId`, `quantityCredits`, `amountMinor`).
   - Atomically invokes `PaymentService.createPaymentRecord(systemActor, { ... status: PaymentStatus.CAPTURED })`.
6. Updates inbox status to `PROCESSED` with `processedAt = now()`.

---

### 8. Dispute & Chargeback Handling

When a gateway dispute/chargeback event arrives (`payment.dispute.created`, `dispute.created`, `charge.dispute.created`):
1. Identify `Payment` record and associated `CreditPool`.
2. Transition `Payment.status = DISPUTED`.
3. Suspend affected pool via `CreditPoolService.suspendPool(pool.id, reason, context)` (status: `SUSPENDED`).
4. Evaluate tenant account balance: if total available credits $\le 0$, transition `BillingAccount.status = RESTRICTED` (Rule 6.4).
5. Immutable ledger entries remain untouched (0 deletions, 0 updates).
6. Record `PAYMENT_DISPUTED` audit event.

---

### 9. Administrative Replay Endpoint (API-H2-19)

- **Route:** `POST /api/v1/platform/billing/payments/replay-webhook`
- **Controller:** `PaymentWebhookReplayController`
- **Guards:** `@UseGuards(PlatformJwtAuthGuard, PlatformRolesGuard)`
- **RBAC Matrix (Artifact 06 §3.2):**
  - `OWNER`: Authorized ✅
  - `FINANCE`: Authorized ✅
  - `SUPPORT`: Forbidden (403) ❌
  - `RECRUITER`: Forbidden (403/401) ❌
- **Behavior:**
  - Locates inbox record by `id` or `eventId`.
  - Resets status to `PENDING`.
  - Records `WEBHOOK_REPLAYED` billing audit event with staff actor provenance.
  - Re-executes `processWebhookEventJob(inboxRecord.id)`.
  - Idempotent and safe against already processed or terminal payments.

---

### 10. Audit Behavior & Security Sanitization

- **Audit Events Emitted:**
  - `WEBHOOK_INGESTED`: Persisted event to inbox.
  - `WEBHOOK_REJECTED`: Signature verification failed (logs failure without leaking signatures).
  - `WEBHOOK_PROCESSED`: Worker finished processing.
  - `WEBHOOK_FAILED`: Processing failed with error message.
  - `WEBHOOK_REPLAYED`: Staff triggered replay.
  - `PAYMENT_CAPTURED`: Commercial capture completed.
  - `PAYMENT_DISPUTED`: Chargeback dispute handled.
- **Security Sanitization:** Webhook secrets, authorization headers, and raw signature hashes are strictly prohibited from appearing in audit metadata or log strings.

---

### 11. Concurrency Behavior & Race Condition Mitigation

| Scenario | Concurrency Mechanism | Result |
|---|---|---|
| **Duplicate Webhook Delivery** | DB Unique Constraint `(provider, event_id)` + catch `P2002` | Exactly 1 inbox row, 1 processing execution |
| **Concurrent Worker Executions** | `SELECT ... FROM "billing"."payment_event" FOR UPDATE` | Workers serialized; second sees `PROCESSED` and no-ops |
| **Simultaneous Webhook + Manual Capture** | `SELECT ... FROM "billing"."payment" FOR UPDATE` | Exactly 1 `PURCHASE` pool, 1 `GRANT` entry, 0 duplicate credits |
| **Different Events for Same Payment** | Payment status state machine check (`CAPTURED` / `DISPUTED`) | Idempotent return without duplicate minting |
| **Replay Racing with Normal Worker** | Row lock serialization + idempotent state machine | Exactly 1 financial outcome |

---

### 12. Test Breakdown

The comprehensive test suite `src/billing/webhook/payment-webhook.spec.ts` verifies **20 / 20 tests (100% PASS)**:

| Test # | Test Name | Invariant / Requirement Verified | Result |
|---|---|---|---|
| **1** | Razorpay signature verification | HMAC-SHA256 verification and invalid signature rejection | PASS ✅ |
| **2** | Stripe signature verification | `t=...,v1=...` parsing, HMAC check, 300s timestamp tolerance | PASS ✅ |
| **3** | Provider normalization | Supported (`razorpay`, `stripe`) vs unsupported (`paypal`) | PASS ✅ |
| **4** | Test F: Invalid signature rejection | Ingress rejection (401), `WEBHOOK_REJECTED` audit, no DB mutation | PASS ✅ |
| **5** | Test F: Missing signature header | Immediate `UnauthorizedException` | PASS ✅ |
| **6** | Ingest valid webhook | `billing.payment_event` inbox persistence, `PENDING` status | PASS ✅ |
| **7** | Worker execution happy path | Payment `CAPTURED`, `PURCHASE` pool minted, ledger `GRANT`, `hasPaidPurchase=true` | PASS ✅ |
| **8** | Test B: Duplicate processed event | Idempotent no-op, 0 duplicate ledger grants | PASS ✅ |
| **9** | Test A: Duplicate webhook delivery race | Concurrent `Promise.all` ingestion & processing yields exactly 1 pool & 1 grant | PASS ✅ |
| **10** | Test C: Different webhook events for same payment | `payment_intent.succeeded` + `charge.succeeded` cannot double-mint credits | PASS ✅ |
| **11** | Test D: Webhook capture racing manual capture | Row lock serialization ensures exactly 1 credit allocation | PASS ✅ |
| **12** | Test G: Unsupported event type | `payment.authorized` safely acknowledged and marked `PROCESSED` with 0 credits | PASS ✅ |
| **13** | Test H: Dispute webhook | Payment `DISPUTED`, pool `SUSPENDED`, ledger entries preserved | PASS ✅ |
| **14** | Test I: Worker failure & retryable state | Unknown payment transitions inbox to `FAILED` with error message | PASS ✅ |
| **15** | Admin replay RBAC | `FINANCE`/`OWNER` succeed, `SUPPORT`/`RECRUITER` forbidden (403), audit recorded | PASS ✅ |
| **16** | Test E: Replay racing normal processing | Concurrent replay + worker yields single financial outcome | PASS ✅ |
| **17** | Test J: Provider event uniqueness | Direct DB insert violation on `@@unique([provider, eventId])` | PASS ✅ |
| **18** | Metadata-driven checkout capture | On-the-fly payment creation, pool minting, and grant from metadata | PASS ✅ |
| **19** | Security audit invariant | Secrets and signatures strictly omitted from audit logs | PASS ✅ |
| **20** | Financial ledger balance integrity | Zero overdraft across all accounts, ledger immutability intact | PASS ✅ |

#### Full Repository Regression Scorecard

```text
Suite 1:  step1-7-foundation-gate.spec.ts   20 / 20 PASS (100%)
Suite 2:  platform-auth.spec.ts             17 / 17 PASS (100%)
Suite 3:  platform-audit.spec.ts            17 / 17 PASS (100%)
Suite 4:  ledger.spec.ts                    32 / 32 PASS (100%)
Suite 5:  billing-account.spec.ts           29 / 29 PASS (100%)
Suite 6:  credit-pool.spec.ts               31 / 31 PASS (100%)
Suite 7:  trial-grant.spec.ts               22 / 22 PASS (100%)
Suite 8:  manual-billing-request.spec.ts    47 / 47 PASS (100%)
Suite 9:  price-book.spec.ts                47 / 47 PASS (100%)
Suite 10: payment.spec.ts                   39 / 39 PASS (100%)
Suite 11: payment-webhook.spec.ts           20 / 20 PASS (100%)  [NEW]
------------------------------------------------------------------
TOTAL:                                     321 / 321 PASS (100%)
```

---

### 13. Prisma & Migration Status

- **Prisma Schema Validation:** `npx prisma validate`: **PASS** (`The schema at ..\prisma\schema.prisma is valid 🚀`)
- **Prisma Migrations Status:** `npx prisma migrate status`: **PASS** (`28 migrations found in prisma/migrations. Database schema is up to date!`)
- **Schema Drift:** **0 drift**. No new migrations created (the table `billing.payment_event` and `PaymentWebhookInbox` model pre-existed).

---

### 14. Build Status

- `npm run build:shared`: **PASS** (Exit code 0)
- `npm run build` (`backend/api`): **PASS** (Exit code 0, clean NestJS bundle)

---

### 15. Files Created & Modified

#### Files Created:
1. `backend/api/src/billing/webhook/payment-webhook.types.ts`
2. `backend/api/src/billing/webhook/payment-webhook.service.ts`
3. `backend/api/src/billing/webhook/payment-webhook.controller.ts`
4. `backend/api/src/billing/webhook/payment-webhook.processor.ts`
5. `backend/api/src/billing/webhook/payment-webhook.module.ts`
6. `backend/api/src/billing/webhook/payment-webhook.spec.ts`

#### Files Modified:
1. `backend/api/src/config/configuration.ts`: Added `razorpayWebhookSecret` and `stripeWebhookSecret`.
2. `backend/api/src/main.ts`: Added `{ rawBody: true }` and express json verify callback.
3. `backend/api/src/queue/queue.module.ts`: Registered `payment-webhook` queue in BullModule when `isFull`.
4. `backend/api/src/app.module.ts`: Registered `PaymentWebhookModule`.
5. `backend/api/src/billing/payment/payment.types.ts`: Added `DisputePaymentDto` and `FailPaymentDto`.
6. `backend/api/src/billing/payment/payment.service.ts`: Added `disputePayment`, `failPayment`, row-level locking on `capturePayment`, and `P2002` concurrency handling on `createPaymentRecord`.

---

### 16. Deviations & Contradictions

None. The implementation strictly abides by all 12 source-of-truth documents.

---

### 17. Final Hard-Stop Statement

**Stage 2.8 PaymentWebhookService — PASS**

**STRICT STOP REACHED — STOP BEFORE STAGE 2.9 RECONCILIATION SERVICE**
