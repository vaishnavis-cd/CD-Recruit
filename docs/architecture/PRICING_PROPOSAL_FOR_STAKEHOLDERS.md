# Stakeholder Proposal: Proctora Pricing, Credit Pools & Financial Ledger Architecture

> **Purpose:** Internal proposal and architectural defense document prepared for Engineering Leadership, Product Management, and Technical Colleagues.  
> **Topic:** Transitioning Proctora from an unmetered/seat-based model to an **Assessment Credit Pool & Immutable Ledger System**.  
> **Author:** Engineering Team  
> **Companion Document:** [`PRICING_AND_CREDIT_POOL_SPECIFICATION.md`](file:///d:/Projects/cd-recruit/codebase/docs/architecture/PRICING_AND_CREDIT_POOL_SPECIFICATION.md)  
> **Date:** September 2026

---

## 1. Executive Summary (The 60-Second Pitch)

### The Business Challenge
Traditional SaaS billing ("$50/recruiter/month") does not match recruitment realities. A customer might hire 2,000 campus graduates in September and only 10 lateral engineers in October. When customers are billed per seat, they share passwords or churn during hiring lulls. When they are billed post-facto via invoice, high-volume campus drives lead to bill shock, dispute escalations, and unpaid invoices.

### The Proposed Solution
We propose an **Assessment Credit Pool Model** with an **Append-Only Financial Ledger**:
1. **The Billable Currency:** $\mathbf{1\text{ Credit} = 1\text{ Live Assessment Attempt}}$. Setup, question creation, candidate link generation, pre-flight device checks, and network reconnects are **100% free**.
2. **Two Complementary Commercial Products:**
   * **Drive Pass (Event-Anchored):** High-volume, short-validity pass locked to a specific campus drive or hackathon.
   * **Talent Reserve (Flexible Reserve):** Long-term credit pack (e.g. 1,000 credits for 180 days) using a sequential "floating clock" that only starts upon first usage.
3. **Enterprise Grade Financial Safety:**
   * **Zero Double-Billing Guarantee:** Mathematically guaranteed via raw PostgreSQL partial unique indexes and atomic fast-path claims.
   * **High Concurrency Performance:** A two-tier begin engine capable of absorbing 2,000 simultaneous starts in 10 seconds without database advisory lock contention.
   * **Safe Phased Rollout:** A 2-week zero-risk **Shadow Mode** in production where candidate starts exercise the full billing path under an isolated database savepoint before a single credit is ever deducted.

---

## 2. Why Existing Workflows & Our Codebase Need This

During our technical audit of the Proctora codebase, we identified three critical realities that require this architectural approach:

### A. The Synchronized Start Spike (Campus Drives)
* **The Reality:** In campus drives, colleges release links at a set time (e.g., 10:00:00 AM). 1,000 to 2,000 candidates click *"Start"* within a 10-second window.
* **The Risk:** In typical implementations, transactions take a tenant-level advisory lock (`pg_advisory_xact_lock(orgId)`). This serializes 2,000 transactions, blowing through Prisma's connection pool, hitting interactive transaction timeouts, and starving background heartbeats for active test-takers.
* **Our Solution:** A **Two-Tier Engine**. The 99% fast path uses a single row-level conditional `UPDATE credit_pool SET cached_remaining = cached_remaining - 1 WHERE id = :id AND cached_remaining >= 1`. The row lock is held for $<2\text{ms}$. Only when a pool is completely empty does a start take the slower advisory lock to promote the next pool.

### B. Candidate Disconnections & Network Resilience
* **The Reality:** Indian campus WiFi, hostel networks, and power cuts cause drops. Our platform already features a robust `resumeSession()` flow within a 5-minute grace window.
* **Our Guarantee:** A reconnection **never** bills a credit. The billing hook is isolated strictly to the `NOT_STARTED` $\rightarrow$ `IN_PROGRESS` transition in `beginSession()`. Reconnections resume from `DISCONNECTED` $\rightarrow$ `IN_PROGRESS` and bypass billing entirely.

### C. Side-Door State Transitions Found in Our Codebase
* **Audit Finding:** In our codebase audit, we found that `proctoring.service.ts` (line 228) and `sql.service.ts` (line 114) contain fallback logic that auto-transitions a session to `IN_PROGRESS` if evidence is uploaded or SQL is run while in `NOT_STARTED`.
* **Action Required:** If we deployed database constraints without addressing this, those background tasks would bypass billing or throw unexpected exceptions. Our rollout plan includes a dedicated **Phase 0** to re-route these side doors strictly through `beginSession()`.

---

## 3. Product Architecture: The Two Commercial Offerings

```
                              CUSTOMER ACCOUNT
                                     │
           ┌─────────────────────────┴─────────────────────────┐
           ▼                                                   ▼
     PLAN A: DRIVE PASS                                  PLAN B: TALENT RESERVE
     (Event-Anchored Pack)                               (Flexible Talent Pool)
     • Targeted to Campus / Hackathons                   • Targeted to Lateral Hiring
     • Tied to specific driveId                          • General account-wide pool
     • Fixed calendar expiry at drive close              • Sequential "Jio" floating clock
     • Consumed FIRST by candidates in that drive        • Countdown starts on FIRST DRAW
```

### The "Jio Model" Sequential Activation Engine
How do we solve the problem of customers purchasing multiple packs with overlapping dates?
* **Problem:** A customer with an active 6-month reserve buys a 2-day Drive Pass for a Friday campus hiring event. If the Drive Pass queues behind the 6-month pool, it will expire unused!
* **Our Solution (Drive-Anchored Priority):**
  1. If a drive has an active, unexpired **Drive Pass**, candidates in that drive consume from that pass first.
  2. If the Drive Pass runs out, or for any standard lateral drive, consumption falls through to the active **Talent Reserve**.
  3. Queued Talent Reserve packs do not run down their clock while waiting in line. Their validity period begins on **first credit draw** (capped at a maximum wait of 12 months to prevent stale liability on our balance sheet).

---

## 4. Financial & Engineering Safeguards

| Concern | The Danger | Our Architectural Guardrail |
|---|---|---|
| **Double Billing** | Retried API calls or candidate double-clicks bill twice. | Database-level partial unique index: `uq_ledger_one_acquisition_per_session` on `(session_id)` for `CONSUME`, `OVERDRAFT`, `WAIVE`. Namespaced idempotency keys (`acquire:{sessionId}`). |
| **Database Bloat** | Customer uploads 500,000 candidate emails for a 50-credit pool. | **5:1 Bloat Guard:** Total outstanding account invites cannot exceed $5 \times$ usable credits at the drive date. Centralized across all 4 intake paths. |
| **Data Erasure vs Financial Ledger** | GDPR/DPDP candidate deletion purges fail due to `Restrict` FKs on the ledger. | **Rule R5:** Ledger stores **plain UUID snapshots** of `sessionId`, `candidateId`, `driveId`, and `organizationId` with **no foreign keys**. Candidate rows can be purged or anonymized without violating ledger constraints. |
| **Rogue Admin / Tampering** | Admin manually adds 10,000 credits or deletes ledger entries. | **Rule R8:** Database trigger revokes `UPDATE` and `DELETE` on the ledger table. All manual adjustments require **Maker-Checker Dual Authorization** (`requested_by != approved_by`). |
| **Candidate #501 (Capacity Limit)** | 500-credit drive gets 505 candidates; candidate #501 sees a crash. | **Configurable Overdraft:** Paid customers get an automatic emergency buffer ($\le 10\%$, max 25). If overdraft is exhausted, candidate enters a polite **HELD waiting room** with an honest message—never an error code. |
| **Infrastructure Faults** | Candidate's test fails due to our server error or container crash. | **Automated Platform-Fault Reversals:** If telemetry detects `PLATFORM_FAULT` or zero questions rendered, the system automatically writes a `REVERSAL` ledger entry without requiring recruiter intervention. |
| **Runaway AI Costs** | Candidate writes 10,000-word essay, blowing up LLM grading costs. | **Token Ceilings:** Server enforces 4,000 input / 1,000 output token caps per question. Flat 1-credit price remains highly profitable. |

---

## 5. Phased, Zero-Risk Rollout Strategy

We are not flipping a switch on day one. We propose a 4-phase rollout where code is battle-tested with real production traffic before any financial enforcement begins:

```
┌───────────────────┐     ┌───────────────────┐     ┌───────────────────┐     ┌───────────────────┐
│      PHASE 0      │     │      PHASE 1      │     │      PHASE 2      │     │      PHASE 3      │
│  Codebase Audit   │ ──► │  Schema Migration │ ──► │ Zero-Risk Shadow  │ ──► │ Full Live Cutover │
│  & Cleanup        │     │  & DB Constraints │     │ (2 Weeks Pilot)   │     │ & Enforcement     │
└───────────────────┘     └───────────────────┘     └───────────────────┘     └───────────────────┘
```

### Phase 0: Codebase Alignment (1 Week)
* Re-route the side-door `IN_PROGRESS` transitions in `proctoring.service.ts` and `sql.service.ts` through `beginSession()`.
* Add `BILLING_ADMIN` to `StaffRole` in `@cd-recruit/shared-types` and `schema.prisma`.

### Phase 1: Database Migration (1 Sprint)
* Deploy Prisma models: `BillingAccount`, `CreditPool`, `CreditLedgerEntry`, `Payment`, `PriceBookEntry`, `ManualBillingRequest`, `SessionBillingEvidence`.
* Execute raw SQL migration for partial unique indexes, append-only triggers, and pool immutability.
* Backfill one `BillingAccount` per existing `Organization`.
* Add CI Schema Invariant Tests to ensure future migrations never drop these triggers.

### Phase 2: Production Shadow Mode (2 Weeks)
* Set `BILLING_MODE=shadow`.
* Every candidate session start calls `billing_begin(sessionId, 'shadow')`.
* Shadow rows are inserted inside a database **SAVEPOINT** that swallows any error. **A shadow billing failure can NEVER fail a candidate's real exam.**
* **What We Measure in Shadow Mode:**
  1. Exact candidate show-up rates across campus vs lateral drives (recalibrating our capacity estimators).
  2. Actual LLM token costs and grading latency per candidate.
  3. Nightly ledger reconciliation: verify 100% agreement with zero discrepancies across $>10,000$ test sessions.

### Phase 3: Live Enforcement & UI
* Set `BILLING_MODE=enforce`.
* Seed customer starting balances as audited `MIGRATION` grants.
* Enable Admin Web credit badges, drive budget estimators, and the polite HELD candidate screen.
* Activate the PostgreSQL `guard_session_start` trigger.

### Phase 4: Self-Serve Gateways
* Connect Stripe and Razorpay webhooks with duplicate payment protection.

---

## 6. Management Sign-Off: Key Decisions Formulated

To proceed with Phase 1, we request leadership approval on the following key operational parameters:

| # | Parameter | Proposed Default | Business Rationale |
|---|---|---|---|
| **1** | **Drive Pass Fallthrough** | **`ALLOW`** | If a campus pass runs out, draw from Talent Reserve rather than halting candidate #501, and alert recruiter. |
| **2** | **Overdraft Ceiling** | **$\min(10\%, 25\text{ credits})$** | Protects candidate experience during unexpected turnouts while bounding credit exposure to safe limits. |
| **3** | **Maker-Checker Policy** | **Strict (Always 2 actors)** | No single individual can mint or adjust credits. Complete audit protection against internal fraud. |
| **4** | **Jittered Auto-Start** | **0–8 seconds random jitter** | Flattens 2,000-candidate traffic bursts on PostgreSQL at scheduled start times without candidate perception. |
| **5** | **HELD Max Duration** | **30 minutes** | If an org runs out of credits, candidate waits max 30 min before automatic rescheduling token is issued. |
| **6** | **Trial Allocation** | **25 credits / 30 days** | Limited to 1 trial per verified business domain; free email domains (Gmail/Yahoo) rejected. |
| **7** | **Regional Pricing** | **INR ₹60 / USD $2** | Anchored to customer Legal Entity Country + Tax ID (GSTIN/EIN) to prevent currency arbitrage. |
| **8** | **Courtesy Waivers** | **5% of drive volume** | Recruiter can grant re-attempts for verified hardware failures, capped to prevent abuse. |

---

## 7. Stakeholder Q&A: Preparing for Tough Questions

### Q1: *"Will the database locks slow down candidate tests during a 2,000-person campus drive?"*
> **Answer:** No. We specifically rejected the naive approach of taking an organization-wide advisory lock on every start. Our **Fast Path** performs an atomic row-level decrement on the active pool that holds the row lock for less than 2 milliseconds. Benchmarks show PostgreSQL can sustain over 5,000 such atomic decrements per second. The advisory lock is only acquired on the rare 1% slow path when a pool is completely exhausted.

### Q2: *"What happens if a candidate's internet disconnects mid-test? Do they get charged again when they reconnect?"*
> **Answer:** Absolutely not. Billing occurs **strictly once** at the `NOT_STARTED` $\rightarrow$ `IN_PROGRESS` transition. When a candidate drops and reconnects, they hit `resumeSession()`, which transitions `DISCONNECTED` $\rightarrow$ `IN_PROGRESS`. This path does not touch the billing engine. Furthermore, our database partial unique index guarantees that a session ID can exist in the acquisition ledger at most once.

### Q3: *"What if a candidate sits in the waiting room with their laptop open and walks away?"*
> **Answer:** They will not be billed. Auto-start at scheduled time T requires active presence: a WebSocket heartbeat within 15 seconds **and** human interaction (mouse, keyboard, or touch) within the last 60 seconds. An unattended open tab fails the presence check, remains in `NOT_STARTED`, and incurs zero charge.

### Q4: *"Can a customer wipe candidate data for GDPR compliance without breaking our financial reporting?"*
> **Answer:** Yes. This was a core architectural fix in v3 (Rule R5). The financial ledger holds plain UUID snapshots of `session_id`, `candidate_id`, and `drive_id` with **no foreign keys**. Candidate and Session records can be purged, anonymized, or soft-deleted in accordance with retention laws without throwing foreign key constraint errors or deleting financial history.

### Q5: *"Why did we remove the 1.5-credit AI Interviewer Tier?"*
> **Answer:** Two reasons:
> 1. **Architectural consistency:** Proctora has a hard principle that no non-deterministic live LLM generation runs in the candidate's active testing path. LLM evaluation happens post-test during grading. Calling it an "interviewer tier" was misleading.
> 2. **Financial simplicity:** Fractional credits (1.5) require floating-point or decimal arithmetic in TypeScript, which invites precision bugs. Integer credits ($1\text{ Credit} = 1\text{ Attempt}$) are clean, intuitive to recruiters, and easy to reconcile.

---

## 8. Next Steps & Timeline

1. **Review & Sign-Off:** Review this proposal and sign off on the 8 key operational decisions (§6).
2. **Phase 0 (Days 1–5):** Re-route side-door transitions in `proctoring.service.ts` and `sql.service.ts`; add `BILLING_ADMIN` role.
3. **Phase 1 (Days 6–15):** Deploy schema migration and raw PostgreSQL triggers in staging; run CI invariant test suite.
4. **Phase 2 (Days 16–30):** Enable `BILLING_MODE=shadow` on pilot drives; collect real cost telemetry and verify nightly reconciliation.
5. **Phase 3 (Day 31+):** Enable live enforcement, seed migration balances, and unveil Admin Web billing dashboard.
