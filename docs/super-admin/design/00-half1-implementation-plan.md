# Artifact 00 (Half 1): Master Implementation & Verification Plan

**Document:** `docs/super-admin/design/00-half1-implementation-plan.md`  
**Classification:** Engineering Roadmap & Execution Plan  
**System:** Proctora / CD-Recruit Platform Operations (Half 1)  
**Lead:** Dev 1 (Half 1 Lead — Platform Foundation & Tenant Lifecycle)  
**Authoritative Precedence:** `super-admin-intent.md` > `07-half1-half2-integration-contract.md`  

---

## 1. Executive Summary & Delivery Scope

This master implementation plan establishes the engineering sequence for delivering **Half 1: Platform Foundation, Tenant Lifecycle, Operational Overrides, and Staff Governance**.

To avoid cross-team blocking with Half 2 (Commercial & Billing Engine), Half 1 development utilizes **typed deterministic mock adapters** from Day 1, enabling full backend services and frontend UI construction in parallel with Half 2's ledger schema rollout.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              HALF 1 FIVE-PHASE DELIVERY PLAN                           │
├────┬─────────────────────────────┬─────────────────────────────────────────────────────┤
│ P1 │ Foundation & Auth Engine    │ Platform Schema, Staff Auth, TOTP MFA, Mocks        │
│ P2 │ Tenant Lifecycle & Wizard   │ Tenant Management, Onboarding Wizard, Domain Check  │
│ P3 │ Overrides & Impersonation   │ Question Rebind, Sensitivity Time-box, Dual Audit   │
│ P4 │ Frontend Super Admin SPA    │ Vite React Shell, Tenant 360, Overrides, Audit View │
│ P5 │ Integration & Verification  │ Contract Testing, PII Regression, 10-Step Cutover   │
└────┴─────────────────────────────┴─────────────────────────────────────────────────────┘
```

---

## 2. Phased Implementation Roadmap

### Phase 1: Platform Foundation & Security Infrastructure
- **Deliverables:**
  1. Add `platform` multi-schema configuration to `backend/prisma/schema.prisma`.
  2. Implement raw SQL DDL migration for `platform.platform_staff`, `platform.platform_audit_event`, `platform.tenant_profile`, `platform.override_action`, `platform.impersonation_session`, and `platform.onboarding_draft`.
  3. Deploy append-only trigger (`trg_forbid_platform_audit_mutation`) and PostgreSQL role grants (`proctora_platform`).
  4. Create `modules/platform/auth/`:
     - `PlatformAuthService` (Password hashing, JWT generation, TOTP MFA setup/verification).
     - `PlatformAuthGuard`, `PlatformRolesGuard`, `@Roles()`, and `@RequireMfa()`.
  5. Provide `MockBillingAccountService` and `MockTrialGrantService` for local integration.
- **Verification Gate:** Staff login + MFA flow tests passing; unit tests verifying `proctora_app` role cannot access `platform.*`.

---

### Phase 2: Tenant Lifecycle & Onboarding Engine
- **Deliverables:**
  1. Implement `TenantManagementService` (`listTenants`, `getTenant360`, `updateTenantStatus`, `updateLicensing`, `updateRetention`).
  2. Implement `DomainVerificationService` with free-mail provider blocklist and domain uniqueness validation.
  3. Implement `TenantOnboardingService`:
     - 6-step wizard state machine with draft persistence (`platform.onboarding_draft`).
     - Orchestration with Half 2's `BillingAccountService` and `TrialGrantService` within atomic Prisma transactions.
  4. Build `TenantManagementController` and `TenantOnboardingController` with RFC 7807 error envelopes.
- **Verification Gate:** Full onboarding lifecycle automated test creating Org, Profile, Mock Billing Account, and Trial Pool.

---

### Phase 3: Operational Overrides & Impersonation Engine
- **Deliverables:**
  1. Implement `OperationalOverridesService`:
     - Proctoring sensitivity relaxation (bounded $\le 72$ hours).
     - Schedule extension with calendar boundary checks.
     - Mid-drive question correction with atomic version-and-rebind (INV-OVR-01).
     - Custom invite ratio overrides (>5:1 with mandatory ticket ref).
  2. Implement `ImpersonationService`:
     - 30-minute hard-expiry JWT minting.
     - Dual-actor audit context propagation (`AsyncLocalStorage`).
     - Tenant-only authority barrier verification.
  3. Implement `AuditService` with append-only writer and unified query engine merging platform and billing audit streams.
- **Verification Gate:** CI assertion that question fix does not mutate started candidate sessions; verification that impersonation token cannot access `/platform/*`.

---

### Phase 4: Frontend Super Admin Web SPA (`frontend/super-admin-web`)
- **Deliverables:**
  1. Scaffold `frontend/super-admin-web` (Vite, React 18, TypeScript, TailwindCSS/Vanilla CSS tokens).
  2. Build Core Platform Shell:
     - Header with Global Search (Org name, domain, billing ID, drive UUID).
     - Navigation sidebar, theme engine, and active impersonation warning banner.
  3. Implement Pages:
     - **Platform Overview (`/`):** PII-blind health cards, needs-attention radar.
     - **Tenants Directory (`/tenants`):** Search, filtering, status badges.
     - **Tenant 360 (`/tenants/:id`):** 6-tab cockpit (Overview, Users, Drives, Billing, Overrides, Audit).
     - **Onboarding Wizard (`/tenants/new`):** Resumable 6-step wizard.
     - **Overrides Console (`/overrides`):** Active/history tables and creation modal.
     - **Staff & Audit (`/staff` & `/audit`):** Operator directory and unified audit log explorer.
- **Verification Gate:** End-to-end user journeys working seamlessly against mock backend.

---

### Phase 5: Cross-Team Integration & CI Verification
- **Deliverables:**
  1. Swap mock services with real Half 2 services (`BillingAccountService`, `TrialGrantService`, `ManualBillingRequestController`).
  2. Execute the **Ten-Step Cross-Team Integration Sequence** defined in `07-half1-half2-integration-contract.md`.
  3. Run Automated CI Contract Test Suite:
     - Schema invariant tests.
     - PII-Blindness assertions (ensures zero candidate email/name leakage in any platform API response).
     - Dual-actor audit log consistency tests.
- **Verification Gate:** 100% green contract tests and sign-off from Product/Technical Lead.
