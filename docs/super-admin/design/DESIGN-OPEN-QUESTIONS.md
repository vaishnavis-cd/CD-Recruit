# Design Open Questions Register & Resolution Log

**Project:** Proctora / CD-Recruit — Super Admin / Platform Ops & Credit/Billing Engine  
**Tracking Document:** `codebase/docs/super-admin/DESIGN-OPEN-QUESTIONS.md`  
**Classification:** Pre-Implementation Architectural Register  
**Last Updated:** 2026-09-28 (Post Stakeholder Decision Pass)  

---

## Open Questions Resolution Status Table

| ID | Title | Impacted Artifacts | Decision Owner | Resolution & Decision | Status |
|---|---|---|---|---|---|
| **OQ-01** | Super Admin Backend Deployment Boundary | 01, 04, 07, ADR-001 | Ragul Arumugam | **LOCKED (Option A):** Dual-entrypoint modular monolith. Same codebase, two deployable containers (`main.ts` & `main.platform.ts`). Complete fault isolation without microservice overhead. | `RESOLVED` |
| **OQ-02** | Staff Identity & Role Segregation Model | 01, 03, 06, ADR-002 | Ragul Arumugam | **LOCKED (Scope & Split):** Dedicated `platform.platform_staff` table and `PlatformStaffRole` (`SUPPORT`, `FINANCE`, `OWNER`). Complete token isolation. | `RESOLVED` |
| **OQ-03** | PostgreSQL Multi-Schema vs Single Schema | 03, ADR-003 | Ragul Arumugam | **LOCKED (Scope & Split):** Multi-schema PostgreSQL (`public`, `billing`, `platform`) with Prisma 5.22 `multiSchema` preview feature and least-privilege DB roles. | `RESOLVED` |
| **OQ-04** | First-User Role for Trial Signups | 01, 05, 07 | Ragul Arumugam | **LOCKED:** Bundled tenant-side `OWNER` role (Recruiter + Billing Admin) for low-friction trial activation. | `RESOLVED` |
| **OQ-05** | Credit Card Requirement at Trial Signup | 01, 02, 05 | Ragul Arumugam | **LOCKED:** **No card required.** Abuse bounded by verified corporate email domain, 5:1 invite bloat-guard, and 25-credit cap. | `RESOLVED` |
| **OQ-06** | Self-Serve vs Sales-Assisted Signup Channel | 01, 05, 07 | Ragul Arumugam | **LOCKED:** Sales/support-assisted wizard in Super Admin for v1; self-serve signup unlocked in v2. | `RESOLVED` |
| **OQ-07** | Second-Trial Manual Override Policy | 02, 04, 05 | Ragul Arumugam | **LOCKED:** Requires `ManualBillingRequest` (kind: `GRANT`, source: `GOODWILL`), CRM ticket ref, and maker-checker approval (`requester != approver`). | `RESOLVED` |
| **OQ-08** | Lapsed-Trial Win-Back Nudge Cadence | 01, 02, 06 | Ragul Arumugam | **LOCKED:** Nudges at 7 days before expiry, 48 hours before expiry, and day-of expiry. Flips to `DORMANT` at 30 days. | `RESOLVED` |
| **OQ-09** | Mid-Drive Question Correction Snapshot | 02, 04, 06, ADR-005 | Ragul Arumugam | **LOCKED:** **No in-place edits.** Creates new immutable Question version; rebinds strictly to unstarted sessions (`NOT_STARTED`). | `RESOLVED` |
| **OQ-10** | Impersonation Approval Bar & Escalation | 02, 04, 06 | Ragul Arumugam | **LOCKED:** Any `SUPPORT` or `FINANCE` staff can initiate with mandatory ticket ID. Time-boxed to 30 mins; tenant-only scope; dual-audit logging. | `RESOLVED` |
| **OQ-11** | BYOK Pricing & Margin Alarm Calibration | 01, 02 | Ragul Arumugam | **LOCKED:** **Parked / Deferred** to future phase per Intent document. | `PARKED` |
| **OQ-12** | Retention & Appeal Window Override Range | 02, 03, 05, ADR-008 | Ragul Arumugam | **LOCKED:** Base 30 days retention + 14 days appeal. Override bounded [14, 90] days for standard enterprise; up to 365 days for compliance extreme. | `RESOLVED` |
| **OQ-13** | Pricing Catalog Initial Launch Baseline | 01, 04, 05, ADR-007 | Ragul Arumugam | **LOCKED:** Initial provisional seed at ₹50 / credit (5000 minor units). Updateable later via versioned price book. | `RESOLVED` |
| **OQ-14** | Side-Door Remediation Scope for Phase 0 | 02, 04, 07, ADR-010 | Ragul Arumugam | **LOCKED:** **Immediate Phase 0 execution approved.** Refactor auto-transitions in `proctoring`, `sql`, `coding`, and `mcq` services into `beginSession`. | `RESOLVED (Approved for Execution)` |

---

## Summary Verdict on Decision Register
All 14 open questions have been definitively answered and locked with stakeholder approval. Zero blocking domain ambiguities remain.
