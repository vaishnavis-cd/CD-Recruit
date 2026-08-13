# CD-Recruit — Changelog

All notable technical updates, architectural refactors, and audit fixation entries are documented in this file.

---

## [Phase 2 Stabilization Fixation] — August 6, 2026

### Added / Fixed
- **CandidateController Wiring (Item 0):** Wired `CandidateController` into `CandidateModule` (`controllers: [CandidateController]`). Activated `POST /api/v1/sessions/:sessionId/consent` endpoint for DPDP Act (2023) §6 legal consent logging with IP address tracking. Added regression test (`candidate.module.spec.ts`).
- **Store & Adapter Decoupling (Item 1):** Removed top-level import of `sessionMachine.ts` from `services/cv/real.ts`. Wrapped adapter creation in `createRealCvDetectionAdapter` to eliminate structural circular dependency with `services/index.ts`.
- **Queue & Session Module Decoupling (Item 2):** Extracted `SessionStatusPort` in `common/ports/session-status.port.ts`. Updated `HeartbeatService` and `GraceWindowProcessor` to depend on `SessionStatusPort`. Removed `forwardRef()` from `SessionModule` and `QueueModule`.
- **Dev-Token Bypass Verification (Item 3):** Verified `GET /api/v1/auth/dev-token` is environment-gated with `NODE_ENV === "production"` check (throws HTTP 403 in production). Documented security boundaries in `docs/SECURITY.md`.
- **LOC Baseline (.clocignore) (Item 4):** Added `.clocignore` excluding `package-lock.json` and `**/public/mediapipe/**` vendor binaries. Established true hand-written baseline of ~55.7k TypeScript lines.
- **Dead Code Cleanup (Item 5):** Permanently deleted `frontend/admin-web/src/components/session-detail.tsx` (superseded inline in `routes/results.$id.tsx`) and `frontend/candidate-web/src/store/session.store.ts` (unused compatibility shim). Verified zero incoming import breaks.
- **Documentation Audit & Supersession (Item 6 & 7):** Updated `API_CONTRACT.md`, `DATABASE.md`, `DTO.md`, `SECURITY.md`, and added supersession header notices to Phase 0 audit reports.

---

## [Phase 0 Security & Stabilization] — July 31, 2026

### Security Hardening
- **Judge0 Security:** Removed bare-metal fallback execution (`runLocalFallback`). Judge0 API failures return `ExecutionStatus.FAILED` infrastructure alerts; untrusted code is never executed on host process.
- **SQL Sandbox:** Hardened `sql-sandbox.service.ts` against role manipulation (`SET ROLE`), timeout manipulation, dynamic schemas, and non-read-only queries.
- **Contextual Simulation:** Verified static template fallback (`EventGenerationService`); live LLM calls disabled in active candidate paths. Docker containers isolated with `--network none --cpus 0.5 --memory 512m`.
- **Scoring & Routing:** Dynamic `aiConfidence` calculation replacing canned 0.85 default. Auto-publishing vs human review queue routing enforced against `aiConfidenceThreshold`.
