# Artifact 05 (Half 1): API Catalogue & Page Specifications

**Document:** `docs/super-admin/design/05-half1-api-catalogue-and-page-specifications.md`  
**Classification:** REST API Catalogue & Frontend UI Page Specifications  
**System:** Proctora / CD-Recruit Platform Operations & Tenant Lifecycle  
**Authoritative Precedence:** `super-admin-intent.md` > `SUPER_ADMIN_DASHBOARD_SPECIFICATION.md`  
**Ownership:** Dev 1 (Half 1 Lead)

---

## 1. REST API Endpoint Catalogue (`/api/v1/platform/*`)

### 1.1 Authentication & Operator Identity (`/platform/auth`)

| Method | Route | Roles Allowed | Description |
|---|---|---|---|
| `POST` | `/api/v1/platform/auth/login` | Public | Initiates staff authentication; returns `tempToken` if MFA is enabled. |
| `POST` | `/api/v1/platform/auth/mfa/verify` | Public (with tempToken) | Validates 6-digit TOTP code; returns full platform access JWT. |
| `POST` | `/api/v1/platform/auth/mfa/setup` | `SUPPORT`, `FINANCE`, `OWNER` | Generates TOTP secret and QR code URI for staff MFA onboarding. |
| `POST` | `/api/v1/platform/auth/mfa/confirm` | `SUPPORT`, `FINANCE`, `OWNER` | Confirms and activates MFA on staff account. |
| `POST` | `/api/v1/platform/auth/logout` | `SUPPORT`, `FINANCE`, `OWNER` | Invalidates operator session. |

---

### 1.2 Platform Overview & Metrics (`/platform/metrics`)

| Method | Route | Roles Allowed | Description |
|---|---|---|---|
| `GET` | `/api/v1/platform/metrics/overview` | `SUPPORT`, `FINANCE`, `OWNER` | Aggregated cross-tenant health: active drives, candidate sessions, trial funnel, needs-attention radar. (PII-Blind). |
| `GET` | `/api/v1/platform/metrics/capacity` | `SUPPORT`, `FINANCE`, `OWNER` | Sandbox load, BullMQ grading queue depth, active concurrent proctoring streams. |

---

### 1.3 Tenant Directory & Tenant 360 (`/platform/tenants`)

| Method | Route | Roles Allowed | Description |
|---|---|---|---|
| `GET` | `/api/v1/platform/tenants` | `SUPPORT`, `FINANCE`, `OWNER` | Searchable, paginated tenant list with lifecycle stage, credit remaining summary, drive count. |
| `GET` | `/api/v1/platform/tenants/:id` | `SUPPORT`, `FINANCE`, `OWNER` | Tenant 360 comprehensive aggregate overview. |
| `GET` | `/api/v1/platform/tenants/:id/brief` | `SUPPORT`, `FINANCE`, `OWNER` | Lightweight tenant summary for Half 2 billing enrichment. |
| `GET` | `/api/v1/platform/tenants/:id/drives` | `SUPPORT`, `FINANCE`, `OWNER` | Drives list for tenant with status and candidate *counts* only (no candidate names). |
| `GET` | `/api/v1/platform/tenants/:id/staff` | `SUPPORT`, `FINANCE`, `OWNER` | Tenant business admin users list. |
| `PATCH` | `/api/v1/platform/tenants/:id/status` | `SUPPORT`, `OWNER` | Suspends or restores tenant platform access (blocks new drives/invites). |
| `PATCH` | `/api/v1/platform/tenants/:id/licensing` | `OWNER` | Updates tenant `licenseTier` and feature entitlement flags. |
| `PATCH` | `/api/v1/platform/tenants/:id/retention` | `SUPPORT`, `OWNER` | Overrides biometric/evidence appeal window (14–365 days). |

---

### 1.4 Onboarding Wizard (`/platform/tenants/onboard`)

