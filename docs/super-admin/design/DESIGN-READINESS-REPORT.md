# Technical Design Readiness Report

**System:** Proctora / CD-Recruit Platform Ops & Commercial Engine  
**Tracking Document:** `docs/super-admin/design/DESIGN-READINESS-REPORT.md`  
**Phase:** Requirements & Technical Design Phase (Pre-Implementation Gate)  
**Date:** September 28, 2026  
**Lead Evaluator:** Antigravity AI Assistant  
**Target Stakeholder:** Ragul Arumugam (Technical & Product Lead)  

---

## 1. Executive Verdict

### Can Implementation Start?
# **`READY FOR IMPLEMENTATION (PHASE 0 APPROVED)`**

### Summary Rationale
Following technical review and stakeholder sign-off by **Ragul Arumugam** on September 28, 2026:
- **ADR-001 (Deployment Boundary):** Approved as **Dual-Process Modular Monolith** (`main.platform.ts` running as a distinct private container for complete fault isolation).
- **ADR-002 (Identity Model):** Approved as **Scope & Split Model** (`platform.platform_staff` table with `PlatformStaffRole`: `SUPPORT`, `FINANCE`, `OWNER`).
- **ADR-003 (Database Persistence):** Approved as **PostgreSQL Multi-Schema** (`public`, `billing`, `platform` via Prisma 5.22 `multiSchema`).
- **ADR-004 (Overdraft Elimination):** Approved as **Permanently Eliminated** (`overdraftLimit = 0`, zero debt).
- **ADR-005 (Question Snapshots):** Approved as **Versioned Snapshots** (no raw mid-drive in-place edits).
- **ADR-007 (Pricing Baseline):** Approved as **₹50 / seat** initial provisional launch baseline.
- **ADR-008 (Data Retention Override):** Approved as **30 days base + 14–90 days override** (up to 365 days for compliance extreme).
- **ADR-010 (Phase 0 Authorization):** **Immediate refactoring of Phase 0 side doors approved for execution.**

Zero blocking architectural open questions remain. Implementation may proceed immediately starting with **Phase 0 side-door cleanup**.

---

## 2. Seven Required Design Artifacts Verification

| Artifact | File Name | Status | Completeness & Consistency Check |
|---|---|---|---|
| **Artifact 01** | `01-half2-domain-and-scope.md` | ✅ **Complete** | Normalized F1–F13; modeled 14 entities; complete source-of-truth matrix. |
| **Artifact 02** | `02-half2-business-rules-and-invariants.md` | ✅ **Complete** | Invariants R1–R9 defined; 30 domain invariants with rule, reason, enforcement, and violation consequences. |
| **Artifact 03** | `03-half2-database-schema.md` | ✅ **Complete** | Multi-schema `billing`, `platform`, `public` tables; triggers, constraints, indexes, and 5-phase migration sequence. |
| **Artifact 04** | `04-half2-services-and-api-contracts.md` | ✅ **Complete** | 8 service boundaries; 24 API endpoints; full DTO definitions with validation rules. |
| **Artifact 05** | `05-half2-api-catalogue-and-page-specifications.md` | ✅ **Complete** | Complete API catalogue; 8 Half 2 page specifications (H2.1–H2.8) with async states and user workflows. |
| **Artifact 06** | `06-half2-state-permission-and-audit-matrix.md` | ✅ **Complete** | 6 state machines with Mermaid diagrams; frontend async state matrix; platform RBAC matrix; append-only audit rules. |
| **Artifact 07** | `07-half1-half2-integration-contract.md` | ✅ **Complete** | Service function signatures; DTOs; deterministic mock adapters; 10-step integration sequence; breaking change rules. |

---

## 3. Cross-Artifact Consistency Audit

| Verification Vector | Cross-Check Description | Result |
|---|---|---|
| **Scope $\rightarrow$ Domain** | Every in-scope feature (F1–F12) maps directly to domain entities and services. Deferred feature F13 (BYOK) is explicitly parked. | ✅ Consistent |
| **Domain $\rightarrow$ Persistence** | Every domain entity (`BillingAccount`, `CreditPool`, `CreditLedgerEntry`, etc.) has a fully specified table in `03-half2-database-schema.md`. | ✅ Consistent |
| **Business Rules $\rightarrow$ Database** | Maker-checker (`chk_maker_checker`), non-negative balances (`chk_pool_nonneg`), single active pools (`uq_pool_one_active_general`), and append-only immutability (`forbid_mutation`) are enforced directly by PostgreSQL. | ✅ Consistent |
| **Business Rules $\rightarrow$ Services** | Lock hierarchy (R4) and two-tier fast/slow path are cleanly assigned to `LedgerService`; double-spending prevention is enforced at the domain service layer. | ✅ Consistent |
| **Services $\rightarrow$ APIs** | Every public service method exposed by Half 2 has a corresponding route in `04-half2-services-and-api-contracts.md` and `05-half2-api-catalogue-and-page-specifications.md`. | ✅ Consistent |
| **APIs $\rightarrow$ UI Pages** | Every page (H2.1 through H2.8) has documented backing APIs. No page relies on undocumented endpoints. | ✅ Consistent |
| **State Machines $\rightarrow$ APIs** | Every state transition in `06-half2-state-permission-and-audit-matrix.md` maps to a specific controller action (e.g. approve, reject, cancel, suspend). | ✅ Consistent |
| **Permissions $\rightarrow$ Endpoints** | All 24 APIs have explicit role guards (`ADMIN` vs `SUPER_ADMIN`) matching the platform RBAC matrix. | ✅ Consistent |
| **Audit $\rightarrow$ Mutations** | Every state mutation writes to either `billing_audit_event` or `platform_audit_event` with before/after state snapshots. | ✅ Consistent |
| **Half 1 $\leftrightarrow$ Half 2 Seam** | Cross-boundary dependencies (Onboarding, Trial grant, Billing summary, Request prefill) have explicit DTOs and deterministic mocks in Artifact 07. | ✅ Consistent |

