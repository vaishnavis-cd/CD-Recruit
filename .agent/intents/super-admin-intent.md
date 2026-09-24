# Intent: proctora-platform-ops (Super Admin Panel + Credit/Billing Engine)

Author: Ragul Arumugam (technical & product lead, CD-Recruit/Proctora). Status: draft — for dev-agent implementation planning, not yet build-approved.

---

## Read First (gate — do not proceed to planning without these)

This intent depends on two already-locked specifications that must be read in full before any spec/plan work starts. Do not act on the summaries below in place of the source documents — they're condensed on purpose and leave out enforcement detail the agent needs.

1. `PRICING_AND_CREDIT_POOL_SPECIFICATION.md` — the authoritative credit-ledger/billing engine spec. **Currently unimplemented** except for the side-door findings already logged in its own Phase 0 audit section.
2. `PROCTORA_PRICING_AND_CREDIT_SYSTEM_EXPLAINED.md` — the same system in plain English; use it to sanity-check that an implementation matches the customer-facing promise, not just the schema.
3. `CD-Recruit_Admin_Dashboard_IA_Review_and_Walkthrough.md` — the *client-facing* Admin Dashboard. Read this to avoid rebuilding anything that already exists there under a different name.
4. `CD-Recruit_Super_Admin_Panel_and_Client_Onboarding_Plan.md` — prior planning pass for this same feature. This `intent.md` supersedes it where they conflict (the corrections in this document win), but that doc's reasoning on the onboarding flow, trial policy, and sitemap still stands as background.

If any of these four are unreachable, halt and ask rather than inventing the missing content.

---

## Problem

Two gaps exist today, and they're coupled:

1. **The credit/billing engine described in the pricing spec doesn't exist in the codebase yet.** Everything in `PRICING_AND_CREDIT_POOL_SPECIFICATION.md` — the ledger, the pool topology, the two-tier begin engine, maker-checker — is a locked design, not a built system. Phase 0 of that spec's own rollout roadmap (§10) has already found side-door session-start paths that bypass the intended gateway.
2. **There is no panel for Proctora's own staff to operate any of it.** Tenant creation, trial provisioning, plan/pricing management, manual ledger actions, and platform-wide metrics currently have nowhere to live. The client-facing Admin Dashboard (already speced separately) is the wrong place for this — it's scoped to one tenant, not the whole platform.

A Super Admin Panel built against ledger tables that don't exist yet is unbuildable in the order most teams would default to. This intent treats both as one connected piece of work with an explicit sequence, not two independent backlogs.

## Proposed Outcome

- The credit/billing engine lands per the pricing spec's own Phase 0 → 3 rollout, verified against its own reconciliation and CI contract tests before enforcement mode goes live.
- A new, separate internal surface — the Super Admin Panel — exists for Proctora's own staff (`ADMIN`, `SUPER_ADMIN`, and the recommended new `OWNER`/tenant-side role) to onboard tenants, run trials, manage plans and pricing, operate finance, and monitor the platform, without ever needing direct database access to do any of it.
- Every gap identified in this round (overrides, licensing, payment webhooks, impersonation, retention) is either built correctly the first time or explicitly deferred with a documented reason — nothing gets silently dropped or silently included without review.

## Affected Users & Systems

- **Proctora staff** — Platform Support (`ADMIN`), Platform Finance (`SUPER_ADMIN`) — the primary users of the new panel.
- **Tenant admins** (client-side `RECRUITER` / `HR_ASSOCIATE` / `BILLING_ADMIN`) — affected indirectly: onboarding flow, trial experience, and anything an Overrides action changes on their live drive.
- **Candidates** — affected only through the PII-access principle below; never see any of this surface.
- **Systems:** NestJS monolith backend (one deployable — this stays true; the Super Admin Panel is a new frontend surface and new role-gated modules within it, **not** a service split), Postgres/Prisma, Keycloak (pending cutover from dev-JWT), Redis/BullMQ, MinIO, the payment gateways (Razorpay/Stripe) newly introduced by this scope.

---

## Foundational Principles & Constraints

These bind every feature below. An agent implementing any single feature must check it against this list before writing code, not after.

