# CD-Recruit — Super Admin Console: Architecture Decision, Scope & Two-Way Split

**Status:** proposal for sign-off. Nothing here overrides `PRICING_AND_CREDIT_POOL_SPECIFICATION.md` (v3) — that spec stays authoritative for all money behavior. This document decides *where the console lives*, *what each page does*, *who builds what*, and *how to start*.

**Companion docs:** Pricing & Credit Pool Specification (v3), Proctora Pricing & Credit System Explained, Admin Dashboard IA Review, MVP Architecture & Launch Plan, Three-Track Build Plan.

**Not available when this was written:** `CONTENT_PROTECTION_CURRENCY_AND_TAX_SPECIFICATION.md`. The tax/currency parts of the Price Book (H2.5) are a shell to reconcile with it, not a final definition.

**Terms.** *Super Admin / Platform Console* = the internal staff console (us). *Admin Dashboard* = the tenant-facing recruiter app. *Tenant* = a client company (Organization + its BillingAccount). This console is internal, so CD-Recruit naming applies; "Proctora" only appears on tenant/candidate-visible surfaces.

---

## 1. Architecture Decision

### 1.1 Verdict

**Modular monolith with a separate entrypoint, separate frontend, separate data boundary and separate staff identity. Not a separate microservice.**

A separate schema does not, by itself, imply a separate application — and a separate application would not make money safer if it shared the same database credentials. What protects money is *blast radius*: who can reach the code, who can write which table, and whether one identity system can be confused with the other.

Capacity is not the concern. The console serves a handful of staff; the existing backend handles that trivially. The concerns are privilege and reachability.

### 1.2 What is separated and what is not

| Layer | Separate? | How |
|---|---|---|
| Data | **Yes** | Postgres schemas `billing` and `platform` alongside existing `public`; separate DB roles with least-privilege grants (§1.5) |
| Identity | **Yes** | Platform staff are their own identity population — not rows in the tenant `StaffRole` enum. Separate Keycloak realm/client (interim option in §9, item 3), mandatory MFA |
| Process / network | **Yes** | Second Nest bootstrap (`main.platform.ts`) mounting only `PlatformModule` + shared libs, deployed on a private host (IP allowlist or Cloudflare Access in front). The public API process never mounts `/platform/*` |
| Frontend | **Yes** | New Vite React SPA `frontend/super-admin-web`, own domain, never bundled with admin-web or candidate-web |
| Ledger logic (`LedgerService`, `billing_begin`, reconciliation) | **No** | Shared library imported by both processes; stays in the same DB transaction as session start |
| Repo / codebase | **No** | Same monorepo; shared Prisma client and `packages/shared-types` |

Illustrative layout (adapt to whatever the Step 1 audit finds):

```
backend/api/src/
  main.ts               # public API: candidate + tenant admin. No /platform routes.
  main.platform.ts      # private entrypoint: PlatformModule only
  modules/billing/      # LedgerService, billing_begin wrapper, reconciliation  (shared)
  modules/platform/     # NEW: platform-only controllers, guards, services
frontend/super-admin-web/   # NEW SPA
```

### 1.3 Why not a separate microservice

- **The ledger is on the candidate hot path.** `billing_begin()` flips `session` to `IN_PROGRESS` and decrements the pool in one Postgres transaction. Putting the ledger behind an HTTP boundary means 2,000 candidates starting at 10:00 AM depend on a network hop, and the R2/R4 guarantees (ledger = truth, one global lock order) become a distributed-transaction problem. Money is the worst place to go distributed early.
- **Team and stage.** Two builders, pre-pilot. A second deployable service adds its own CI, secrets, deploys, monitoring and on-call before there is any traffic to justify it. This is consistent with the existing decision to keep the NestJS monolith.
- **Shared types.** Prisma types and DTOs are load-bearing across both entrypoints; a second service duplicates or versions them.

### 1.4 Why not just add controllers to the existing public API

- The public process is internet-facing and takes candidate traffic spikes. Platform routes there are reachable by anyone who can reach the API host, protected only by a guard. One guard bug = platform-wide exposure.
- Spikes during a campus drive (2,000 starts) should never starve staff operations, and vice-versa.
- Different hardening needs: mandatory MFA, IP allowlist, shorter sessions, stricter rate limits, separate log stream.

### 1.5 Postgres schemas and roles (sketch — verify against your Prisma version)

