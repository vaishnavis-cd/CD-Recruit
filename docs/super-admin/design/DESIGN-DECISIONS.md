# Technical Design Decisions & Architecture Decision Records (ADRs)

**System:** Proctora / CD-Recruit Platform Ops & Billing Engine  
**Status:** Approved Architecture Decisions  
**Classification:** Internal Technical Architecture  
**Scope:** Super Admin / Platform Ops (Half 1) & Credit/Billing Engine (Half 2)  
**Stakeholder Decisions Applied:** 2026-09-28 (Ragul Arumugam Sign-Off)

---

## ADR-001: Super Admin Backend Deployment Boundary & Fault Isolation

### Status
`LOCKED` (Approved: Dual-Process Modular Monolith via Containerization)

### Context & Problem Statement
If the monolith runs as a single deployable Node.js process serving Candidates, Recruiters, and Super Admins on one port:
- **Blast Radius Problem:** If 10,000 candidates attempt an assessment at 10:00 AM causing high CPU, event loop starvation, Node.js heap out-of-memory (OOM), or Postgres connection pool exhaustion, **the Super Admin console crashes simultaneously**. Platform staff cannot log in, cannot triage the outage, cannot declare an incident window, and cannot see platform telemetry.
- **The Alternative Extremes:**
  - *Option B (Single Monolith Process):* Zero operational isolation. Candidate traffic storms directly starve staff ops.
  - *Microservices (Separate App communicating "via API alone"):* Super Admin runs in a completely separate repo/database and manages billing via HTTP REST calls. This introduces an operational disaster: distributed transactions for credit deductions, network latency on the candidate hot path (`beginSession`), 2-Phase Commit / Saga orchestrators, duplicated schemas and DTOs, and brittle distributed tracing.

### Architectural Decision & Verdict
**Adopt the Dual-Entrypoint Modular Monolith (Scope & Split §1.1–§1.4):**

```
                              SINGLE CODEBASE & MONOREPO
                                          │
                   ┌──────────────────────┴──────────────────────┐
                   ▼                                             ▼
           PUBLIC API PROCESS                           PLATFORM OPS PROCESS
           (entrypoint: main.ts)                    (entrypoint: main.platform.ts)
           • Candidate Exam API                          • Super Admin Panel API
           • Recruiter Admin Web API                     • Billing & Finance Console
           • Public Webhook Ingress                      • Tenant Onboarding Wizard
           • Port: 3000 (Internet / Cloudflare)          • Port: 3001 (Private VPC / IP Allowlist)
                   │                                             │
                   └──────────────────────┬──────────────────────┘
                                          ▼
                             POSTGRESQL MULTI-SCHEMA DB
                       Schemas: public, billing, platform
```

1. **How Deployment & Containerization Occurs:**
   - Both processes build from the **exact same codebase** and produce the **exact same Docker image**.
   - In Docker Compose / AWS ECS / Kubernetes, two container services are defined from that image:
     - `proctora-public-api`: Runs `node dist/main.js`. Mounted to public ingress.
     - `proctora-platform-api`: Runs `node dist/main.platform.js`. Bound strictly to internal VPC / Cloudflare Access.
2. **Failure Isolation:**
   - If candidate traffic crashes `proctora-public-api`, **`proctora-platform-api` remains 100% operational**.
   - Staff can immediately log into Super Admin, inspect error rates, declare an `IncidentWindow`, pause drives, or adjust configurations.
3. **No Microservice Overhead:**
   - Zero distributed transactions: `LedgerService` and `billing_begin` execute inside native PostgreSQL transactions with zero HTTP hops.
   - Shared Prisma client, zero DTO duplication, unified CI pipeline.
4. **Reliability at Scale:**
   - Proven pattern used by Shopify, Stripe, and GitHub to achieve fault isolation without microservice sprawl.

---

## ADR-002: Platform Staff Identity & Role Architecture

### Status
`LOCKED` (Approved: Scope & Split Segregated Model)