**Already locked, restated because they directly constrain this work:**
- No live LLM generation during an active candidate session — grading, including any BYOK path, is async post-submission only.
- Sandbox isolation is non-negotiable — nothing in this scope touches the Judge0/sandbox boundary.
- The NestJS monolith stays one deployable. New admin surfaces are new modules and a new frontend app, not a new backend service.
- Question/version snapshot binding: a candidate's question set is fixed at session start. No feature in this document may retroactively change what an in-progress or completed session was scored against.
- **R1–R9 from the pricing spec are absolute**, in particular:
  - **R2 — the ledger is the only source of truth.** No feature may write a balance anywhere without going through `LedgerService` in the same transaction as the ledger insert.
  - **R6 — server-authoritative enforcement.** No client-side or admin-UI value is ever trusted without a server-side check behind it.
  - **R7 — candidate APIs are billing-blind.** Nothing built for the Super Admin Panel may leak into a candidate-facing response.
  - **R8 — maker-checker, no threshold.** Every manual credit action, without exception, needs two distinct actors. This directly overrides one of the proposals reviewed below (Emergency Overdraft) — see F7.
  - **Overdraft is `0` by default, always.** "Uncollateralized debt" is a named anti-goal in the source spec, not a soft preference.

**New, introduced by this intent:**
- **PII-Blind by Default.** Every Super Admin view (tenant list, tenant detail, global metrics, drive counts) shows aggregate counts and metadata only — never a rendered candidate roster (names, emails) as a default view. Real candidate PII becomes visible only through Impersonation (F10) or an equivalently audited, ticket-referenced action. This is R7 applied in the other direction — see the standalone section below for the full reasoning.
- **Two-Actor Rule extends past money.** Anything that changes what a candidate experiences after they've already started (drive unlock, proctoring-sensitivity relaxation, schedule extension) needs the same "not one person acting alone, always logged" posture as a financial action, even when no credit is involved — because it changes the evidentiary record the whole platform is built to defend.

---

## Scope Note: Sequencing

This is two dependent builds. Do not let the Super Admin Panel's Billing/Finance modules (F4, F5) get built or demoed against mocked data past the point where Part A's schema should already exist — that produces a UI for tables that don't exist yet, which is worse than not building it, since it looks done and isn't.

