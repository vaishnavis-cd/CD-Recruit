# Proctora — Super Admin Dashboard & Platform Operations Specification

> **Document Status:** Authoritative Architectural & Information Architecture (IA) Specification  
> **Target System:** Proctora Platform Operations Console (`frontend/super-admin` or `/platform/*`)  
> **Target Audience:** Internal Platform Engineering, Product Management, Platform Operations, Finance & Support Leads  
> **Source Intent:** `.agent/intents/super-admin-intent.md`  
> **Companion Documents:**  
> - `PRICING_AND_CREDIT_POOL_SPECIFICATION.md` (Authoritative Financial Ledger & Billing Engine)  
> - `PROCTORA_PRICING_AND_CREDIT_SYSTEM_EXPLAINED.md` (Plain-English Commercial Rules)  
> - `CD-Recruit_Admin_Dashboard_IA_Review_and_Walkthrough.md` (Client-Facing Tenant Admin Web)  
> **Rule of Precedence:** This document is the master product and UI/IA specification for the **Super Admin Dashboard alone**. It specifies the screens, components, workflows, data contracts, and permission boundaries used by Proctora's internal staff to operate the platform.

---

## 0. ExecutLive Mandate & Architectural Boundaries

### 0.1 The Two-Panel Reality
Proctora operates under a strict two-portal separation of concerns:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        PROCTORA APPLICATION SUITE                      │
├───────────────────────────────────┬────────────────────────────────────┤
│   TENANT ADMIN CONSOLE            │   SUPER ADMIN OPERATIONS HUB       │
│   (Client-Facing: /dashboard)     │   (Internal-Only: /platform/*)     │
├───────────────────────────────────┼────────────────────────────────────┤
│ • Scoped to ONE Organization      │ • Scoped across ALL Tenants        │
│ • Used by: Recruiter, HR Lead,    │ • Used by: Platform Support,       │
│   Client Billing Admin            │   Platform Finance, Operations     │
│ • Manages: Drives, candidates,    │ • Manages: Onboarding, trials,     │
│   templates, their own tests      │   maker-checker ledger, overrides  │
│ • Candidate PII: Visible          │ • Candidate PII: BLIND BY DEFAULT  │
│ • Authority: Tenant boundary      │ • Authority: Global Platform       │
└───────────────────────────────────┴────────────────────────────────────┘
```

### 0.2 Core Invariant Rules Governing the Super Admin Dashboard

| Rule | Invariant Principle | Architectural Enforcement |
|---|---|---|
| **I1** | **PII-Blind by Default** | Default views across all tenants, drives, and global metrics display **aggregate statistics, UUIDs, and metadata only**. Candidate rosters (names, emails, phone numbers) are never rendered ambiently on Super Admin tables. Real candidate records are reachable **only via deliberate, audited Impersonation (§4.10) with a mandatory ticket reference**. |
| **I2** | **Maker-Checker Dual Authorization (R8)** | No single internal staff member can unilaterally mint, adjust, refund, or extend credit pools. The UI enforces a strict dual-actor queue: `requested_by_id != approved_by_id`. Self-approval is physically blocked at the API gateway and DB trigger. |
| **I3** | **Two-Actor Rule for Evidentiary Mutators** | Operational overrides that modify candidate testing conditions (proctoring relaxation, drive unlocking, schedule extension, incident windows) require two actors or mandatory CRM ticket linkage with automatic audit trails. |
| **I4** | **Zero Database Direct Mutations** | All actions taken by internal staff—from customer onboarding to ledger adjustments—must execute through the Super Admin API layer. No raw `psql` queries or unlogged DB writes are permitted. |
| **I5** | **Decoupled from Ledger Backend Implementation** | This specification defines the presentation, interaction, workflows, and state machines for the dashboard. The underlying transaction logic follows `PRICING_AND_CREDIT_POOL_SPECIFICATION.md`. |

---

## 1. Information Architecture & Navigation Topology

### 1.1 Route Catalog & Access Matrix

```
/platform
├── /dashboard              [ADMIN, SUPER_ADMIN] -> Global Operational Action Queue
├── /onboarding             [ADMIN, SUPER_ADMIN] -> Lifecycle Pipeline & Funnel Kanban
├── /tenants
│   ├── /                   [ADMIN, SUPER_ADMIN] -> Directory of all Organizations & BillingAccounts
│   └── /:id                [ADMIN, SUPER_ADMIN] -> Single Tenant 360° Management Console
├── /billing
│   ├── /                   [SUPER_ADMIN]        -> Price Books, Payments & Maker-Checker Queue
│   └── /requests           [SUPER_ADMIN]        -> Dual-Authorization Action Center
├── /finance                [SUPER_ADMIN]        -> Ledger Explorer, Reconciliation & Margin Telemetry
├── /invoices               [SUPER_ADMIN]        -> Enterprise POs & Offline Invoicing
├── /overrides              [ADMIN, SUPER_ADMIN] -> Active Tenant Policy Overrides & Incident Engine
├── /capacity               [ADMIN, SUPER_ADMIN] -> Platform Health, HOLD Queue & Concurrency
├── /metrics                [ADMIN, SUPER_ADMIN] -> PII-Blind Analytics, Funnel & Usage Rates
├── /staff                  [SUPER_ADMIN]        -> Internal User Roster & Role Assignments
├── /audit                  [SUPER_ADMIN]        -> Comprehensive Chronological System Audit Log
└── /settings               [SUPER_ADMIN]        -> Global Policy Knobs & Threshold Configuration
```

### 1.2 Global Shell Layout

The Super Admin Console employs an authoritative, high-density dark canvas (`#090D16`) optimized for operational throughput, rapid scanning, and zero visual ambiguity:

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ [PROCTORA OPS]  [Search Tenants, Drives, POs, Tickets... ⌘K]  ● Recon: PASS  ▲ AI Margin: 14%  [Profile]│
├──────────────┬─────────────────────────────────────────────────────────────────────────────────────────┤
│ COMMAND      │                                                                                         │
│  Dashboard   │  ACTIVE IMPERSONATION BANNER (Visible only when shadowing a tenant)                    │
│  Metrics     │  ⚠️ Impersonating Acme Corp (Admin: priya@acme.com) — Audited. Ticket: PRO-4912 [EXIT]   │
│              ├─────────────────────────────────────────────────────────────────────────────────────────┤
│ TENANTS      │                                                                                         │
│  Pipeline    │  PAGE TITLE & SCOPE BREADCRUMB                                                          │
│  Directory   │  Action Buttons (e.g. [+ New Tenant], [Export CSV], [Declare Incident])                 │
│              ├─────────────────────────────────────────────────────────────────────────────────────────┤
│ COMMERCE     │                                                                                         │
│  Billing     │                                                                                         │
│  Finance     │  PRIMARY CONTENT VIEWPORT                                                               │
│  Invoices    │  (Tables, Metrics Cards, Kanban Columns, Drawer Wizards)                                │
│              │                                                                                         │
│ OPERATIONS   │                                                                                         │
│  Overrides   │                                                                                         │
│  Capacity    │                                                                                         │
│              │                                                                                         │
│ GOVERNANCE   │                                                                                         │
│  Staff       │                                                                                         │
│  Audit Log   │                                                                                         │
│  Settings    │                                                                                         │
└──────────────┴─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Screen-by-Screen Detailed Specifications

---

### Screen 2.1: Global Operational Dashboard (`/platform/dashboard`)

#### Purpose
An operational action queue rather than a passive analytics vanity board. Surfaces everything requiring human decision-making today across all tenants.

#### Visual Layout
```
┌───────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ 🔴 4 Urgent Items Requiring Human Action                                                              │
├───────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ ⚖️ Maker-Checker Approvals (2 Pending)  │ ⏳ Trials Expiring Soon (3 Accounts)                         │
│ • Acme Corp: +100 GOODWILL Credits      │ • Globex Inc: 2 days left, 0 drives launched                │
│   Requested by: Priya (Support)         │   Assigned to: Alex (Outreach needed)                       │
│   Ticket: #SUP-1092 [Review & Approve]  │   [View Tenant Profile]                                     │
├─────────────────────────────────────────┼─────────────────────────────────────────────────────────────┤
│ 🛑 Capacity & HOLD Incidents (0 Active) │ 🛡️ Nightly Reconciliation (Passed at 03:00 UTC)             │
│ • No candidate held at capacity lobby.  │ • 7/7 Invariants Verified | 0 Ledger Drift Rows             │
│   All Judge0 sandboxes operating <68%.  │ • Cryptographic WORM Checksum: MATCH                        │
└───────────────────────────────────────────────────────────────────────────────────────────────────────┘

┌─ Cross-Platform Operational Pulse ────────────────────────────────────────────────────────────────────┐
│ [ Active Live Sessions ]    [ 24h Completed Tests ]    [ 30d Active Tenants ]   [ Rolling AI Margin ] │
│         1,482                        8,920                       142                    21.4%         │
│   ▲ +12% vs last week          ▲ 99.4% auto-graded         12 in active trial     Safe (<25% alarm)   │
└───────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### Field & Component Catalog
1. **Pending Approval Queue Card:** Displays pending `ManualBillingRequest` records where `status = PENDING`. Shows requester, tenant, amount, request type, timestamp, and a direct CTA modal trigger.
2. **At-Risk Trials Card:** Identifies accounts in `TRIAL_ACTIVE` with `expiresAt < now() + 7 days` AND `driveCount == 0`.
3. **Reconciliation Health Widget:** Real-time badge indicating status of the last automated 7-point ledger replay. Red banner triggers if any invariant fails.
4. **Platform Pulse Metrics:** Live streaming count of billable candidate sessions in `IN_PROGRESS` state.

---

### Screen 2.2: Onboarding Pipeline Kanban (`/platform/onboarding`)

#### Purpose
Visual lifecycle board tracking client progress from signup to paid conversion. Gives customer success and platform operations a centralized cockpit to identify stalled trials.

#### Visual Layout
```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Filters: [ Owner: All ▼ ] [ Country: All ▼ ] [ Search Company... ]                 [+ Manual Tenant] │
├─────────────────┬──────────────────┬──────────────────┬──────────────────┬───────────────────────────┤
│ SIGNED UP (8)   │ TRIAL ACTIVE (14)│ 1ST DRIVE CREATED│ CONVERTED (89)   │ DORMANT / LAPSED (22)     │
├─────────────────┼──────────────────┼──────────────────┼──────────────────┼───────────────────────────┤
│ 🏢 Stark Labs   │ 🏢 Wayne Ent.    │ 🏢 Cyberdyne Sys │ 🏢 Initech Corp  │ 🏢 Acme Corp (Old)        │
│ Domain: Unverif │ Domain: Verified │ Drive: Campus 26 │ Plan: Reserve 1k │ Expired: 12 days ago      │
│ Added: 2h ago   │ 18/25 Credits Rem│ 84 Invites sent  │ Converted: Sep 21│ 0 drives run              │
│ Owner: Unassigned│ 14 days left    │ 12 Credits used  │ ARR: ₹1,20,000   │ Last Nudge: Step 3 sent   │
│ [Assign Owner]  │ Owner: Sarah K.  │ Owner: Alex M.   │ Owner: Sarah K.  │ [Trigger Win-back]        │
│                 │ [Nudge Tour]     │ [Inspect Drive]  │ [View Ledger]    │                           │
└─────────────────┴──────────────────┴──────────────────┴──────────────────┴───────────────────────────┘
```

#### Lifecycle State Transition Machine
```
[ Lead Signup ] ────────► [ Domain Verified ] ──────► [ Trial Provisioned (25 cr) ]
                                                               │
                                  ┌────────────────────────────┴────────────────────────────┐
                                  ▼                                                         ▼
                      [ First Drive Launched ]                                     [ 30 Days Expired ]
                                  │                                                         │
                                  ▼                                                         ▼
                      [ Paid Checkout / Step 6 ]                                   [ Marked Dormant ]
                                  │                                                         │
                                  ▼                                                         ▼
                      [ Converted Customer ]                                       [ Win-back Outreach ]
```

#### Card Attributes
- Tenant Legal Name and Domain Badge (Corporate Verified vs. Provisional).
- Credit Pool Gauge: Remaining / Total trial credits (`cached_remaining / 25`).
- Walkthrough Progress Indicator: `walkthrough_completed_at` (Checkmark) vs Pending.
- Automated Nudge History: Badges showing which automated conversion emails have fired (`N1: 7-day warning`, `N2: low credit warning`).

---

### Screen 2.3: Tenants Directory (`/platform/tenants`)

#### Purpose
High-density, searchable directory of all customer organizations and billing entities on the platform.

#### Visual Layout
```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ [Search Name, Slug, Domain, Tax ID...] [Status: All ▼] [Plan: All ▼] [Owner: All ▼]  [+ Create Tenant]│
├──────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Organization       │ Billing Entity │ Country │ Plan / Status    │ Balance │ Drives │ Owner   │ Action │
├────────────────────┼────────────────┼─────────┼──────────────────┼─────────┼────────┼─────────┼────────┤
│ Acme Technologies  │ Acme Corp Ltd  │ IN (INR)│ TALENT_RESERVE   │ 412 cr  │ 18     │ Sarah K │ [•••]  │
│ Wayne Enterprises  │ Wayne Hold LLC │ US (USD)│ ENTERPRISE (PO)  │ 2,500 cr│ 42     │ Alex M  │ [•••]  │
│ Stark Industries   │ Stark Ind Corp │ IN (INR)│ TRIAL_ACTIVE     │ 21 cr   │ 1      │ Priya R │ [•••]  │
│ Cyberdyne Systems  │ Cyberdyne Inc  │ US (USD)│ RESTRICTED (Debt)│ 0 cr    │ 5      │ Sarah K │ [•••]  │
│ Umbrella Pharma    │ Umbrella Ltd   │ GB (GBP)│ SUSPENDED (Fraud)│ 0 cr    │ 2      │ Alex M  │ [•••]  │
└──────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### Row Level Actions (`[•••]` Menu)
- **View Tenant 360° Console:** Opens `/platform/tenants/:id`.
- **Impersonate Tenant Admin:** Triggers the audited shadowing handshake (§4.10).
- **Manual Credit Adjustment:** Opens Maker-Checker Request Drawer (§4.4).
- **Apply Policy Override:** Opens Emergency Rule Override Modal (§4.7).
- **Suspend / Restrict Account:** Changes `BillingAccountStatus` with mandatory reason.

---

### Screen 2.4: Tenant 360° Detail Console (`/platform/tenants/:id`)

#### Purpose
The central operational screen for a single customer account. Consolidates commercial contracts, credit pools, live drive volumes, licensing flags, and support actions into one tabbed workspace.

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ 🏢 Acme Technologies (acme-corp)  [ACTIVE]  Domain: acme.com  Country: India (INR)                   │
│ Billing Account ID: ba_9f82...  Created: Jan 14, 2026  Account Owner: Sarah Jenkins                  │
│ [ ⚡ Impersonate Admin ]  [ + Maker-Checker Grant ]  [ ⚙️ Emergency Override ]  [ Manage Account ▼ ]  │
├──────────────┬──────────────────┬──────────────┬───────────────┬─────────────────┬───────────────────┤
│ 1. Overview  │ 2. Credit Pools  │ 3. Drives    │ 4. Licensing  │ 5. Overrides    │ 6. Audit Trail    │
└──────────────┴──────────────────┴──────────────┴───────────────┴─────────────────┴───────────────────┘
```

#### Tab Deep-Dive Breakdown

#### Tab 1: Commercial Overview & Funnel Status
- **Entity KYC:** Legal entity name, verified Tax ID / GSTIN / EIN, confirmed billing country.
- **Consumption Meter:** Lifetime purchased credits, lifetime consumed attempts, current active balance.
- **Overdraft Status:** Absolute overdraft limit (`overdraft_limit`), current utilized overdraft (`overdraft_used`), aging days on outstanding debt.
- **Assigned Internal Owner:** Dropdown to reassign the Proctora account lead.

#### Tab 2: Credit Pools & Live Ledger Balance
- Displays all pools associated with this `BillingAccount`:
  - **Type Badges:** `TRIAL`, `DRIVE_PASS`, `TALENT_RESERVE`, `ENTERPRISE`.
  - **State Columns:** Status (`ACTIVE`, `QUEUED`, `EXHAUSTED`, `EXPIRED`), Opening Credits, Remaining Credits, Activation Timestamp, Expiration Deadline.
  - **Sequential Promotion Queue:** Displays `queue_order` for reserve packs awaiting activation upon exhaustion of the currently active pool.
- **Action:** `[+ Request Manual Credit / Adjustment]` -> triggers Maker-Checker form.

#### Tab 3: Drives & Candidate Volume Summary (PII-Blind)
- Table listing all drives created by this tenant:
  - Drive Name, Role Template, Status (`DRAFT`, `SCHEDULED`, `ACTIVE`, `CLOSED`).
  - Total Invites Dispatched.
  - Test Sessions Started (Billable `CONSUME` count).
  - Test Sessions Completed.
  - Active Fallthrough Setting: `ALLOW` (draws from Talent Reserve) vs `HOLD` (halts candidate at capacity lobby).
  - *Strict Rule: No candidate names, email addresses, or individual test scores are rendered here.*

#### Tab 4: Licensing & Feature Entitlements
- **Edition Tier Selector:** `STARTER` | `GROWTH` | `ENTERPRISE`.
- **Modular Entitlement Toggles (Server-Enforced):**
  - `[x] SSO_ENFORCED` (Requires corporate SAML/Okta identity provider)
  - `[x] BYOK_AI_ENABLED` (Allows customer to input own OpenAI/Anthropic keys)
  - `[x] CUSTOM_DOMAIN_WHITE_LABEL` (Custom email sender domain + logo branding)
  - `[x] PARTNER_API_ATS_ACCESS` (Issues API keys for Greenhouse/Workday webhook feeds)
  - `[x] EXTENDED_DATA_RETENTION` (Overrides default evidence purge window)
  - `[x] DEDICATED_EXECUTION_SANDBOX` (Routes coding tests to isolated Judge0 runner)

#### Tab 5: Active Operational Overrides
- Lists all active, time-boxed exceptions currently applied to this tenant's drives (e.g., relaxed proctoring sensitivity, elevated invite ratios, or emergency schedule shifts).

#### Tab 6: Tenant Audit Trail
- Filtered chronological stream of every administrative action, grant, override, and impersonation session executed on this specific tenant.

---

### Screen 2.5: Billing & Plans Console (`/platform/billing`)

#### Purpose
Governs commercial pricing, catalog versions, payment transactions, and hosts the high-stakes **Maker-Checker Dual Authorization Center**.

#### Visual Layout
```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ ⚖️ Maker-Checker Authorization Center (2 Pending Requests)                                            │
├──────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Req ID │ Tenant       │ Request Kind   │ Amount   │ Requester        │ Ticket Ref │ Age   │ Action   │
├────────┼──────────────┼────────────────┼──────────┼──────────────────┼────────────┼───────┼──────────┤
│ req_01 │ Acme Corp    │ GRANT (GOODWILL)│ +50 cr  │ Priya R. (Supp)  │ #SUP-4102  │ 42m   │ [Review] │
│ req_02 │ Globex Inc   │ EXPIRY_EXTEND  │ +14 days │ Alex M. (Sales)  │ #CRM-8819  │ 3h    │ [Review] │
└────────┴──────────────┴────────────────┴──────────┴──────────────────┴────────────┴───────┴──────────┘

┌─ Price Book Catalog (Version 2026.3 — Effective) ────────────────────────────────────────────────────┐
│ Region: India (INR)                      │ Region: United States & Global (USD)                       │
│ • Drive Pass: ₹50 / seat                 │ • Drive Pass: $1.50 / seat                                 │
│ • Talent Reserve (Pack 100): ₹7,500      │ • Talent Reserve (Pack 100): $150                          │
│ • Talent Reserve (Pack 500): ₹32,500     │ • Talent Reserve (Pack 500): $600                          │
│ • Overdraft Default Ceiling: 0 (No Debt) │ • Overdraft Default Ceiling: 0 (No Debt)                   │
│   [+ Edit Catalog / New Version]         │   [+ Edit Catalog / New Version]                           │
└──────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### The Maker-Checker Dual-Authorization Workflow
Every manual modification of customer money, balances, limits, or dates requires two distinct staff members:

```
[ Step 1: Staff A Requests ] ──────► [ Step 2: System Audits ] ──────► [ Step 3: Staff B Reviews ]
  - Enters Tenant ID                   - Checks requester != approver    - Inspects before/after diff
  - Selects Action (GRANT/ADJUST)      - Writes status = PENDING         - Enters Approver Reason
  - Enters Quantity & Mandatory Ticket - Locks target account advisory   - Clicks [Approve] or [Reject]
                                                                                   │
                                                                                   ▼
                                                                     [ Step 4: Atomic Execution ]
                                                                       - Ledger row inserted
                                                                       - Fast-cache updated
                                                                       - Status = EXECUTED
```

#### Dual-Authorization Review Modal UI
```
┌─────────────────────────────────────────────────────────────┐
│ REVIEW MANUAL BILLING REQUEST: req_01                       │
├─────────────────────────────────────────────────────────────┤
│ Tenant:             Acme Technologies (ba_9f82...)          │
│ Action Kind:        GRANT (Add assessment credits)          │
│ Credit Quantity:    +50 Credits (Whole number Int)          │
│ Grant Source:       GOODWILL                                │
│ Reason:             Campus Wi-Fi crash during Friday drive  │
│ Mandatory Ticket:   https://proctora.zendesk.com/tickets/4102│
│ Requested By:       priya@proctora.com (Support Associate)  │
│ Request Timestamp:  2026-09-23 09:12:04 UTC                 │
├─────────────────────────────────────────────────────────────┤
│ Impact Analysis:                                            │
│ Current Cached Remaining:  12 credits                       │
│ Post-Approval Balance:     62 credits                       │
├─────────────────────────────────────────────────────────────┤
│ Approver Verification (StaffRole: SUPER_ADMIN):             │
│ Note: Self-approval is physically blocked by system guard.  │
│                                                             │
│ Approver Remarks: [ Verified college outage incident logs ] │
│                                                             │
│         [ Reject Request ]       [ Authorize & Execute ]    │
└─────────────────────────────────────────────────────────────┘
```

---

### Screen 2.6: Finance, Ledger Explorer & Margin Alarms (`/platform/finance`)

#### Purpose
Provides real-time visibility into the immutable credit ledger, margin-alarm telemetry, and automated financial integrity reports.

#### Visual Layout
```
┌─ Platform Unit Economic Margins & Alarms (Telemetry §8.4) ───────────────────────────────────────────┐
│ Metric                       │ Current Rolling 30d   │ Threshold Alarm Trigger │ Status               │
├──────────────────────────────┼───────────────────────┼─────────────────────────┼──────────────────────┤
│ Average AI LLM Cost / Test   │ ₹10.70 ($0.13)        │ > ₹15.00 (>25% of unit) │ 🟢 HEALTHY (17.8%)   │
│ Average Judge0 Sandbox Cost  │ ₹0.82 ($0.01)         │ > ₹3.00                 │ 🟢 HEALTHY           │
│ MinIO Video Clip Storage / S │ ₹0.24 ($0.003)        │ > ₹1.00                 │ 🟢 HEALTHY           │
│ Gross Platform Delivery Margin│ 78.4%                 │ < 70.0%                 │ 🟢 OPTIMAL           │
└──────────────────────────────────────────────────────────────────────────────────────────────────────┘

┌─ Immutable Ledger Explorer (Direct Read of `credit_ledger_entry`) ────────────────────────────────────┐
│ [Filter: Account ID...] [Type: All ▼] [Reason: All ▼] [Date Range: 7d ▼]             [Export WORM CSV]│
├──────────────────┬─────────────────┬───────────┬────────┬──────────────────┬──────────────┬───────────┤
│ Timestamp        │ Tenant (ID)     │ EntryType │ Change │ Pool ID (Type)   │ Reason       │ Evidence  │
├──────────────────┼─────────────────┼───────────┼────────┼──────────────────┼──────────────┼───────────┤
│ 23-09 11:14:02   │ Acme (acme-01)  │ CONSUME   │ -1     │ pool_dp_88 (PASS)│ ATTEMPT_START│ sess_4819 │
│ 23-09 11:13:58   │ Wayne (wayne-02)│ CONSUME   │ -1     │ pool_tr_12 (RESV)│ ATTEMPT_START│ sess_4818 │
│ 23-09 11:02:11   │ Stark (stark-09)│ GRANT     │ +500   │ pool_tr_99 (RESV)│ PURCHASE     │ pay_99412 │
│ 23-09 10:45:00   │ Initech (ini-04)│ OVERDRAFT │ -1     │ [NULL - DEBT]    │ OVERDRAFT_USE│ sess_4817 │
│ 23-09 09:12:00   │ Globex (glo-01) │ WAIVE     │ 0      │ pool_dp_44 (PASS)│ HARDWARE_FAIL│ sess_4816 │
└──────────────────┴─────────────────┴───────────┴────────┴──────────────────┴──────────────┴───────────┘
```

#### Automated 7-Point Reconciliation Audit Sub-Panel
Surfaces the nightly automated ledger replay:
1. **Pool Math Check:** `cached_remaining == total_credits + SUM(amount)` across all pools (0 errors).
2. **Overdraft Debt Math:** `account.overdraft_used == -SUM(OVERDRAFT) + SUM(OVERDRAFT_SETTLE) - SUM(REVERSAL)` (0 drift).
3. **Session 1:1 Invariant:** Exactly one acquisition row per billable `IN_PROGRESS` attempt.
4. **Expiry Verification:** Zero active pools past deadline.
5. **Topology Lock:** Maximum 1 active general pool per account; maximum 1 active pass per drive.
6. **Payment Proof:** Every purchase grant carries a verified, captured gateway payment ID.
7. **WORM Export Checksum:** Verified against cold storage hash.

---

### Screen 2.7: Operational Overrides & Incident Engine (`/platform/overrides`)

#### Purpose
The mission-critical emergency control panel requested by operations. Allows platform operators to unblock clients facing real-world campus crises without compromising the evidentiary validity of tests.

#### Visual Layout
```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ ⚙️ Active Platform & Tenant Policy Overrides (3 Live Exceptions)                     [+ Create Override]│
├──────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Target Scope       │ Override Type          │ Parameter / Value  │ Ticket Ref │ Expiration │ Operator│
├────────────────────┼────────────────────────┼────────────────────┼────────────┼────────────┼─────────┤
│ Drive: MIT Pune 26 │ Relax Proctoring Rules │ MultiFace = DISABLED│ #INC-901   │ In 2 hours │ Sarah K │
│ Drive: SRM B.Tech  │ Schedule Shift         │ Extend +120 mins   │ #SUP-4911  │ In 4 hours │ Alex M  │
│ Tenant: Infosys    │ Invite Bloat Ratio     │ 50:1 (was 5:1)     │ #PO-88120  │ In 3 days  │ Priya R │
└──────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### Detailed Override Workflows

#### 1. Relax Proctoring Sensitivity (Low Bandwidth / Computer Lab Crisis)
- **Problem:** A campus computer lab has students seated side-by-side with low-grade webcams. The proctoring AI is spamming "Multiple Faces Detected" or failing WebRTC video clip uploads.
- **Override Action:** Operator opens Override Wizard -> Selects Drive -> Chooses **"Relax Proctoring Strictness"**.
- **Configurable Sliders:**
  - `Disable WebRTC Video Clip Upload` (Falls back to periodic lightweight JPEG snapshots).
  - `Multiple Face Detection Confidence Ceiling` (Raises threshold from 0.65 to 0.90).
  - `Gaze Deviation Threshold` (Increases allowed off-screen glance duration from 3s to 8s).
- **Enforcement:** Time-boxed (auto-expires when drive ends). Dual-audited with mandatory CRM ticket reference.

#### 2. Emergency Schedule Shift (College Delay)
- **Problem:** Campus administration delays the placement exam start by 90 minutes. Candidates attempting to start would be blocked by `Drive.schedule_end`.
- **Override Action:** Selects Drive -> **"Shift Schedule Window"** -> Enters new `schedule_end` timestamp.
- **Integrity Rule:** Does not alter test duration (`RoleTemplate.durationMinutes`), only the calendar window during which candidate check-in is permitted.

#### 3. Mid-Drive Question Fix (Version-and-Rebind Pattern)
- **Problem:** Recruiter discovers Question #2 in an active drive has an erroneous unit test or broken compiler harness.
- **The Dangerous/Forbidden Way:** Direct schema mutation of the live question while candidates are running code.
- **The Safe Proctora Pattern:**
  - Operator triggers **"Version Question & Rebind"**.
  - System creates a new draft version (`version = version + 1`) of the question with the fix.
  - Automatically rebinds the question snapshot **only for sessions that have NOT started yet** (`status = NOT_STARTED`).
  - Sessions already in progress or completed maintain their original immutable question snapshot, preserving the forensic audit trail.

#### 4. Invite Bloat-Guard Ratio Override (Hackathon Open Intake)
- **Problem:** A company runs an open national hackathon. They want to invite 10,000 students via email blast but only purchase a 500-seat pass expecting a 5% turnout. The default 5:1 invite bloat-guard blocks CSV upload at 2,500 candidates.
- **Override Action:** Operator toggles **"Invite Bloat Ceiling"** for Drive X from 5:1 to 50:1.
- **Requirement:** Recruiter acknowledges that if >500 students attend, candidate #501 will enter the polite `HOLD` lobby unless additional seats are topped up.

#### 5. Platform Incident Window Declaration (`INCIDENT_WINDOW`)
- **Problem:** A third-party cloud infrastructure component (e.g., AWS availability zone, Judge0 container pool, or MinIO storage cluster) experiences 25 minutes of degraded performance.
- **Override Action:** Super Admin clicks **"Declare Incident Window"**:
  ```
  ┌─────────────────────────────────────────────────────────────┐
  │ DECLARE PLATFORM INCIDENT WINDOW                            │
  ├─────────────────────────────────────────────────────────────┤
  │ Impacted Service:   [ Judge0 Sandbox Execution Engine ▼ ]   │
  │ Incident Start:     2026-09-23 10:15:00 UTC                 │
  │ Incident End:       2026-09-23 10:48:00 UTC                 │
  │ Scope:              [ Entire Platform / All Tenants   ▼ ]   │
  │ CRM / Post-Mortem:  https://status.proctora.com/incidents/88│
  ├─────────────────────────────────────────────────────────────┤
  │ Automated Remediation Action:                               │
  │ [x] Auto-issue REVERSAL credits for failed/timed-out tests. │
  │ [x] Reset disconnect count for impacted active candidates.  │
  │ [x] Exempt candidates from burning client 5% waiver quota.  │
  │                                                             │
  │               [ Execute Incident Declaration ]              │
  └─────────────────────────────────────────────────────────────┘
  ```

---

### Screen 2.8: Global Metrics & Concurrency Telemetry (`/platform/metrics`)

#### Purpose
Cross-tenant, PII-blind operational intelligence. Measures trial conversion efficiency, infrastructure loads, and commercial health without exposing individual candidate names or emails.

#### Visual Layout
```
┌─ Platform Real-Time Concurrency ─────────────────────────────────────────────────────────────────────┐
│ Concurrent Live Sessions: 1,482   Judge0 CPU Load: 62%   MinIO Ingestion: 84 MB/s   LLM Queue: 12 jobs│
└──────────────────────────────────────────────────────────────────────────────────────────────────────┘

┌─ 30-Day Onboarding Conversion Funnel ────────────────────────────────────────────────────────────────┐
│ Stage                  │ Account Count │ Conversion Rate │ Benchmark Target │ Drop-off Diagnostics   │
├────────────────────────┼───────────────┼─────────────────┼──────────────────┼────────────────────────┤
│ 1. Signup / Lead       │ 184 Accounts  │ 100.0%          │ Base             │ -                      │
│ 2. Domain Verified     │ 152 Accounts  │ 82.6%           │ > 80%            │ Blocked personal emails│
│ 3. Walkthrough Finished│ 118 Accounts  │ 77.6%           │ > 70%            │ Stalled at module step │
│ 4. First Drive Launched│ 84 Accounts   │ 71.1%           │ > 60%            │ Awaiting college date  │
│ 5. Paid Conversion     │ 48 Accounts   │ 57.1%           │ > 45%            │ Converted to Pass/Resv │
└──────────────────────────────────────────────────────────────────────────────────────────────────────┘

┌─ Credit Consumption by Commercial Product ───────────────────────────────────────────────────────────┐
│ [●] Drive Pass (Event-Anchored): 68% volume (₹50 / seat avg)                                         │
│ [●] Talent Reserve (Pack Pool):  28% volume (₹65 / seat avg)                                         │
│ [●] Enterprise Custom Contract:   4% volume (High-volume negotiated)                                 │
└──────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### Screen 2.9: Enterprise PO & Offline Invoicing Console (`/platform/invoices`)

#### Purpose
Fulfills the enterprise post-paid commercial model where large tech corporations (e.g., Cognizant, Wipro, Infosys) purchase assessment pools through formal Corporate Purchase Orders (PO) with Net-30/Net-60 payment terms, bypassing self-serve credit card checkouts.

#### Visual Layout
```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ [Search PO, Invoice #, Tenant...] [Status: All ▼] [Aging: All ▼]               [+ Generate PO Invoice]│
├────────────┬──────────────────┬──────────────┬───────────┬─────────────┬───────────┬─────────────────┤
│ Invoice #  │ Tenant           │ PO Number    │ Amount    │ Issued Date │ Due Date  │ Status / Action │
├────────────┼──────────────────┼──────────────┼───────────┼─────────────┼───────────┼─────────────────┤
│ INV-2026-89│ Wayne Ent. LLC   │ PO-US-89102  │ $37,500   │ Sep 01, 2026│ Oct 01 (7d)│ UNPAID [Remind] │
│ INV-2026-88│ Infosys Tech     │ PO-IN-44910  │ ₹15,00,000│ Aug 15, 2026│ Sep 15 (8d)│ OVERDUE [Alert] │
│ INV-2026-87│ Tata Consultancy │ PO-IN-38192  │ ₹8,50,000 │ Aug 01, 2026│ Aug 31    │ PAID [Receipt]  │
└────────────┴──────────────────┴──────────────┴───────────┴─────────────┴───────────┴─────────────────┘
```

#### New Offline PO Generation Wizard
1. **Payer Selection:** Selects verified `BillingAccount` (auto-populates Legal Entity Name and GSTIN/Tax ID).
2. **Contract Allocation:** Selects assessment quantity (e.g. 5,000 candidate credits) and agreed tier rate.
3. **Ledger Execution:** System instantiates a `CreditPool` with:
   - `poolType = ENTERPRISE`
   - `source = CONTRACT`
   - `totalCredits = 5000`
   - `status = ACTIVE`
   - `metadata = { poNumber: "PO-IN-44910", invoiceRef: "INV-2026-88" }`
4. **WORM Compliance:** Generates a downloadable, immutable PDF tax invoice complete with legal entity declarations and bank wire transfer instructions.

---

### Screen 2.10: Staff, Roles & Global Platform Audit Log (`/platform/staff` & `/platform/audit`)

#### Purpose
Administers internal Proctora operator permissions and provides an exhaustive, immutable chronological record of every privileged mutation across the entire platform.

#### Internal Staff Roles
- **`ADMIN` (Platform Support):** Can view tenants, create manual billing requests (Maker), initiate audited tenant impersonation, and apply operational overrides with mandatory ticket links.
- **`SUPER_ADMIN` (Platform Finance & Executive):** Can approve manual billing requests (Checker), configure price books, manage staff roles, declare platform incident windows, and inspect financial ledgers.

#### Audit Log Visual Viewport
```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ [Filter: Operator...] [Action: All ▼] [Tenant: All ▼] [Date Range: 30d ▼]             [Export JSON/CSV]│
├──────────────────┬─────────────────┬──────────────────────────┬─────────────────┬────────────────────┤
│ Timestamp        │ Operator        │ Action Executed          │ Target Entity   │ Compliance Proof   │
├──────────────────┼─────────────────┼──────────────────────────┼─────────────────┼────────────────────┤
│ 23-09 11:42:10   │ sarah@proctora  │ IMPERSONATION_START      │ org_acme_corp   │ Ticket: #SUP-4912  │
│ 23-09 11:20:00   │ alex@proctora   │ MAKER_CHECKER_APPROVE    │ req_grant_0102  │ Reason: Outage PO  │
│ 23-09 10:15:00   │ priya@proctora  │ OVERRIDE_PROCTOR_RELAX   │ drive_mit_26    │ Ticket: #INC-901   │
│ 23-09 09:30:12   │ alex@proctora   │ PRICE_BOOK_UPDATE        │ catalog_inr_v3  │ Effective: Oct 01  │
└──────────────────┴─────────────────┴──────────────────────────┴─────────────────┴────────────────────┘
```

---

## 3. High-Stakes Interactive Systems

---

### 3.1 Tenant Impersonation Architecture ("Log in as Tenant Admin")

When a customer reports an issue inside their candidate reports or drive wizard, Super Admin operators must never ask for the customer's credentials. Impersonation provides a secure, audited window into the tenant's exact portal view.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        IMPERSONATION PROTOCOL                          │
├────────────────────────────────────────────────────────────────────────┤
│ 1. Operator clicks [⚡ Impersonate Admin] on Tenant Profile            │
│ 2. System prompts for Mandatory CRM Ticket ID (e.g. Zendesk #4912)     │
│ 3. Operator specifies session duration (Fixed ceiling: 30 minutes)     │
│ 4. Backend generates a scoped, ephemeral JWT:                          │
│    {                                                                   │
│      "sub": "staff_target_tenant_admin_id",                            │
│      "orgId": "target_org_uuid",                                       │
│      "impersonatedBy": "super_admin_operator_uuid",                    │
│      "ticketRef": "ZENDESK-4912",                                      │
│      "scope": "TENANT_SPACE_ONLY",                                     │
│      "exp": "now + 30m"                                                │
│    }                                                                   │
│ 5. Browser opens client Admin Dashboard in a restricted frame.         │
│ 6. High-Visibility Amber Banner pins to the absolute top of the UI.    │
│ 7. Every state mutation writes a dual-attributed audit entry:          │
│    `actor = tenant_staff_id`, `executed_by = operator_staff_id`.       │
│ 8. Structural Guard: Impersonated tokens are structurally FORBIDDEN    │
│    from calling any /platform/* or maker-checker API endpoints.        │
└────────────────────────────────────────────────────────────────────────┘
```

#### Ambient Impersonation Banner Wireframe
```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ ⚠️ ATTENTION: You are currently IMPERSONATING Acme Corp (Admin: priya@acme.com)                       │
│ Reason: Zendesk #4912 | Time Remaining: 24m 12s | All Actions Dual-Audited       [ Exit Impersonation ]│
└──────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### 3.2 AI Architecture: BYOK (Bring Your Own Key) vs. Platform-Provided AI

To resolve enterprise security and margin requirements, the platform supports two AI operational modes, managed via the Super Admin Console:

```
┌───────────────────────────────────┬───────────────────────────────────┐
│     PLATFORM MANAGED (Default)    │    BRING YOUR OWN KEY (BYOK)      │
├───────────────────────────────────┼───────────────────────────────────┤
│ • Billed under standard 1.0 credit│ • Enterprise client inputs their  │
│   per live candidate attempt.     │   own OpenAI/Anthropic API key.   │
│ • Proctora absorbs API token costs│ • Client billed directly by vendor│
│ • Hard token ceiling enforced:    │ • Token limits can be customized  │
│   4,000 in / 1,000 out per test.  │   for complex code/prompts.       │
│ • Monitored by Margin-Alarm       │ • Stored via AES-256-GCM at rest. │
│   telemetry (<25% threshold).     │ • Super Admin monitors validity.  │
└───────────────────────────────────┴───────────────────────────────────┘
```

#### BYOK Failover Policy Controls
In `Tenant Detail -> Licensing`, operators configure how the system behaves if a client's BYOK key hits rate limits or billing exhaustion mid-drive:
1. `FAIL_IMMEDIATELY`: Session grading halts in a `GRADING_PENDING` queue and alerts the client.
2. `FALLBACK_TO_PLATFORM_WITH_OVERAGE`: Automatically falls back to Proctora's platform LLM key to complete grading, and posts an audited overage charge row to the ledger.

---

### 3.3 Data Retention Overrides (GDPR & DPDP Act India)

The system enforces a legally compliant biometric and evidence lifecycle. While the base system uses a formula bounded by the candidate appeal window, enterprise clients frequently require contractually custom retention windows:

- **Configurable Range:** 14 Days to 365 Days (`appealWindowDaysOverride`).
- **Enforcement:** A nightly automated worker scans `EvidenceClip` and `IdentityCapture` records where `flagged_at + appealWindowDaysOverride < now()` and permanently deletes video WebM clips and selfie tensors from S3/MinIO.
- **Audit Preservation:** The plain text audit flag metadata, severity, and reviewer disposition remain preserved in PostgreSQL permanently (Rule R5).

---

## 4. Complete Data Dictionary (New Entities & Fields)

To support the Super Admin Console without altering existing database triggers, the following entities and fields are integrated:

```prisma
// ---------- New Enums ----------

enum OrganizationLifecycleStage {
  SIGNED_UP
  TRIAL_ACTIVE
  CONVERTED
  DORMANT
  CHURNED
}

enum LicenseTier {
  STARTER
  GROWTH
  ENTERPRISE
}

enum OverrideType {
  RELAX_PROCTORING
  SCHEDULE_WINDOW_EXTEND
  QUESTION_REBIND
  INVITE_BLOAT_RATIO
  INCIDENT_WINDOW_WAIVER
}

// ---------- Model Extensions ----------

// Extensions to existing Organization model:
// model Organization {
//   lifecycleStage              OrganizationLifecycleStage @default(SIGNED_UP) @map("lifecycle_stage")
//   licenseTier                 LicenseTier                @default(STARTER)   @map("license_tier")
//   domainVerifiedAt            DateTime?                                      @map("domain_verified_at")
//   walkthroughCompletedAt      DateTime?                                      @map("walkthrough_completed_at")
//   internalOwnerId             String?                                        @map("internal_owner_id")
//   trialNudgeLog               Json?                                          @map("trial_nudge_log")
//   appealWindowDaysOverride    Int?                                           @map("appeal_window_days_override")
//   featureEntitlements         Json?                                          @map("feature_entitlements")
//   byokProvider                String?                                        @map("byok_provider")
//   byokKeyEncrypted            String?                                        @map("byok_key_encrypted")
//   byokFallbackPolicy          String?                    @default("FAIL")    @map("byok_fallback_policy")
// }

// ---------- New Models ----------

model OverrideAction {
  id              String        @id @default(uuid())
  tenantId        String        @map("tenant_id")
  driveId         String?       @map("drive_id")
  overrideType    OverrideType  @map("override_type")
  parameters      Json
  ticketReference String        @map("ticket_reference")
  reason          String
  operatorId      String        @map("operator_id")
  createdAt       DateTime      @default(now()) @map("created_at")
  expiresAt       DateTime?     @map("expires_at")
  isActive        Boolean       @default(true) @map("is_active")

  @@index([tenantId])
  @@index([driveId])
  @@index([isActive])
  @@map("override_action")
}

model ImpersonationSession {
  id              String    @id @default(uuid())
  operatorStaffId String    @map("operator_staff_id")
  targetTenantId  String    @map("target_tenant_id")
  ticketReference String    @map("ticket_reference")
  startedAt       DateTime  @default(now()) @map("started_at")
  expiresAt       DateTime  @map("expires_at")
  endedAt         DateTime? @map("ended_at")
  ipAddress       String    @map("ip_address")

  @@index([operatorStaffId])
  @@index([targetTenantId])
  @@map("impersonation_session")
}
```

---

## 5. Implementation Roadmap & Verification Plan

```
┌───────────────────┐     ┌───────────────────┐     ┌───────────────────┐     ┌───────────────────┐
│      STEP 1       │     │      STEP 2       │     │      STEP 3       │     │      STEP 4       │
│ Schema Extension  │ ──► │ Tenant & Funnel   │ ──► │ Maker-Checker &   │ ──► │ Impersonation &   │
│ & Route Shell     │     │ CRUD Modules      │     │ Finance Explorer  │     │ Overrides Engine  │
└───────────────────┘     └───────────────────┘     └───────────────────┘     └───────────────────┘
```

### Step 1: Schema Migration & Route Foundation
- Deploy Prisma schema additions (`OrganizationLifecycleStage`, `LicenseTier`, `OverrideAction`, `ImpersonationSession`).
- Establish the `/platform/*` route hierarchy with role-gated guards checking `StaffRole.ADMIN` or `StaffRole.SUPER_ADMIN`.
- Implement the dark-canvas UI shell, sidebar navigation, and header status beacons.

### Step 2: Tenant Management & Onboarding Pipeline
- Build the **Tenants Directory** (`/platform/tenants`) and **Tenant 360° Detail View** (`/platform/tenants/:id`).
- Implement the **Onboarding Pipeline Kanban** (`/platform/onboarding`) with lifecycle stage progression.
- Wire the 25-credit automated trial grant logic upon domain verification.

### Step 3: Maker-Checker & Finance Console
- Build the **Dual-Authorization Action Queue** in `/platform/billing`.
- Connect the **Ledger Explorer** to read immutable rows from `credit_ledger_entry`.
- Implement the **Reconciliation Health** widget to display nightly 7-point audit results.

### Step 4: Operational Overrides & Impersonation Engine
- Implement the **Operational Overrides Wizard** (`/platform/overrides`) covering proctoring sensitivity, schedule extensions, and invite bloat ceilings.
- Build the **Incident Window Declaration** tool linking directly to `LedgerReason.INCIDENT_WINDOW`.
- Deploy the **Audited Tenant Impersonation Handshake** with ephemeral JWT generation and persistent top warning banner.

---

## 6. Verification & Automated CI Contracts

To verify compliance prior to deployment:
1. **PII Isolation Automated Test:** Assert that API endpoints feeding `/platform/tenants`, `/platform/dashboard`, and `/platform/metrics` return zero candidate-identifiable strings (`email`, `candidateName`, `idProofRef`).
2. **Maker-Checker Security Test:** Attempt a `POST /billing/requests/:id/approve` where `approverId === requesterId`. Assert that the request fails with `403 Forbidden: Maker-Checker invariant violation`.
3. **Impersonation Scope Test:** Assert that a JWT issued for tenant impersonation is rejected with `403 Forbidden` if it attempts any mutation against `/platform/*` routes.
4. **Version-and-Rebind Test:** Verify that updating a question on an active drive leaves all existing `IN_PROGRESS` or `SUBMITTED` session question snapshots completely unchanged.
