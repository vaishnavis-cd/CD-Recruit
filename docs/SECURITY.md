# CD-Recruit — Security Policy & Architectural Controls

This document details the security architecture, environment gating controls, authentication safeguards, and sandboxing boundaries enforced across the CD-Recruit platform.

---

## 1. Authentication & Dev Token Bypass Controls

### Staff JWT Authentication
All admin and recruiter API endpoints under `/api/v1/admin/*` require a valid JSON Web Token (`JWT`) passed in the `Authorization: Bearer <token>` header.

### Dev-Token Bypass Endpoint (`GET /api/v1/auth/dev-token`)
* **Purpose:** Provides local developers and automated E2E test suites with rapid JWT token generation without requiring Keycloak or external SSO setup.
* **Location:** `backend/api/src/auth/auth.controller.ts:24-34`
* **Environment Gating:**
  ```typescript
  if (process.env.NODE_ENV === "production") {
    throw new ForbiddenException("dev-token endpoint is disabled in production");
  }
  ```
* **Security Behavior:** When `NODE_ENV=production`, any request to `GET /api/v1/auth/dev-token` immediately throws an HTTP `403 ForbiddenException`. In non-production environments (`NODE_ENV=development` or `local`), it generates a scoped JWT token for testing.

---

## 2. DPDP Act (2023) Legal Consent Persistence

* **Endpoint:** `POST /api/v1/sessions/:sessionId/consent`
* **Controller:** `CandidateController` (`backend/api/src/candidate/candidate.controller.ts`)
* **Compliance Controls:**
  1. Captures explicit candidate consent for `TERMS`, `BIOMETRIC`, `SELFIE`, and `AUDIO` consent types.
  2. Extracts candidate remote IP address from `x-forwarded-for` request headers.
  3. Records immutable timestamped audit logs in PostgreSQL.
  4. Enforces strict request body validation via `RecordConsentDto`.

---

## 3. Sandboxed Code & SQL Execution

### Coding Challenges (Judge0 CE Engine)
* Candidate code is **never** executed locally on host Node.js processes or using `child_process.exec()`.
* Submissions run inside isolated Linux `Isolate` sandboxes managed by `judge0-worker`.
* Kernel Security Primitives:
  * **cgroups v1/v2:** 5.0s CPU time limit, 256MB RAM cap, 64 process/thread limit.
  * **Linux Namespaces (`CLONE_NEWNET`):** Network stack is completely unmapped, blocking outbound network access.
  * **Mount Namespace + `chroot`:** Host filesystems (`/etc/passwd`, `.env`) are unmounted and invisible.

### SQL Queries (PostgreSQL Runner)
* Executed under dedicated `sql_sandbox_runner` database role.
* Queries matching mutating keywords (`UPDATE`, `DELETE`, `DROP`, `ALTER`, `SET ROLE`) or catalog tables (`pg_authid`, `pg_shadow`) are rejected with `BadRequestException`.
* Dynamic temporary schemas are dropped in `finally` cleanup blocks.