**Part A must reach at least Phase 1 (schema + invariants deployed) before Part B's F4/F5 can be built for real.** Part B's F1–F3, F6, F8 (tenant/onboarding/licensing/metrics-that-don't-need-the-ledger) can proceed in parallel against typed mocks, same pattern already established elsewhere in this codebase for port adapters.

---

## Part A — Foundational: Credit & Billing Engine

*(Not yet implemented. Full detail lives in `PRICING_AND_CREDIT_POOL_SPECIFICATION.md` — this is a checklist, not a restatement.)*

| Phase | What | Gate to next phase |
|---|---|---|
| **0 — Discovery & side-door cleanup** | Refactor the already-found side-door session transitions (`proctoring.service.ts:228`, `sql.service.ts:114`) to route through `beginSession`. Map every session creation/deletion flow against retention scripts. | All side-doors closed and verified before the Postgres trigger (`guard_session_start`) is deployed — deploying the trigger before this is done will break existing flows. |
| **1 — Schema & invariants** | Deploy the Prisma models and the raw SQL migration (constraints, partial unique indexes, append-only triggers) exactly as specified. Backfill one `BillingAccount` per existing `Organization`. No balances seeded yet. | CI schema-invariant tests green. |
| **2 — Shadow mode** | All session starts execute `billing_begin(sessionId, 'shadow')`. Shadow rows never fail a real candidate's session (SAVEPOINT-wrapped). Run 2 weeks of real traffic. | 100% reconciliation across 10,000+ attempts, zero duplicate entries. |
| **3 — Enforcement** | Seed real starting balances via maker-checker `GRANT`. Activate balance badges, capacity estimators, HELD flow. Enable `guard_session_start`. | Nightly 7-point reconciliation passing consistently. |
| **4 — Payment gateway integration** | Wire Stripe + Razorpay webhooks. Enforce duplicate-webhook protection and catalog-only pricing. | This is where F9 (payment/invoicing, below) actually becomes real rather than mocked. |

---

## Part B — Super Admin Panel

### F1. Tenant Management
**Description:** CRUD and search over every `Organization`/`BillingAccount`. Tenant Detail view aggregates pools, ledger, users, drives, and lifecycle stage for one account.
**Data:** Reuses `Organization`, `BillingAccount` as already speced. New: lifecycle-stage field (see F2), internal-owner field (which Proctora staffer owns the relationship).
**Depends on:** Part A Phase 1 for anything ledger-related; the Organization/user records themselves have no dependency and can be built first.
**Status:** New, core.

### F2. Onboarding & Trial Provisioning
**Description:** Signup → account creation → first admin invite → automatic trial grant → guided walkthrough → first real Drive → conversion nudge → paid conversion, or lapse to dormant. Full stage table already detailed in the prior planning doc; unchanged here.
**Data:** New fields needed, none of which exist in the pricing spec today:
- `Organization.lifecycleStage` (signed-up / trial-active / converted / dormant / churned) — deliberately separate from `BillingAccountStatus`, which answers "can they transact," not "where in the funnel."
- `Organization.domainVerifiedAt`
- `Organization.walkthroughCompletedAt`
- `Organization.internalOwnerId`
- `Organization.trialNudgeLog` (which conversion-threshold nudges have fired, to avoid duplicate sends)
**Trial policy (already locked, restated for the agent):** 25 credits, 30-day validity, `GrantSource.TRIAL`, one per verified corporate domain (`BillingAccount.trialDomain` unique constraint). The grant itself is automatic (`actor = system`) and does **not** need maker-checker — it's policy-capped, not discretionary. A manual override of the domain-uniqueness rule (legitimate second trial for a subsidiary) **does** need maker-checker, via `ManualBillingRequest`, mandatory ticket ref.
**Open call:** first-user role — recommend a combined `OWNER`-style tenant role bundling `RECRUITER` + `BILLING_ADMIN` capability so a trial signup doesn't need to coordinate two people. Flagged in Open Questions, not decided.
**Depends on:** F1; Part A Phase 1 for the trial `CreditPool`/`GRANT` to be real rather than mocked.
**Status:** New, core.

### F3. Guided Walkthrough
**Description:** In-app tour built around getting a new admin to see a real Say-Do report as fast as possible, not a generic feature tour. Sequence: context screen → pre-loaded demo Drive (reuse the existing "Template Drive" intake channel) → free `SessionKind.PREVIEW` click-through before any trial credit is spent → small real invite batch → contextual nudge on first completed report, not a one-time static tour.
**Data:** `Organization.walkthroughCompletedAt` (from F2); no new entities beyond that.
**Depends on:** F2; the existing Template Drive intake channel (already speced in the pricing spec §5).
**Status:** New.

### F4. Billing & Plans Console
**Description:** UI over `Payment`, `PriceBookEntry` (versioned, regional), and the `ManualBillingRequest` maker-checker queue. This is the highest-stakes screen in the whole panel — every manual grant, adjustment, refund, or expiry extension is a pending item here, requiring an approver who is not the requester.
**Data:** `Payment`, `PriceBookEntry`, `ManualBillingRequest`, `BillingAuditEvent` — all already speced in Part A. No new fields needed; this is a UI, not a schema change.
**Depends on:** Part A Phase 1 minimum; Phase 4 for real payment data rather than manually-seeded test rows.
**Status:** New — UI only, schema already speced.

### F5. Finance & Ledger Console
**Description:** Nightly 7-point reconciliation results surfaced to a human; searchable ledger explorer (by account/pool/session); margin-alarm telemetry (AI cost vs. credit price, already speced at §8.4).
**Data:** `CreditLedgerEntry` (read-only view), reconciliation job output — no new entities.
**Depends on:** Part A Phase 2 (shadow mode) minimum to have real reconciliation output to show.
**Status:** New — UI only.

### F6. Global Metrics Dashboard
**Description:** Cross-tenant view — trial funnel (signup → trial-active → first-drive → converted, as both counts and rates), at-risk accounts (trials expiring within 7 days / under 20% credits with no Drive yet), platform capacity (HOLD queue depth, sandbox utilization, grading backlog), revenue/unit economics, governance health (pending maker-checker approvals and their age, last reconciliation pass/fail). **All aggregate, per the PII-Blind principle — no candidate-level rows anywhere on this screen.**
**Data:** Derived/aggregated from F1–F5's entities plus `SessionBillingEvidence`. No candidate PII fields touched.
**Depends on:** F1–F5 for real data; can be stubbed with honest "awaiting data" states before then (same pattern already used for the Predictive Validity metric on the client-facing dashboard).
**Status:** New.

### F7. Operational Overrides & Incident Engine
**Description:** A tenant/drive-scoped "Overrides & Exceptions" surface for the five real-world cases your manager described, **with two corrections from the original proposal:**
- **Relax proctoring sensitivity** (per-drive, time-boxed, logged) — accept as proposed.
- **Declare an Incident Window** — accept, but this is a UI over the *already-locked* `LedgerReason.INCIDENT_WINDOW` / T3 auto-reversal rule (pricing spec §7.5), not a new ledger concept. Don't build a parallel mechanism.
- **Extend a drive's schedule window** — accept as proposed; doesn't touch question versioning, safe as-is.
- **Fix a question mid-drive** — corrected: does **not** get a raw `isEditingUnlocked` bypass. Instead, editing a question on an active Drive creates a new version (same pattern already recommended for the Question Bank generally) and rebinds only sessions that haven't started yet, per the already-locked session-start snapshot principle. Already-started or already-graded sessions keep what they actually saw.
- **Override the invite bloat-guard ratio** (5:1 → custom, e.g. 50:1, per drive/event) — accept as proposed, ticket-referenced.
- **"Emergency Overdraft" (+20 credits)** — **denied as originally described.** This is not a support action; it's a financial action, and `overdraftLimit = 0` plus R8's no-threshold maker-checker rule apply to it exactly as they apply to everything else in the ledger. Correct mechanism, either of:
  1. Staff-initiated 1-Click Top-Up on the tenant's behalf (real charge against their saved payment method/pre-funded wallet — same mechanism already speced for client self-service, just triggerable by support when an on-site recruiter can't act), or
  2. True no-payment-method emergency: a `ManualBillingRequest` of kind `GRANT`, `GrantSource.GOODWILL`, mandatory ticket ref, maker-checker approval — a real, audited ledger entry.
  Never a direct mutation of `overdraftLimit` or `cached_remaining` outside these two paths.
