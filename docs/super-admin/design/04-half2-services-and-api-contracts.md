# Artifact 04: Backend Services and API Contracts Specification

**Document:** `docs/super-admin/design/04-half2-services-and-api-contracts.md`  
**Classification:** Backend Architecture & Interface Contract  
**System:** Proctora / CD-Recruit Platform Ops & Billing Engine  
**Authoritative Precedence:** `PRICING_AND_CREDIT_POOL_SPECIFICATION.md` v3 > `super-admin-intent.md`  

---

## 1. Service Boundaries & Responsibilities

Financial and commercial business logic lives strictly in domain services, never inside NestJS controllers or frontend clients.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              HALF 2 SERVICE TOPOLOGY                                   │
├──────────────────────────┬─────────────────────────────┬───────────────────────────────┤
│ Core Financial Domain    │ Operational & Governance    │ Ingestion & Integration       │
├──────────────────────────┼─────────────────────────────┼───────────────────────────────┤
│ • LedgerService          │ • ManualBillingReqService   │ • PaymentWebhookService       │
│ • CreditPoolService      │ • ReconciliationService     │ • PaymentService              │
│ • BillingAccountService  │ • FinanceMetricsService     │ • PriceBookService            │
└──────────────────────────┴─────────────────────────────┴───────────────────────────────┘
```

---

### 1.1 `LedgerService`
- **Primary Responsibility:** Absolute gatekeeper of the `credit_ledger_entry` table and balance-mutating operations.
- **Owns Business Rules:** Invariants R1, R2, R4, R5; Fast Path PL/pgSQL execution (`billing_begin`); Slow Path pool promotion and fallthrough; WAIVE courtesy reattempts (5% cap); T1–T3 platform fault reversals.
- **Reads:** `credit_pool`, `billing_account`, `session`, `drive`.
- **Writes:** `credit_ledger_entry` (append-only), updates `credit_pool.cached_remaining` and `billing_account.overdraft_used`.
- **Transaction Boundary:** Holds advisory lock on slow path (`pg_advisory_xact_lock`); executes all inserts and cache decrements in single database transaction.
- **Forbidden Responsibilities:** Never renders UI, never handles HTTP requests directly, never parses candidate PII.
- **Public Methods:**
  - `claimSessionCredit(sessionId: string, mode: 'off' | 'shadow' | 'enforce'): Promise<BeginSessionOutcome>`
  - `grantCredits(params: GrantCreditParams): Promise<CreditLedgerEntry>`
  - `reverseCredit(acquisitionEntryId: string, reason: LedgerReason, note?: string): Promise<CreditLedgerEntry>`
  - `settleOverdraft(billingAccountId: string, poolId: string, amount: number): Promise<void>`
  - `expirePoolCredits(poolId: string): Promise<number>`
  - `executeManualAdjustment(requestId: string, params: AdjustParams): Promise<CreditLedgerEntry>`
  - `getLedgerEntries(filter: LedgerQueryFilter): Promise<CreditLedgerEntry[]>`
  - `exportLedgerCsv(filter: LedgerQueryFilter): Promise<string>`
  - `listIncidentWindows(): Promise<IncidentWindow[]>`
  - `declareIncidentWindow(actor: LedgerActor, dto: DeclareIncidentWindowDto): Promise<IncidentWindowResultDto>`

---

### 1.2 `CreditPoolService`
- **Primary Responsibility:** Lifecycle management, sequential queueing ("Jio Model"), and validity tracking of credit packs.
- **Owns Business Rules:** Pool topology (1 active general pool, 1 active pass per drive); floating clock initialization on first draw; 7-day makeup window enforcement; pool immutability guards.
- **Reads:** `credit_pool`, `billing_account`.
- **Writes:** `credit_pool` (status transitions, activation timestamps, queue orders).
- **Transaction Boundary:** Scoped to pool entity; coordinates with `LedgerService` under account advisory lock during pool promotion.
- **Forbidden Responsibilities:** Never mutates balances directly without `LedgerService`.
- **Public Methods:**
  - `createPool(params: CreatePoolDto): Promise<CreditPool>`
  - `promoteNextQueuedPool(billingAccountId: string): Promise<CreditPool | null>`
  - `extendPoolExpiry(poolId: string, newExpiry: Date, requestId: string): Promise<CreditPool>`
  - `suspendPool(poolId: string, reason: string): Promise<CreditPool>`
  - `getAccountPools(billingAccountId: string): Promise<CreditPoolSummary[]>`

---

### 1.3 `BillingAccountService`
- **Primary Responsibility:** Management of legal payer entities, country/tax anchor, and currency settings.
- **Owns Business Rules:** Overdraft limit configuration (0 by default); trial domain uniqueness; restricted/suspended status transitions.
- **Reads:** `billing_account`, `organization`.
- **Writes:** `billing_account`.
- **Transaction Boundary:** Account-level transactions.
- **Forbidden Responsibilities:** Cannot alter candidate rosters or drive schedules.
- **Public Methods:**
  - `createForOrganization(orgId: string, country: string, currency?: string): Promise<BillingAccount>`
  - `listAccounts(options: ListBillingAccountsOptions): Promise<PaginatedBillingAccountsResultDto>`
  - `getAccountById(id: string): Promise<BillingAccount | null>`
  - `getAccountSummary(id: string): Promise<BillingAccountSummaryDto>`
  - `updateOverdraftLimit(id: string, newLimit: number, requestId: string): Promise<BillingAccount>`
  - `updateStatus(id: string, status: BillingAccountStatus, requestId: string): Promise<BillingAccount>`

---

### 1.4 `ManualBillingRequestService`
- **Primary Responsibility:** Maker-checker orchestration for all manual money actions.
- **Owns Business Rules:** Dual-authorization rule ($\text{requester} \ne \text{approver}$); zero threshold; safe retry via deterministic idempotency keys.
- **Reads:** `manual_billing_request`, `billing_account`, `staff`.
- **Writes:** `manual_billing_request`.
- **Transaction Boundary:** Requests submitted in standalone transaction; approvals execute within a transaction setting `SET LOCAL proctora.request_id = request.id`.
- **Forbidden Responsibilities:** Does not execute ledger logic directly (delegates to `LedgerService`).
- **Public Methods:**
  - `createRequest(actor: StaffUser, dto: CreateManualRequestDto): Promise<ManualBillingRequest>`
  - `approveRequest(actor: StaffUser, requestId: string): Promise<ManualBillingRequest>`
  - `rejectRequest(actor: StaffUser, requestId: string, reason: string): Promise<ManualBillingRequest>`
  - `cancelRequest(actor: StaffUser, requestId: string): Promise<ManualBillingRequest>`
  - `retryExecution(actor: StaffUser, requestId: string): Promise<ManualBillingRequest>`

---

### 1.5 `PaymentService` & `PaymentWebhookService`
- **Primary Responsibility:** Payment gateway transaction verification, offline invoicing, and asynchronous webhook ingestion.
- **Owns Business Rules:** Cryptographic webhook verification; minting only on captured status; cash refund boundaries (unconsumed only); dispute freezing.
- **Reads:** `payment`, `payment_event`, `price_book_entry`.
- **Writes:** `payment`, `payment_event`.
- **Transaction Boundary:** Webhook receiver writes to inbox (`payment_event`); BullMQ worker processes payment and mints credits via `LedgerService`.
- **Forbidden Responsibilities:** Never runs inside private platform process; webhook receiver is exposed on public API.
- **Public Methods:**
  - `recordManualInvoicePayment(actor: StaffUser, dto: ManualInvoicePaymentDto): Promise<Payment>`
  - `ingestWebhookEvent(provider: string, headers: any, rawBody: Buffer): Promise<void>`
  - `processWebhookEventJob(eventId: string): Promise<void>`
  - `issueRefund(actor: StaffUser, paymentId: string, amountMinor: number): Promise<Payment>`

---

### 1.6 `PriceBookService`
- **Primary Responsibility:** Versioned pricing catalog management.
- **Owns Business Rules:** Immutability of prices; effective date ranges; regional catalog lookup.
- **Reads:** `price_book_entry`.
- **Writes:** `price_book_entry` (insert only).
- **Public Methods:**
  - `getActivePrice(sku: string, country: string): Promise<PriceBookEntry>`
  - `publishNewVersion(actor: StaffUser, dto: PublishPriceDto): Promise<PriceBookEntry>`
  - `listCatalog(country?: string): Promise<PriceBookEntry[]>`

---

### 1.7 `ReconciliationService`
- **Primary Responsibility:** Automated execution and reporting of the 7-Point Nightly Audit Check (§9.2).
- **Owns Business Rules:** Pool integrity; overdraft replay; 1:1 session-evidence matching; expiry sweeps; WORM export checksum validation.
- **Reads:** All `billing.*` tables, `session_billing_evidence`, MinIO S3 exports.
- **Writes:** `billing.reconciliation_run`.
- **Public Methods:**
  - `runNightlyAudit(): Promise<ReconciliationRun>`
  - `getLatestRun(): Promise<ReconciliationRun>`
  - `triggerManualAudit(actor: StaffUser): Promise<ReconciliationRun>`

---

## 2. API Contract Specifications

All endpoints follow the CD-Recruit global standards:
- Base path: `/api/v1`
- Standard headers: `Authorization: Bearer <JWT>`, `Content-Type: application/json`
- Global error envelope: `{ statusCode, code, message, timestamp, path }`

---

### 2.1 Billing Accounts API

#### `GET /api/v1/platform/billing/accounts`
- **Purpose:** Paginated list of billing accounts with balances and status.
- **Auth & Role:** `JwtAuthGuard`, Roles: `ADMIN`, `SUPER_ADMIN`.
- **Query Params:** `page` (default: 1), `limit` (default: 20), `search` (name/legal entity), `status`, `country`.
- **Response (200 OK):**
  ```json
  {
    "data": [
      {
        "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
        "name": "Acme Corp",
        "legalEntityName": "Acme Technologies India Pvt Ltd",
        "billingCountry": "IN",
        "currency": "INR",
        "status": "ACTIVE",
        "totalRemainingCredits": 420,
        "overdraftUsed": 0,
        "overdraftLimit": 0,
        "hasPaidPurchase": true,
        "activePoolsCount": 2,
        "createdAt": "2026-09-20T10:00:00Z"
      }
    ],
    "meta": { "total": 142, "page": 1, "limit": 20 }
  }
  ```

#### `GET /api/v1/platform/billing/accounts/:id/summary`
- **Purpose:** Comprehensive financial summary of a single billing account.
- **Auth & Role:** `JwtAuthGuard`, Roles: `ADMIN`, `SUPER_ADMIN`.
- **Path Params:** `id` (UUID).
- **Response (200 OK):**
  ```json
  {
    "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    "name": "Acme Corp",
    "legalEntityName": "Acme Technologies India Pvt Ltd",
    "billingCountry": "IN",
    "currency": "INR",
    "taxId": "29ABCDE1234F1Z5",
    "status": "ACTIVE",
    "overdraftLimit": 0,
    "overdraftUsed": 0,
    "hasPaidPurchase": true,
    "trialDomain": "acme.com",
    "trialGrantedAt": "2026-08-01T09:00:00Z",
    "totalAvailableCredits": 420,
    "pools": [
      {
        "id": "pool-uuid-1",
        "name": "Sep Campus Drive",
        "poolType": "DRIVE_PASS",
        "status": "ACTIVE",
        "cachedRemaining": 120,
        "totalCredits": 200,
        "expiresAt": "2026-10-05T18:00:00Z"
      },
      {
        "id": "pool-uuid-2",
        "name": "Annual Reserve",
        "poolType": "TALENT_RESERVE",
        "status": "QUEUED",
        "cachedRemaining": 300,
        "totalCredits": 300,
        "expiresAt": null
      }
    ],
    "reconciliationStatus": "PASSED"
  }
  ```

---

### 2.2 Maker-Checker Manual Requests API

#### `GET /api/v1/platform/billing/requests`
- **Purpose:** List manual billing requests filtered by tab and status.
- **Auth & Role:** `JwtAuthGuard`, Roles: `ADMIN`, `SUPER_ADMIN`.
- **Query Params:** `tab` (`my_requests` | `awaiting_approval` | `all`), `status` (`PENDING` | `APPROVED` | `REJECTED` | `EXECUTED`), `kind`.
- **Response (200 OK):** Returns array of `ManualBillingRequestDto`.

#### `POST /api/v1/platform/billing/requests`
- **Purpose:** Create a new manual billing request.
- **Auth & Role:** `JwtAuthGuard`, Roles: `ADMIN`, `SUPER_ADMIN`.
- **Request Body:**
  ```json
  {
    "billingAccountId": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    "kind": "GRANT",
    "ticketRef": "JIRA-4821",
    "reason": "Goodwill grant for campus drive network outage",
    "payload": {
      "credits": 50,
      "source": "GOODWILL",
      "validityDays": 30,
      "driveId": null
    }
  }
  ```
- **Response (201 Created):** Returns created request with `status = PENDING`.

#### `POST /api/v1/platform/billing/requests/:id/approve`
- **Purpose:** Approve and execute a pending billing request.
- **Auth & Role:** `JwtAuthGuard`, Role: `SUPER_ADMIN` (Finance).
- **Validation:** Server enforces `request.requestedById !== actor.id`.
- **Response (200 OK):** Returns request with `status = EXECUTED`, `executedAt`, and audit event ID.
- **Errors:**
  - `403 Forbidden`: `MAKER_CHECKER_SELF_APPROVAL_FORBIDDEN`
  - `409 Conflict`: Request not in `PENDING` state.

---

### 2.3 Ledger Explorer API

#### `GET /api/v1/platform/billing/ledger`
- **Purpose:** Query append-only ledger entries with pseudonymous snapshots.
- **Auth & Role:** `JwtAuthGuard`, Roles: `ADMIN`, `SUPER_ADMIN`.
- **Query Params:** `billingAccountId`, `creditPoolId`, `entryType`, `reason`, `startDate`, `endDate`, `includeShadow` (default: false), `sessionId`, `driveId`, `page`, `limit`.
- **Response (200 OK):**
  ```json
  {
    "data": [
      {
        "id": "entry-uuid-1",
        "billingAccountId": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
        "creditPoolId": "pool-uuid-1",
        "entryType": "CONSUME",
        "amount": -1,
        "balanceAfter": 119,
        "sessionId": "sess-uuid-1",
        "driveId": "drive-uuid-1",
        "reason": "ATTEMPT_START",
        "actorId": "system",
        "idempotencyKey": "acquire:sess-uuid-1",
        "shadow": false,
        "createdAt": "2026-09-28T10:15:23Z"
      }
    ],
    "meta": { "total": 1240, "page": 1, "limit": 50 }
  }
  ```
- **Security Check:** Zero candidate PII (names/emails) present in response.

---

### 2.4 Payments & Webhooks API

#### `POST /api/v1/platform/billing/payments/manual-invoice`
- **Purpose:** Record an offline enterprise PO / wire transfer payment.
- **Auth & Role:** `JwtAuthGuard`, Role: `SUPER_ADMIN` (Finance).
- **Request Body:**
  ```json
  {
    "billingAccountId": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    "invoiceNumber": "INV-2026-0042",
    "poNumber": "PO-99412",
    "priceBookEntryId": "price-uuid-1",
    "quantityCredits": 1000,
    "amountMinor": 6000000,
    "taxMinor": 1080000,
    "currency": "INR",
    "capturedAt": "2026-09-28T09:00:00Z"
  }
  ```
- **Side Effects:** Creates `payment` row, mints `CreditPool` of type `ENTERPRISE`, writes `GRANT` ledger entry (`grant_source = CONTRACT`).

#### `POST /api/v1/billing/webhooks/:provider`
- **Purpose:** Public internet webhook receiver for payment gateways (`razorpay` | `stripe`).
- **Auth:** Cryptographic signature header verification (`X-Razorpay-Signature` or `Stripe-Signature`).
- **Behavior:**
  1. Verifies HMAC-SHA256 signature against webhook secret.
  2. Inserts payload into `billing.payment_event` inbox table.
  3. Enqueues BullMQ job `process-payment-webhook`.
  4. Returns `200 OK` `{ received: true }` within $<500\text{ms}$.

---

### 2.5 Reconciliation & Health API

#### `GET /api/v1/platform/billing/reconciliation/latest`
- **Purpose:** Fetch the latest nightly 7-point reconciliation report.
- **Auth & Role:** `JwtAuthGuard`, Roles: `ADMIN`, `SUPER_ADMIN`.
- **Response (200 OK):**
  ```json
  {
    "id": "recon-run-uuid-1",
    "status": "PASSED",
    "driftDetected": false,
    "startedAt": "2026-09-28T02:00:00Z",
    "completedAt": "2026-09-28T02:03:45Z",
    "checkResults": {
      "poolIntegrity": { "status": "PASSED", "poolsChecked": 412, "discrepancies": 0 },
      "overdraftIntegrity": { "status": "PASSED", "accountsChecked": 180, "discrepancies": 0 },
      "sessionAcquisitionOneToOne": { "status": "PASSED", "sessionsChecked": 4200, "discrepancies": 0 },
      "expirySweeper": { "status": "PASSED", "expiredPoolsClosed": 3 },
      "topologyInvariant": { "status": "PASSED", "violations": 0 },
      "paymentProof": { "status": "PASSED", "purchasesVerified": 95 },
      "wormBackupVerification": { "status": "PASSED", "hashMatch": true }
    }
  }
  ```

---

## 3. Data Transfer Objects (DTOs)

All DTOs are declared with `@nestjs/swagger` decorators and `class-validator` rules.

```typescript
// ── Manual Request DTOs ──────────────────────────────────────────────────
export class CreateManualRequestDto {
  @IsUUID()
  billingAccountId: string;