### Context & Decision
Following stakeholder review, platform operators must have an isolated identity boundary separate from tenant business recruiters:
1. **Physical Entity Segregation:** Platform staff live in a dedicated table `platform.platform_staff` in the `platform` PostgreSQL schema.
2. **Dedicated Role Enum:** Platform staff roles are governed by:
   ```prisma
   enum PlatformStaffRole {
     SUPPORT    // Platform Support: View accounts, triage tenants, create requests. CANNOT approve money.
     FINANCE    // Platform Finance: Approve manual requests, publish prices, record POs, declare incidents.
     OWNER      // Executive / DevOps: All platform operations, staff management, emergency controls.
   }
   ```
3. **Tenant Role Distinction:** Tenant recruiters remain in `public.staff` with roles `RECRUITER`, `HR_LEAD`, `HR_ASSOCIATE`, and the bundled tenant-side `OWNER`.
4. **Token Isolation:** Platform JWT tokens are signed with a distinct secret/issuer (`proctora-platform`) and verified strictly by `PlatformAuthGuard`. A tenant recruiter token is rejected on all `/platform/*` routes.

---

## ADR-003: Database Persistence Model (PostgreSQL Multi-Schema)

### Status
`LOCKED` (Approved: Scope & Split Multi-Schema Architecture)

### Context & Decision
The database persistence model will segregate tables into three distinct PostgreSQL schemas using Prisma 5.22's `multiSchema` capability:
1. **`public`**: Candidate, session, drive, question, and recruiter staff tables.
2. **`billing`**: Payer accounts, credit pools, append-only ledger, payments, price book, and reconciliation runs.
3. **`platform`**: Platform staff, impersonation sessions, override actions, incident windows, and tenant profiles.
4. **Least-Privilege Database Roles:**
   - `proctora_app`: Used by public API. Runtime path only: execute `billing_begin`, INSERT ledger, SELECT price book. Denied access to `platform.*`.
   - `proctora_platform`: Used by platform process. Full access to `platform.*` and `billing.*`.
   - Both roles: Forbidden from executing `UPDATE`, `DELETE`, or `TRUNCATE` on append-only financial and audit tables.

---

## ADR-004: Overdraft Feature Elimination

### Status
`LOCKED` (Approved: Absolute Elimination of Overdraft)

### Context & Decision
Following product and executive sign-off, **the overdraft feature is completely eliminated**:
1. `overdraftLimit` is fixed to `0` permanently for all accounts.
2. "Uncollateralized debt" is eliminated from the business model. No tenant can start a live assessment without pre-funded credits.
3. When a drive exhausts its Drive Pass credits, extra candidates enter the polite **`HOLD`** waiting room while the recruiter is alerted for **1-Click Top-Up** (charging their saved card or pre-funded wallet) or Talent Reserve fallthrough.
4. Direct database balance mutations, "Emergency Overdraft" shortcuts, and discretionary overdraft increases are structurally removed.

---

## ADR-005: Question Snapshot Immutability (No Mid-Drive In-Place Edits)

### Status
`LOCKED` (Approved: Question Bank Version Snapshotting)

### Context & Decision
1. In-place modification of questions during an active assessment drive is strictly forbidden.
2. Correcting a typo or bug on an active drive creates a new immutable Question version (`version = version + 1`).
3. **Rebind Policy:** The new version snapshot binds strictly to sessions that have **not yet started** (`status = NOT_STARTED`).
4. Any candidate session that has already transitioned to `IN_PROGRESS`, `SUBMITTED`, or `CLOSED` retains the exact question snapshot presented at start.

---

## ADR-006: PII-Blind-by-Default Architectural Boundary

### Status
`LOCKED` (Approved: Intent §Data & Privacy Compliance)