| Schema | Contents | Owner (dev) |
|---|---|---|
| `public` | Existing tenant/candidate app tables | unchanged |
| `billing` | `billing_account`, `credit_pool`, `credit_ledger_entry`, `payment`, `price_book_entry`, `manual_billing_request`, `billing_audit_event`, `session_billing_evidence` | Half 2 |
| `platform` | `platform_staff`, `platform_audit_event`, `tenant_profile` (manual flags/overrides), later `impersonation_session` | Half 1 |

| DB role | Used by | Grants (sketch) |
|---|---|---|
| `proctora_app` | Public API + workers | Runtime path only: execute `billing_begin`, INSERT ledger via `LedgerService`, read `price_book_entry`. No access to `platform.*` |
| `proctora_platform` | Platform process | Read most; write `platform.*`, `price_book_entry`, `manual_billing_request`, payment records; execute approved requests through `LedgerService` |
| Both | — | No UPDATE/DELETE/TRUNCATE on ledger, audit, evidence (already in the v3 migration) |

Two consequences to handle *before* the v3 raw migration is applied anywhere beyond dev:
- Prisma multi-schema support (`schemas = [...]` + `@@schema`) must be confirmed stable on your Prisma version.
- The raw SQL (constraints, triggers, `billing_begin`, `REVOKE ... FROM proctora_app`) must be schema-qualified (`billing.credit_ledger_entry`, etc.) and `billing_begin` needs cross-schema grants on `public.session`. If the migration is already applied in a real environment, moving tables is a migration in its own right.

Honest note: for `billing`, a separate schema adds mostly ownership clarity and easier GRANTs — table-level grants already give most of the protection. For `platform` it is cleaner still. Both are fine; the point is to decide now, not after data exists.

### 1.6 Payment webhooks are the one exception

Razorpay/Stripe webhooks must be internet-reachable, so they cannot live in the private platform process. Put a thin, signature-verifying receiver in the **public** API: verify → write to a `payment_event` inbox table → enqueue (BullMQ) → a worker performs the grant through `LedgerService`. The platform console only *views* this inbox and can replay events (idempotent).

### 1.7 When to split into a true service later

| Trigger | Meaning |
|---|---|
| A separate person/team owns finance operations and on-call | Ownership boundary is real, not theoretical |
| A compliance requirement demands physical separation of the ledger service | Counsel/auditor-driven, not preference |
| Platform console load or deploy cadence measurably affects the public API | Evidence, not fear |
| A second product needs to draw from the same ledger | Ledger becomes a shared platform service |

Keep this table alive with an owner per row, like the MVP upgrade-trigger table.

---

## 2. Guardrails That Apply to Every Page

1. **No candidate PII in any v1 page.** Super admin sees tenants, tenant staff (business users), aggregates, and pseudonymous billing rows (UUIDs). Ledger rows carry plain UUID snapshots with no foreign keys to candidates (R5), so the ledger explorer *cannot* resolve a candidate name even by accident. Aggregate metrics are counts and distributions, never lists of candidates.
2. **Every write emits an audit event** — actor, action, subject, before/after, ticket reference where money or access is touched. Append-only.
3. **Money moves only through `LedgerService`.** The console never runs UPDATE on `cached_remaining` or `overdraft_used`; it creates *requests* and executes them via the service.
4. **Maker-checker is enforced by the database**, not only by the UI (`requested_by_id <> approved_by_id`). No role approves its own request.
5. **Honest empty states.** A metric with no data source yet renders "awaiting data" — never `0`, never a plausible placeholder. (Same principle as the Say-Do trust boundary: a fake-looking number is worse than none.)
6. **Read-mostly.** v1 reads far more than it writes. Every write path needs a reason field; money/access writes need a ticket reference.
7. **Roles (platform staff):** `SUPPORT` (manage tenants, create requests), `FINANCE` (approve requests, publish prices), `OWNER` (staff management, incident windows, all read access). These map to the spec's ADMIN / SUPER_ADMIN roles but live in their own enum.
8. **In-flight candidates are never interrupted** by any console action (suspending a tenant blocks *new* drives/invites, not running sessions).

---

## 3. Scope Cut