**Data:** New — an `OverrideAction` audit-style entity (who, what, tenant/drive, reason/ticket ref, timestamp, expiry if time-boxed). Every override writes here regardless of type.
**Depends on:** F1; Part A for the two allowed overdraft mechanisms specifically.
**Status:** New, reviewed and corrected.

### F8. Licensing & Feature Entitlements
**Description:** Tier-based feature gating, decoupled from credit volume — `STARTER` / `GROWTH` / `ENTERPRISE`, with modular boolean entitlements (`SSO_ENFORCED`, `BYOK_AI_ENABLED`, `CUSTOM_DOMAIN_WHITE_LABEL`, `PARTNER_API_ATS_ACCESS`, `EXTENDED_DATA_RETENTION`). Accepted as proposed.
**Data:** New `Organization.licenseTier` + entitlement flags (boolean per feature, per tenant).
**Depends on:** F1. Note: `SSO_ENFORCED` can be flagged now but cannot be *enforced* until the already-pending Keycloak migration lands — don't build enforcement logic against dev-JWT.
**Status:** New — accepted with a noted dependency.

### F9. Payment Gateway, Webhooks & Offline Invoicing
**Description:** Not new scope — this concretizes the already-locked §8.1 rule ("credits mint only on a captured webhook, never on client-side confirmation"). Razorpay (India, embedded modal) + Stripe (international, hosted checkout/3DS2) as the two gateways. Webhook idempotency keyed on the provider's own payment ID. Separately: an **Offline Invoice & PO flow** for Enterprise Contract/PO checkout (Step 6 Option 4 in the pricing spec) — currently named but unspecified in the source spec; this fills that gap. Generates a compliant invoice PDF and creates a `CONTRACT`-sourced `CreditPool` linked to a PO number.
**Data:** `Payment` (already speced), plus a PO/invoice reference field on `Payment` or a small new `Invoice` record if a formal document needs to be generated and stored.
**Depends on:** Part A Phase 4.
**Status:** New — accepted, fills a real gap in the source spec.