| Method | Route | Roles Allowed | Description |
|---|---|---|---|
| `POST` | `/api/v1/platform/tenants/verify-domain` | `SUPPORT`, `OWNER` | Checks domain validity, corporate status, and previous trial status. |
| `POST` | `/api/v1/platform/tenants/draft` | `SUPPORT`, `OWNER` | Saves incremental onboarding wizard progress. |
| `GET` | `/api/v1/platform/tenants/draft/:domain`| `SUPPORT`, `OWNER` | Retrieves saved onboarding draft. |
| `POST` | `/api/v1/platform/tenants/onboard` | `SUPPORT`, `OWNER` | Atomically executes 6-step tenant onboarding. |

---

### 1.5 Operational Overrides (`/platform/overrides`)

| Method | Route | Roles Allowed | Description |
|---|---|---|---|
| `GET` | `/api/v1/platform/overrides` | `SUPPORT`, `OWNER` | Lists active and historical operational overrides. |
| `POST` | `/api/v1/platform/overrides/proctoring` | `SUPPORT`, `OWNER` | Applies time-boxed proctoring relaxation to a drive. |
| `POST` | `/api/v1/platform/overrides/schedule` | `SUPPORT`, `OWNER` | Extends active drive schedule window. |
| `POST` | `/api/v1/platform/overrides/question-fix`| `OWNER` | Versions question and rebinds unstarted sessions. |
| `POST` | `/api/v1/platform/overrides/invite-ratio`| `SUPPORT`, `OWNER` | Overrides 5:1 invite bloat-guard ratio. |
| `DELETE`| `/api/v1/platform/overrides/:id` | `SUPPORT`, `OWNER` | Early revocation of an active override. |

---

### 1.6 Tenant Impersonation (`/platform/impersonation`)

| Method | Route | Roles Allowed | Description |
|---|---|---|---|
| `POST` | `/api/v1/platform/impersonation/start` | `SUPPORT`, `OWNER` | Initiates 30-min scoped session into tenant admin UI. |
| `POST` | `/api/v1/platform/impersonation/stop` | `SUPPORT`, `OWNER` | Terminates active impersonation session. |
| `GET` | `/api/v1/platform/impersonation/active` | `SUPPORT`, `OWNER` | Checks if current operator has an active impersonation. |

---

### 1.7 Staff & Audit Explorer (`/platform/staff` & `/platform/audit`)

| Method | Route | Roles Allowed | Description |
|---|---|---|---|
| `GET` | `/api/v1/platform/staff` | `OWNER` | Lists internal platform staff and their MFA status. |
| `PATCH` | `/api/v1/platform/staff/:id/status` | `OWNER` | Enables/disables platform staff operator account. |
| `GET` | `/api/v1/platform/audit` | `SUPPORT`, `FINANCE`, `OWNER` | Searchable unified audit log explorer. |
| `GET` | `/api/v1/platform/audit/export` | `FINANCE`, `OWNER` | Exports filtered audit events to CSV format. |

---

## 2. Frontend Application & Page Specifications (`frontend/super-admin-web`)

### 2.1 Application Shell & Navigation
- **Header:** Global Search Bar (instant search across Tenant Name, Corporate Domain, Billing ID, Drive UUID), Active Impersonation Watermark Banner (when active), Staff Profile dropdown with Role badge and Logout.
- **Sidebar Nav:**
  - 📊 **Platform Overview** (`/`)
  - 🏢 **Tenants** (`/tenants`)
  - 🚀 **Onboarding Wizard** (`/tenants/new`)
  - 🎁 **Trials Management** (`/trials`)
  - ⚡ **Operational Overrides** (`/overrides`)
  - 💳 **Billing Accounts** (`/billing/accounts` — Half 2)
  - 📥 **Maker-Checker Queue** (`/billing/requests` — Half 2)
  - 🏷️ **Price Book** (`/billing/pricing` — Half 2)
  - 📈 **Finance & Reconciliation** (`/finance` — Half 2)
  - 🛡️ **Audit Log Explorer** (`/audit`)
  - 👥 **Staff Management** (`/staff` — `OWNER` only)

---

### 2.2 Page Specifications