---

## 4. Orphan Functionality Analysis

The cross-artifact consistency sweep checked for unlinked or dangling specifications:
- **Database Entities with no consumer:** **0 found.** Every table in `billing.*` and `platform.*` is consumed by at least one service and UI page.
- **APIs with no consumer:** **0 found.** All 24 APIs in the catalogue have designated consuming components.
- **Pages with no backing API:** **0 found.** Every screen in H2.1–H2.8 is backed by defined endpoints.
- **Requirements with no implementation path:** **0 found.** Every requirement from the Intent document has an assigned service, persistence schema, and migration phase.
- **UI Actions with no backend capability:** **0 found.** Modals for overdraft adjustment, pool extension, request approval, and incident declaration correspond to specific API endpoints.

---

## 5. Architectural Decisions & Stakeholder Sign-Off Register
 
All core architectural parameters have been approved and locked into `DESIGN-DECISIONS.md`:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                          DECISIONS SIGNED OFF & LOCKED                                 │
├────┬─────────────────────────────┬─────────────────────────────────────────────────────┤
│ 1  │ ADR-001 Deployment Boundary │ LOCKED: Dual-Process Monolith (Option A).           │
│    │                             │ Separate private container; shared database/code.   │
├────┼─────────────────────────────┼─────────────────────────────────────────────────────┤
│ 2  │ ADR-002 Identity Model      │ LOCKED: Dedicated platform.platform_staff table     │
│    │                             │ with PlatformStaffRole (SUPPORT, FINANCE, OWNER).   │
├────┼─────────────────────────────┼─────────────────────────────────────────────────────┤
│ 3  │ ADR-003 Schema Isolation    │ LOCKED: PostgreSQL Multi-Schema (billing, platform, │
│    │                             │ public) via Prisma 5.22 multiSchema preview.        │
├────┼─────────────────────────────┼─────────────────────────────────────────────────────┤
│ 4  │ ADR-004 Overdraft           │ LOCKED: Overdraft feature permanently eliminated    │
│    │                             │ (overdraftLimit = 0, zero debt).                    │
├────┼─────────────────────────────┼─────────────────────────────────────────────────────┤
│ 5  │ ADR-005 Question Snapshots  │ LOCKED: Versioned snapshots only (no in-place edits)│
├────┼─────────────────────────────┼─────────────────────────────────────────────────────┤
│ 6  │ ADR-007 Pricing Baseline    │ LOCKED: Initial provisional seed at ₹50 / seat.     │
├────┼─────────────────────────────┼─────────────────────────────────────────────────────┤
│ 7  │ ADR-008 Retention Override  │ LOCKED: Bounded 14–90 days (365 compliance extreme).│
├────┼─────────────────────────────┼─────────────────────────────────────────────────────┤
│ 8  │ Phase 0 Side-Door Cleanup   │ APPROVED: Immediate refactoring of proctoring, sql, │
│    │                             │ coding, and mcq auto-transitions into beginSession. │
└────┴─────────────────────────────┴─────────────────────────────────────────────────────┘
```

---

## 6. Implementation Action Plan (Phase 0 Kickoff)

With stakeholder sign-off secured, implementation begins immediately in the authorized sequence:

1. **Phase 0 — Immediate Execution (Side-Door Cleanup):**
   - Refactor `proctoring.service.ts` (line 228), `sql.service.ts` (lines 114 & 247), `coding.service.ts` (line 138), and `mcq.service.ts` (line 138).
   - Ensure all transitions to `IN_PROGRESS` invoke `SessionService.beginSession()`.
   - Run automated test suites to ensure zero regressions in candidate assessment flows.
2. **Phase 1 — Data Foundation & Schema Deployment:**
   - Update `schema.prisma` with multi-schema definitions (`public`, `billing`, `platform`).
   - Deploy raw SQL migration with hardened triggers, search path security, and append-only grants.
   - Backfill one `BillingAccount` per existing `Organization`.
3. **Phase 2 — Shadow Validation Mode (`BILLING_MODE=shadow`):**
   - Wire `billing_begin()` in shadow mode. Run 2 weeks of live traffic.
   - Exit Gate: $>10,000$ attempts, 100% reconciliation, zero duplicate entries.
4. **Phase 3 — Live Cutover & Enforcement (`BILLING_MODE=enforce`):**
   - Enable `guard_session_start` trigger. Seed starting balances via maker-checker `GRANT`.
   - Activate Admin Web badges, HELD queue, and capacity top-up alerts.
5. **Phase 4 — Payments & Gateway Webhooks:**
   - Deploy webhook receiver and BullMQ processor for Razorpay / Stripe.