### F10. Tenant Impersonation ("Log in as Tenant Admin")
**Description:** Staff-initiated, scoped, time-boxed (30 min) session as a tenant's own admin, for support without ever requesting a client's password. Persistent, high-visibility banner while active. Full dual-audit logging (tenant staff ID + Proctora operator ID) on every mutation made while impersonating. **Two additions to the original proposal:**
- Mandatory ticket reference on every impersonation start — not just recommended.
- An impersonated session carries **tenant-scope authority only.** It must be structurally incapable of approving a `ManualBillingRequest` or performing any platform-level financial action — that authority lives on a different plane and impersonation must not bridge it.
This is also the primary mechanism through which the PII-Blind-by-Default principle stays practical: it's the one deliberate, audited path to real candidate data, instead of that data being ambiently visible everywhere.
**Data:** New `ImpersonationSession` (staff ID, tenant ID, ticket ref, started/expires-at, scope=tenant-only flag). Every mutation during the session tags both actor IDs in the existing audit trail.
**Depends on:** F1; Keycloak/auth for the scoped-token mechanism specifically (works against dev-JWT in the interim with the same scoping logic, just less hardened).
**Status:** New — accepted with added controls.

### F11. Data Retention Overrides
**Description:** Per-tenant override of biometric/evidence retention, for enterprise clients under stricter or looser legal regimes (banking/government needing longer audit retention; others needing faster purge). **Correction from the original proposal:** the existing locked default is not a flat 90 days — it's a *formula* (decision finalization + appeal window, e.g. 30 days, per the TAD). This feature overrides the **appeal-window length** within a bounded range, it does not introduce a second, independently-ticking default retention number that would compete with the already-locked formula.
**Data:** `Organization.appealWindowDaysOverride` (bounded, e.g. 14–365), replacing the flat "90-day default" language from the original proposal.
**Depends on:** F1; the existing automated lifecycle-deletion policy in the TAD (this overrides its parameter, doesn't replace its mechanism).
**Status:** New — accepted with a correction.

### F12. Staff & Roles, Audit Log
**Description:** Internal `StaffRole` management (who at Proctora holds `ADMIN`/`SUPER_ADMIN`/the recommended `OWNER` tenant role) and a full chronological audit log of every action taken in this panel — every grant, approval, override, and impersonation. The internal counterpart to the client-facing Admin Dashboard's own Audit Log, scoped to Proctora's own staff.
**Data:** Reuses the existing `StaffRole` enum (add nothing new structurally — the audit trail is the union of `BillingAuditEvent`, `OverrideAction` (F7), and `ImpersonationSession` (F10) logs).
**Depends on:** F7, F10 for there to be anything to log yet; stub the log early regardless, per the project's own established pattern of writing to audit trails from day one even before the consuming feature exists.
**Status:** New, low urgency — build the log target first, the UI last.

### F13. BYOK AI (Bring Your Own Key) — deferred
**Description:** Enterprise clients supply their own LLM API key (OpenAI/Anthropic/Azure) for grading, paying their vendor directly instead of the flat 1.0-credit rate absorbing it. **Deferred out of this build phase.** Reasoning: doesn't conflict with the no-live-LLM-in-session rule (grading is async regardless of key source), but it's scope unrelated to the original ask, introduces a new class of security exposure (custody of a customer's third-party API key — needs its own threat model: rotation, scoped storage, leakage blast radius), and quietly changes the cost assumptions the margin-alarm system (§8.4) was calibrated against. Document the shape now; build it as its own intent when there's an actual enterprise client asking for it.
**Data (documented, not built):** `BillingAccount.byokProvider`, `byokKeyEncrypted` (AES-256-GCM), `byokFallbackPolicy` (`FAIL_IMMEDIATELY` | `FALLBACK_TO_PLATFORM`).
**Depends on:** Nothing in this phase — explicitly parked.
**Status:** Documented, deferred.

---

## Data & Privacy Compliance — PII-Blind by Default

Direct answer to the standing question: **does having platform-wide metrics mean Super Admin staff have access to tenant candidate data (names, emails, selected candidates)?**

Technically, yes — the data physically lives in Proctora's own Postgres/MinIO, and any processor in this position has technical custody of it. That's unavoidable and not itself a problem. The design question is what the Super Admin Panel *surfaces by default*, and the answer should mirror a rule already locked for the other side of this system — R7, "Candidate APIs are 100% Billing-Blind" — pointed the other direction:

- **Default views are aggregate-only.** Tenant list, Tenant Detail, Global Metrics, drive counts — all show counts and metadata (X invited / Y started / Z completed; drive name, schedule, status). None render a candidate roster with names or emails as a default view.
- **Real PII is reachable only through a deliberate, audited path** — F10 (Impersonation) or an equivalently scoped, ticket-referenced action. Never ambient.
- **The same access pattern already locked for biometric evidence in the TAD** (MFA-gated, signed short-TTL, every access logged) is the template to extend, not a separate design.
- **This needs a contractual basis, not just an engineering control** — a Data Processing Agreement with each client stating Proctora accesses customer data only for support, security, and legal-compliance purposes. This is what actually justifies F10 existing, not just the audit log around it.

This principle is referenced by F1, F6, and F10 above and should be treated as a hard constraint on any future feature that surfaces tenant data, not just the ones named here.

---

## Open Questions

1. First-user role for trial accounts — combined `OWNER`-style role (recommended, F2) vs. requiring separate recruiter/billing contacts from day one.
2. Card-on-file at trial signup or not — recommend no-card, relying on domain-uniqueness + the existing invite bloat-guard.
3. Self-serve signup vs. sales-assisted-only vs. both.
4. Second-trial manual-override approval path — confirmed to require `ManualBillingRequest` maker-checker (F2); confirm ticket-reference format/CRM linkage.
5. Dormant-account win-back cadence — how many nudges, over what window, before a lapsed trial is considered closed.
6. Exact mechanism for mid-drive question fixes (F7) — confirm the version-and-rebind approach is acceptable versus the simpler (but versioning-unsafe) original proposal.
7. Impersonation permission scope — any `ADMIN` can initiate with a mandatory ticket ID (recommended, F10), or does it need a higher approval bar (`SUPER_ADMIN` co-sign) given it's a path to real candidate PII.
8. BYOK pricing — if/when F13 is picked up, does it stay flat 1.0 credit (recommended — LLM cost is a minority of the per-session infra cost per the spec's own cost table) or get a discount tier.
9. Retention-override bounds (F11) — confirm the 14–365-day range, and who can authorize the extremes (a 365-day retention on biometric data is a materially different legal posture than 30).

---

## Suggested Build Sequence

1. Part A, Phase 0 — close the known side-doors. This is already a documented finding; don't let new Super Admin work land on top of an unclosed gap.
2. Part A, Phase 1 — schema + invariants.
3. F1 (Tenant Management) + F2 (Onboarding/Trial) in parallel with Part A Phase 1, against typed mocks for anything ledger-shaped.
4. Part A, Phase 2 (shadow mode) starts; F3 (Walkthrough) completes; F8 (Licensing) and F12's audit-log target land.
5. Part A, Phase 3 (enforcement) goes live; F4 (Billing & Plans) and F5 (Finance & Ledger) become real rather than mocked.
6. F7 (Overrides) and F10 (Impersonation) — both are two-actor/audit-heavy features that deserve to land against a fully enforced ledger, not a shadow one.
7. F6 (Global Metrics) — needs F1–F5 to have real data; building it earlier means empty charts.
8. Part A, Phase 4 (payment gateways) unlocks F9 for real.
9. F11 (Retention overrides), F12's full UI — operational hardening, lowest urgency.
10. F13 (BYOK) — revisit only when a real enterprise request exists; not before.

---

*This is an intent document, not a spec or a plan — per the working pattern already established on this project, the next step is a requirements/design pass per feature (or per phase) before any code is written, with contested items above resolved by Ragul before that pass begins.*