#### Page 1: Platform Overview (`/`)
- **Key Metrics Grid:**
  - Total Active Tenants (vs. Trial vs. Churned).
  - Drives Running Today (Sessions started / completed in last 24h).
  - Platform Capacity Health (Sandbox utilization %, BullMQ queue depth).
- **Needs Attention Radar:**
  - Trials expiring in $\le 7$ days with $<5$ credits used.
  - Suspended / Restricted accounts needing intervention.
  - Pending Maker-Checker items aged $>24$ hours.
- **Guardrails:** No candidate names/emails displayed; aggregate counters only.

#### Page 2: Tenants Directory (`/tenants`)
- **Filters:** Lifecycle Stage (`ALL`, `ONBOARDING`, `TRIAL`, `ACTIVE`, `SUSPENDED`, `DORMANT`), Country, Internal Owner, Search query.
- **Table Columns:** Company Name, Corporate Domain, Country, Lifecycle Stage Badge, Created Date, Active Pools / Credits Remaining, Total Drives, Actions (`Tenant 360`, `Impersonate`).

#### Page 3: Tenant 360 View (`/tenants/:id`)
- **Tab 1: Overview:** Legal entity, tax ID, created timestamp, internal relationship owner, quick status toggle (`ACTIVE` / `SUSPENDED`).
- **Tab 2: Tenant Users:** Business admin roster (names, emails, roles, last login, resend invite button).
- **Tab 3: Drives:** List of drives with start/end schedules, question sets, and candidate *aggregate counts* (Invited, Started, Completed, Flagged).
- **Tab 4: Commercial & Billing (Half 2):** Live summary card reading Half 2 API (`cachedRemaining`, active Drive Passes, Talent Reserve pool, reconciliation pass badge, "Create Manual Request" button).
- **Tab 5: Settings & Overrides:**
  - Data Retention Appeal Window slider (14–365 days) with mandatory ticket ref.
  - License Tier selector (`STARTER`, `GROWTH`, `ENTERPRISE`) & boolean entitlement toggles (`SSO_ENFORCED`, `BYOK_AI_ENABLED`, `CUSTOM_DOMAIN`, `ATS_PARTNER_API`).
- **Tab 6: Activity & Audit:** Tenant-specific audit stream.

#### Page 4: Onboarding Wizard (`/tenants/new`)
- **Step 1: Company Profile:** Legal Entity Name, Display Name, Slug, Corporate Domain, Country (ISO-2), Tax ID.
- **Step 2: Commercial Account:** Currency configuration (INR/USD) and creation of Half 2 Billing Account.
- **Step 3: Primary Admin:** Name and corporate email on the verified domain.
- **Step 4: Trial Policy Grant:** Auto-provision 25 trial credits with 30-day validity.
- **Step 5: Licensing & Entitlements:** Select Tier (`STARTER`, `GROWTH`, `ENTERPRISE`).
- **Step 6: Review & Finalize:** Atomic submit with automatic transition to Tenant 360.
- **Resilience:** Auto-saves draft on step progression; resumes seamlessly if disconnected.

#### Page 5: Operational Overrides Console (`/overrides`)
- **Tabs:** Active Overrides · Historical Overrides · New Override.
- **Form Modal:**
  - Select Drive / Tenant.
  - Choose Override Type: Proctoring Sensitivity, Schedule Extension, Mid-Drive Question Version Rebind, Invite Bloat Ratio.
  - Input parameters (bounded values).
  - Mandatory Ticket Reference and Justification.
- **Two-Actor Check:** Highlights overrides requiring dual authorization.

#### Page 6: Tenant Impersonation Cockpit
- Triggered via Tenant 360 or Tenant list.
- Modal prompts for **Mandatory Ticket Reference** and **Support Reason**.
- Upon confirmation:
  - Generates 30-minute scoped token.
  - Launches new browser window directed to the tenant admin app.
  - Mounts persistent red warning banner: `"IMPERSONATION ACTIVE — ACTING AS [USER] ([ORG]) — TICKET #[REF] — EXPIRES IN [MM:SS]"`.
  - Terminates cleanly upon clicking "Exit Impersonation".