  @IsEnum(ManualRequestKind)
  kind: ManualRequestKind;

  @IsString()
  @MinLength(3)
  @MaxLength(64)
  @Matches(/^[A-Z0-9_-]+$/i, { message: "ticketRef must be alphanumeric format (e.g. JIRA-1234)" })
  ticketRef: string;

  @IsString()
  @MinLength(10)
  reason: string;

  @IsObject()
  @ValidateNested()
  payload: Record<string, any>;
}

export class RejectManualRequestDto {
  @IsString()
  @MinLength(10)
  rejectionReason: string;
}

// ── Manual Invoice Payment DTO ───────────────────────────────────────────
export class ManualInvoicePaymentDto {
  @IsUUID()
  billingAccountId: string;

  @IsString()
  @MinLength(3)
  invoiceNumber: string;

  @IsString()
  @IsOptional()
  poNumber?: string;

  @IsUUID()
  priceBookEntryId: string;

  @IsInt()
  @Min(1)
  quantityCredits: number;

  @IsInt()
  @Min(0)
  amountMinor: number;

  @IsInt()
  @IsOptional()
  taxMinor?: number;

  @IsString()
  @Length(3, 3)
  currency: string;

  @IsDateString()
  capturedAt: string;
}

// ── Price Book Publication DTO ───────────────────────────────────────────
export class PublishPriceBookEntryDto {
  @IsString()
  sku: string;

  @IsEnum(PoolType)
  poolType: PoolType;

  @IsInt()
  @Min(1)
  credits: number;

  @IsInt()
  @IsOptional()
  validityDays?: number;

  @IsString()
  @Length(2, 2)
  billingCountry: string;

  @IsString()
  @Length(3, 3)
  currency: string;

  @IsInt()
  @Min(1)
  unitPriceMinor: number;

  @IsDateString()
  effectiveFrom: string;
}
```