| In v1 | v2 (designed, not built) | Parked |
|---|---|---|
| Staff auth + MFA, shell, global search, audit writer | Tenant impersonation ("view as") — highest-risk feature, nothing in MVP requires it | License tiers / feature entitlements (already decided: no feature is tier-gated, price doesn't vary by tier) |
| Platform Overview, Tenants list, Tenant 360, Onboarding wizard, Trials, Audit log, Staff (read-only + seed script) | Tenant rule overrides / incident engine | |
| Billing Accounts, Pool detail, Ledger Explorer, Manual Requests (maker-checker), Price Book, Payments (manual invoice), Finance Dashboard, Integrity & Incidents | BYOK AI (changes unit economics vs. flat 1-credit pricing — needs its own decision) | |
| Retention/appeal-window override per tenant | Abuse / question-bank "dumps" review (waits on the content-protection spec) | |
| | Staff invite UI; invoice PDF / e-invoicing; self-serve gateway views (arrive with spec Phase 4) | |

---

## 4. Half 1 — Foundation & Tenant Lifecycle

**Owner: Dev 1. Owns the `platform` schema, `modules/platform/`, and the `super-admin-web` shell.**
Shape: more pages and UI/CRUD, plus the foundation everyone depends on.

### F0. Foundation (built first, used by both halves)
- **Staff login + mandatory MFA**, short idle timeout, session revocation.
- **`PlatformAuthGuard` + role decorators**, `AuditService.record()`, shared error/DTO conventions.
- **App shell:** nav, global search (tenant name, org domain, billing account ID, UUID), theme via existing Tier-1 design tokens — do not block on the Figma Phase 3 token values.
- **Dev bootstrap:** seeded dev staff so Half 2 can build against a working guard from day one (same mock-first pattern as the existing port adapters).

### H1.1 Platform Overview — `/`
- **Purpose:** "How is the platform doing, and what needs attention?" No PII.
- **Shows:** active tenants, drives by status, sessions started/completed (7/30 days), sandbox/queue health if metrics exist, infra-incident counts, trials active/expiring, and a needs-attention list (trials expiring within 7 days, failed onboardings, accounts RESTRICTED/SUSPENDED — read from Half 2's API).
- **Actions:** drill into a tenant; date-range and country filters.
- **Not v1:** real-time streaming, custom dashboards. Finance numbers live on H2.7 and are not duplicated here.

### H1.2 Tenants — `/tenants`
- **Purpose:** find and triage any tenant.
- **Shows:** name, country, lifecycle state, created, trial state, drives count, last activity, credits remaining (from H2).
- **Lifecycle state is derived, not stored twice:** ONBOARDING (wizard incomplete) → TRIAL → ACTIVE (has paid purchase) → SUSPENDED / CHURNED (manual flags in `platform.tenant_profile`). A stored status that can drift from billing data recreates the R2 problem.
- **Actions:** search/filter/sort, open Tenant 360, start onboarding, export list CSV (no PII).

### H1.3 Tenant 360 — `/tenants/:id`
Tabs:
- **Overview:** legal entity, country, created, primary admin, lifecycle state.
- **Organizations & staff:** the tenant's business users (name, email, tenant role, last login). Actions: resend invite, disable user, force logout. Never shows passwords or tokens.
- **Drives:** list with status, dates, candidate *counts* only.
- **Billing (read-only):** pools, balance, expiry, overdraft, recent ledger — served by Half 2's summary API. "Create request" deep-links into H2.4 prefilled.
- **Trial:** trial grant status, domain, expiry.
- **Settings overrides:** per-tenant override of evidence-retention days and appeal-window (bounded by legal min/max). Reason + ticket mandatory, audited, old → new value recorded.
- **Activity:** audit events for this tenant.
- **Tenant suspend / restore** (abuse or T&C): blocks new drives and invites, never running sessions. Distinct from the BillingAccount `RESTRICTED`/`SUSPENDED` states (money); define precedence when both apply.

### H1.4 Onboarding Wizard — `/tenants/new`
Six steps, draft-saveable, idempotent on double-submit, resumable after partial failure:
1. **Company:** legal entity name, country, tax ID, corporate email domain.
2. **Billing account:** created via Half 2's `BillingAccountService`; currency chosen from country.
3. **First admin:** name + corporate email on the verified domain; invite generated.
4. **Trial:** policy grant (spec: 25 credits, 30 days, one per verified corporate domain). Blocked if the domain has already received a trial; free-mail domains rejected.
5. **Walkthrough checklist:** kickoff call scheduled/done, sample drive created, first candidate session run — manual toggles in v1.
6. **Review & create.**

**What the new client gets:** an Organization, an admin-level tenant user, an empty drive list, a trial pool, and a read-only credit badge (spec §9.1). **What they do not get:** any platform access, price book, or ledger view.
**Not v1:** self-serve signup, SSO configuration. The in-app product tour is a tenant admin-web concern, not console scope.

### H1.5 Trials — `/trials`
- **Shows:** trial tenants, domain, granted date, credits used/remaining, expiry, converted-to-paid, conversion counts; free-mail blocklist.
- **Policy** (credits, days, one per domain) is displayed read-only from config in v1; changing policy is a reviewed config change, not a form field.
- **Actions:** "Extend / add trial credits" creates a **Half 2 manual request** (GOODWILL/PROMO grant, maker-checker) — never a direct edit.

### H1.6 Audit Log — `/audit`
- **Shows:** actor, action, subject (tenant/account/pool/request), date, ticket ref; before/after diff view; merges `platform_audit_event` with `billing_audit_event` (read-only union).
- **Actions:** filter, search, export. Append-only; no edit or delete UI, ever.
- **Not v1:** alerting, SIEM export.

### H1.7 Platform Staff — `/staff` (v1-lite)
- Read-only list of platform staff, roles, MFA status; disable staff. Staff are created by seed script in v1. Invite UI is v2.

---

## 5. Half 2 — Money

**Owner: Dev 2. Owns the `billing` schema, `modules/billing/` and its console pages.**
Shape: fewer CRUD pages but the highest correctness bar — ledger, maker-checker, reconciliation.

**First task:** confirm the state of spec Phase 1 (schema + raw migration + `LedgerService`). Every page below reads from it; if it is not landed, landing it *is* Half 2's Step 3.

### H2.1 Billing Accounts — `/billing/accounts` and `/billing/accounts/:id`
- **List:** account, country/currency, status, pools (active/queued), total remaining, overdraft used vs. limit, has-paid-purchase.
- **Detail:** legal entity, country, tax ID, linked organizations, pools, recent ledger, requests for this account, "reconciled as of last nightly run" badge (from H2.8).
- **Actions — all via requests, never direct edits:** change overdraft limit, set status (ACTIVE / RESTRICTED / SUSPENDED), change billing country.

### H2.2 Credit Pool Detail — `/billing/pools/:id`
- **Shows:** type, source, total (immutable), remaining, validity, clock started, activated, expires, queue order, unit price at purchase, linked payment, terms version/accepted-by, drawdown timeline, ledger entries for the pool.
- **Actions:** extend expiry → request of kind `EXPIRY_EXTEND` (the DB trigger requires request context).
- Immutable columns are shown read-only and visibly marked as such.

### H2.3 Ledger Explorer — `/billing/ledger`
- **Filters:** account, pool, entry type, reason, date range, drive UUID, session UUID, shadow toggle (default: excluded).
- **Row detail:** idempotency key, related entry (REVERSAL → original), actor / approver, linked request, payment.
- **Actions:** export pseudonymous billing CSV. No edit or delete UI. No "resolve UUID → candidate" feature.

### H2.4 Manual Requests (Maker-Checker) — `/billing/requests`
- **Tabs:** My requests · Awaiting my approval · All.
- **Create:** one typed form per kind — `GRANT`, `ADJUST`, `REFUND`, `EXPIRY_EXTEND`, `OVERDRAFT_LIMIT`, `ACCOUNT_STATUS`, `BILLING_COUNTRY`. Payload validated and non-PII; reason and ticket ref mandatory.
- **Approve / Reject** with a note. Approval executes server-side through `LedgerService` in one transaction (setting `proctora.request_id`) → `EXECUTED`. If execution fails the request stays `APPROVED` with the error and retry is safe (idempotency key derived from the request ID).
- **Rules:** requester ≠ approver (DB-enforced); requester can cancel while `PENDING`; requests pending > 24 h are highlighted.
- **Not v1:** bulk requests, delegated approvers.

### H2.5 Price Book — `/billing/pricing`
- **Shows:** SKU × billing country × version, pool type, credits, validity days, unit price in minor units, effective-from/to. Launch countries only (US, Malaysia, India).
- **Versioning:** never edit in place; publish a new version with a future-or-now effective date. Existing pools keep their purchase-time price (already immutable).
- **Tax & currency:** per-country configuration shell — rates are configuration, never hardcoded. To be reconciled with the content-protection / currency / tax spec.
- **Recommended:** publishing a new version needs `FINANCE` approval (maker-checker). See §9, item 6.
- Do not hardcode any price from either pricing doc — final pricing is validated after Phase 2 shadow data (spec decision 13).

### H2.6 Payments & Invoices — `/billing/payments`
- **Shows:** provider (MANUAL_INVOICE in v1; RAZORPAY/STRIPE when spec Phase 4 lands), status, amount, tax, currency, invoice number, linked pools, captured date; per-payment webhook event history (from the inbox in §1.6).
- **Actions:** record a manual-invoice / enterprise-PO payment → creates `Payment` then the PURCHASE grant; issue a refund (unused credits × unit price only; consumed credits are never cash-refunded); mark dispute/chargeback → pool `SUSPENDED`; replay a webhook event (idempotent).
- **Hard rule:** there is no "add credits" button that skips a `Payment` (PURCHASE) or a request (everything else).
- **Not v1:** invoice PDF, e-invoicing — depends on counsel and country rules.

### H2.7 Finance Dashboard — `/finance`
- **Metrics:** credits sold / consumed / expired (breakage) / reversed / waived (vs. the 5% cap); revenue by country and currency (never summed across currencies without an explicit conversion note); overdraft outstanding and aged > 14 days; top-ups; refunds/chargebacks; Drive Pass vs. Talent Reserve mix; AI cost per session and the 30-day rolling figure vs. the 25% margin alarm.
- **Honest data rule:** AI-cost metrics need Phase 2 shadow telemetry — show "awaiting data" until it exists.
- **Filters:** date range, country, tenant. Export aggregate CSV. **Not v1:** forecasting, tax reports.
- Built last: it needs real data to be worth looking at.

### H2.8 Integrity & Incidents — `/billing/integrity`
- **Reconciliation tab:** the nightly 7-point check (pool integrity, overdraft integrity, session-acquisition 1:1, expiry sweeper, topology invariant, payment proof, WORM backup hash) — per-check pass/fail, drift detail, run history, manual re-run.
- **Shadow mode tab (Phase 2):** shadow vs. actual comparison, progress against the exit gate (> 10,000 attempts, 100% reconciled, zero duplicates), per-session cost distribution.
- **Incidents tab:** declare an incident window (start/end, reason; `OWNER`, maker-checker recommended) → candidate list for T3 reversals; log of automatic T1–T3 reversals; HOLD / capacity events (drives at capacity, held sessions, top-up alert status).
- **Backups tab:** WORM export status and last hash match.
- **v1 alerting:** a red banner on Overview and this page when any check fails. No pager integration yet.

---

## 6. The Seam Between the Halves

The two halves touch in a small, explicit set of places. Agree these DTOs and endpoints in Step 4 **before** deep build; each side mocks the other until it lands.

| Half 1 needs from Half 2 | Half 2 needs from Half 1 |
|---|---|
| `GET /platform/billing/accounts/:id/summary` (balance, pools, status, overdraft) — feeds Tenant 360 Billing tab and Overview | `PlatformAuthGuard` + role decorators |
| `BillingAccountService.createForOrganization(...)` — onboarding step 2 | `AuditService.record()` |
| `TrialGrantService.grantTrial(billingAccountId)` — onboarding step 4 (policy-bound, system-executed) | `GET /platform/tenants/:id/brief` (name, country) to label accounts |
| `POST /platform/billing/requests` — trial extension and prefilled requests from Tenant 360 | App shell, nav, UI kit, global search hook |

**One flag on trials.** The v3 SQL constraint leaves `TRIAL` grants without a required `request_id`, while R8 says all manual credit creation is maker-checked. Reconcile by treating the onboarding grant as a *policy-bound system action* (fixed amount, one per verified domain enforced by the unique `trial_domain`), and any extension as a normal maker-checker `GRANT`. See §9, item 5.

---

## 7. Steps to Start

**Step 0 — Decision session (both, about half a day).**
Sign off §9 items 1–4 and write the outcomes into this doc as locked. Nothing below starts before this.

**Step 1 — Read-only discovery audit (both; each audits their half).**
Same discipline as every other workstream: audit first, then implement. Check:
- Is the billing v3 schema/migration merged or applied anywhere? Does `Organization.billingAccountId` exist? Is `LedgerService` real or a stub?
- Auth today: dev-JWT vs. Keycloak state, current `StaffRole` values, where roles are enforced. (Keycloak cutover was still pending at the last audit.)
- Where `beginSession` lives, and whether the two known side-door transitions (`proctoring.service.ts`, `sql.service.ts`) are already routed through it.
- Existing Settings service (retention days), Drive/Invite/Organization modules the console will read.
- How routing and Cloudflare currently split paths; how to expose a private host.
- Prisma version and multi-schema feasibility; how raw migrations are run.
Output: a findings section appended here. No code.

**Step 2 — Scaffold (Dev 1; Dev 2 reviews).**
`main.platform.ts` + `PlatformModule`; second process in the Docker Compose topology on a private host; `frontend/super-admin-web` (Vite + React + TS + Tailwind, Tier-1 tokens); CI builds all three. **Exit test:** the public process returns 404 for `/platform/*`.

**Step 3 — Data foundation (each dev on their own schema, in parallel).**
- Dev 1: `platform` schema — `platform_staff`, `platform_audit_event`, `tenant_profile`; `proctora_platform` role and grants.
- Dev 2: land or confirm billing v3 Phase 1, schema-qualified per §1.5; grants for both roles.
- **Before applying the v3 raw SQL, fix two identifier slips:** `billing_begin`'s ledger inserts use `actorId` (the column is `actor_id`), and `guard_credit_pool_mutation` references `OLD.activatedAt` (the column is `activated_at`). Both will fail when first executed.

**Step 4 — Contract first.**
Each dev writes DTOs / OpenAPI for their §6 endpoints plus a mock adapter, and merges them. From here neither blocks the other.

**Step 5 — Build in order.**

| Half 1 | Half 2 |
|---|---|
| 1. F0 auth, shell, audit writer | 1. Accounts and Pool detail (read pages) |
| 2. Tenants list + Tenant 360 (read-only) | 2. Ledger Explorer |
| 3. Onboarding wizard | 3. Manual Requests (maker-checker) — the core |
| 4. Trials | 4. Integrity & Incidents (needed for the Phase 2 exit gate) |
| 5. Platform Overview | 5. Payments (manual invoice) |
| 6. Audit Log | 6. Price Book |
| 7. Settings-overrides tab, Staff page | 7. Finance Dashboard |

**Step 6 — Integration checkpoint (both).**
One end-to-end scenario: onboard a tenant → trial grant appears in the ledger → Tenant 360 shows the balance → SUPPORT creates a credit request → FINANCE approves → ledger row written → reconciliation passes → every step visible in the audit log.

**Step 7 — Hardening gate.** All items in §8 green.

**Balance valve:** Half 1 carries more pages and the foundation; Half 2 carries the harder correctness work. If either runs behind, the Finance Dashboard (H2.7, read-only aggregates) can move to Dev 1 once Overview is done — it is similar chart work with no ledger writes.

---

## 8. Definition of Done (add to both devs' checklist)

- Platform routes return 404 from the public process (automated test).
- Every write endpoint emits an audit event; verified by test.
- No endpoint or DTO in the console returns candidate name, email or results (contract test).
- No code path in the console updates `cached_remaining` or `overdraft_used` outside `LedgerService`.
- Maker-checker rejection is exercised at the **database** level, not only the UI.
- Candidate API contract test from spec §9.4 still passes (no `credit*`, `balance*`, `billing*`, `overdraft*` fields).
- Metrics without a data source render "awaiting data".
- Staff MFA cannot be disabled by any console action.
- Suspending a tenant does not affect a running candidate session (tested).

---

## 9. Open Decisions Requiring Sign-Off

1. **Deployment shape.** Modular monolith + second entrypoint + separate SPA (recommended) vs. same process vs. true microservice.
2. **Postgres schemas.** `billing` + `platform` with separate DB roles (recommended) — decide before the v3 raw migration ships beyond dev, because it changes the SQL.
3. **Platform staff identity.** Separate Keycloak realm (recommended). If the Keycloak cutover isn't done, the interim is a separate JWT issuer/audience with mandatory TOTP, and the cutover then includes this realm — otherwise platform staff would ride the dev-JWT path.
4. **Impersonation.** v2 (recommended). When it comes: read-only, time-boxed, ticket + reason mandatory, candidate PII masked unless the tenant explicitly grants support access, visible in the tenant's own audit view.
5. **Trial grants.** System-executed policy grant vs. maker-checked; and whether the 30-day trial clock starts at grant or first draw (spec §6.2's floating clock is written for Talent Reserve, decision 9 says "30-day validity").
6. **Maker-checker scope.** Should Price Book publication and incident-window declaration also require two actors? (Recommended: yes for both — they move money indirectly.)
7. **Webhook receiver.** Thin inbox in the public API, processing in a worker (recommended, §1.6).
8. **Doc conflicts to clean up.** The Explained guide uses ₹50 per seat and a flat 5,000-link ceiling; the spec says ₹60 India pricing and a 5:1 invite guard tied to usable credits. Per the spec's precedence rule the spec wins — update the Explained guide so it doesn't get implemented by mistake.

---

*Live document — update in place as decisions lock and as the Step 1 audit findings land.*