### Decision
1. **Aggregate Default Views:** Super Admin views show aggregate metrics, counts, and metadata only. Never a rendered candidate roster.
2. **Ledger Pseudonymity (R5):** Ledger rows store plain UUID snapshots with zero foreign keys to candidate identity tables.
3. **Impersonation Boundary (F10):** Candidate PII is visible to staff only through an audited, time-boxed (30 min) `ImpersonationSession` requiring a mandatory ticket reference, carrying tenant-only authority, and writing dual-audit logs.

---

## ADR-007: Pricing Catalog Baseline (Provisional ₹50 Launch Standard)

### Status
`LOCKED` (Approved: Provisional ₹50 / Seat Catalog Baseline)

### Decision
1. In accordance with executive direction, the initial seed price for India Drive Pass will be configured at **₹50 / credit** (represented as `5000` minor units / paise in `price_book_entry`).
2. Final commercial pricing will be validated after Phase 2 shadow mode measures real infrastructure token costs.
3. Because all pricing is versioned (`version = 1`), updating prices later requires zero database migration—simply publishing a new `PriceBookEntry` version.

---

## ADR-008: Bounded Data Retention & Appeal Window Policy

### Status
`LOCKED` (Approved: Pragmatic Retention & Appeal Architecture)

### Decision
1. **Standard Baseline:** 30 days biometric evidence retention + 14 days candidate appeal window (total 44 days).
2. **Per-Tenant Override:** Managed via `organization.appeal_window_days_override` (int4):
   - Standard Enterprise Range: Bounded between **14 and 90 days** (can be configured by `SUPPORT` / `ADMIN`).
   - High-Compliance Range (Banking/Gov): Up to **365 days** (requires `FINANCE` / `SUPER_ADMIN` or `OWNER` sign-off + compliance ticket reference).
   - Check Constraint: `CHECK (appeal_window_days_override BETWEEN 14 AND 365)`.
3. **Automated Purge Execution:**
   - Daily BullMQ cron job (`retention-cleanup`) computes per-tenant cutoff:
     $$\text{cutoff} = \text{now}() - (30\text{ days} + \text{COALESCE}(\text{appeal\_window\_days\_override}, 14\text{ days}))$$
   - Purges raw WebM webcam anomaly clips from MinIO and deletes face verification embeddings from Postgres.
   - Retains pseudonymous session score metadata and financial ledger records forever.

---

## ADR-009: Search Path Hijacking Prevention in Stored PL/pgSQL

### Status
`LOCKED` (Approved: Security Hardening of PostgreSQL Stored Functions)

### What is Search Path Hijacking in a Nutshell?
In PostgreSQL, when a function or query runs without schema qualification (e.g. `SELECT * FROM credit_pool`), Postgres searches schemas in the order defined by `search_path`. If a malicious actor or third-party extension creates a rogue table or function named `credit_pool` in a schema searched earlier (such as `public`), the stored procedure inadvertently queries or updates the attacker's table instead of `billing.credit_pool`.

### Prevention Decision:
1. Every stored function (`billing_begin`, triggers) must be declared with `SECURITY DEFINER` (if elevated) and a pinned, explicit search path:
   ```sql
   SET search_path = pg_catalog, billing, platform, public;
   ```
2. Every table reference inside SQL triggers and functions must be **fully schema-qualified**:
   - `billing.credit_pool`
   - `billing.credit_ledger_entry`
   - `public.session`
   - `public.organization`

---

## ADR-010: Phase 0 Side-Door Session Gateway Remediation

### Status
`LOCKED` (Approved: Immediate Phase 0 Refactoring)

### Decision
1. Before applying the PostgreSQL trigger `guard_session_start`, all direct updates to `session.status = IN_PROGRESS` in existing codebase services must be refactored to route strictly through `SessionService.beginSession()`:
   - `proctoring.service.ts` (line 228)
   - `sql.service.ts` (lines 114 & 247)
   - `coding.service.ts` (line 138)
   - `mcq.service.ts` (line 138)
2. This guarantees that when `guard_session_start` goes live, candidates running SQL queries, running code, answering MCQs, or uploading proctoring evidence will never encounter trigger abort exceptions.
