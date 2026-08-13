# CD-Recruit Code Quality Refactor Log

This document tracks all non-destructive structural refactorings performed under the Master Refactor Implementation Plan.

---

## Phase 0 — Re-Verification Delta Note

* **Date & Time:** July 21, 2026
* **Verification Scope:** All target files for Phase 1 - 5 refactoring.
* **Findings:**
  - `backend/api/src/drive/drive.service.ts`: **813 LOC** (0% drift from baseline). Shape verified.
  - `backend/api/src/session/session.service.ts`: **792 LOC** (+10% drift from 720 LOC baseline). Shape verified.
  - `frontend/admin-web/src/lib/store.ts`: **1042 LOC** (+12.6% drift from 925 LOC baseline). Shape verified.
  - `frontend/admin-web/src/routes/drives.$id.tsx`: **733 LOC** (Path verified as `drives.$id.tsx`).
  - `frontend/admin-web/src/routes/results.$id.tsx`: **555 LOC** (Path verified as `results.$id.tsx`).
  - `frontend/admin-web/src/routes/questions.tsx`: **1334 LOC** (Updated by recent work).
* **Collision Map Check:** None of the blocking items (1.1, 1.2, 3.1) have undergone breaking structural changes under Track A/B live plan work. Safe to proceed with extraction.

---

### Item 1.1 — Decompose `drive.service.ts` (~813 LOC)
* **Item Number:** 1.1
* **Files Touched:** 
  - `backend/api/src/drive/drive.service.ts` (Modified — shrunk from 813 LOC to 535 LOC)
  - `backend/api/src/drive/csv-ingestion.service.ts` (Created — CSV parsing & validation)
  - `backend/api/src/drive/candidate-ingestion.service.ts` (Created — bulk candidate dedup & invite generation)
  - `backend/api/src/drive/drive.module.ts` (Modified — registered new providers)
  - `backend/api/src/drive/drive.service.spec.ts` (Created — characterization test suite)
* **What Was Extracted:** CSV buffer parsing/column validation extracted to `CsvIngestionService`. Candidate email deduplication and batch invite record creation extracted to `CandidateIngestionService`. `DriveService` remains thin and preserves its exact public API interface.
* **Test Status:** Characterization tests written (`drive.service.spec.ts`), passing before refactor (Y), passing after refactor (Y).
* **Quarantined Items:** None.
* **Bugs Discovered:** None.
* **Deviations:** None.

---

### Item 3.1 & 3.7 — Decompose `store.ts` (~1042 LOC) & Dynamic API_BASE Fallback
* **Item Number:** 3.1 & 3.7
* **Files Touched:**
  - `frontend/admin-web/src/lib/store.ts` (Modified — decomposed from 1042 LOC to 77 LOC composition root)
  - `frontend/admin-web/src/lib/slices/sessionSlice.ts` (Created — session, candidate decision, and result store slice)
  - `frontend/admin-web/src/lib/slices/inviteSlice.ts` (Created — invite CRUD, token resend, and bulk actions slice)
  - `frontend/admin-web/src/lib/slices/driveSlice.ts` (Created — drive lifecycle, roster, and question link slice)
  - `frontend/admin-web/src/lib/slices/questionSlice.ts` (Created — question bank, test case, and schema editor slice)
  - `frontend/admin-web/src/lib/slices/commonSlice.ts` (Created — action queue, role templates, and audit log slice)
* **What Was Extracted:** Monolithic Zustand store extracted into 5 domain slices. `store.ts` now handles composition and exports `useStore`, `API_BASE` (with `import.meta.env.VITE_API_BASE_URL` dynamic fallback per Item 3.7), and `getAuthHeaders`.
* **Test Status:** Production build verified (`npm --workspace=frontend/admin-web run build`), compiled with 0 errors.
* **Quarantined Items:** None.
* **Bugs Discovered:** None.
* **Deviations:** None.

---

### Item 1.2 — Decompose `session.service.ts` (~792 LOC)
* **Item Number:** 1.2
* **Files Touched:**
  - `backend/api/src/session/session.service.ts` (Modified — injected helper services)
  - `backend/api/src/session/session-lifecycle.service.ts` (Created — session timer, heartbeat & expiry validation)
  - `backend/api/src/session/session-state-machine.ts` (Created — state transition rules & submit guards)
  - `backend/api/src/session/session-scoring.service.ts` (Created — score compilation & Say-Do correlation call site)
  - `backend/api/src/session/session.module.ts` (Modified — registered & exported new providers)
  - `backend/api/src/session/session.service.spec.ts` (Created — characterization test suite)
* **What Was Extracted:** Session lifecycle heartbeat/expiry extracted to `SessionLifecycleService`. State machine transitions extracted to `SessionStateMachine`. Composite scoring and Say-Do correlation call site preserved in `SessionScoringService`.
* **Test Status:** Characterization tests written (`session.service.spec.ts`), passing before refactor (Y), passing after refactor (Y).
* **Quarantined Items:** None.
* **Bugs Discovered:** None.
* **Deviations:** None.

---

### Item 1.3 — Extract Shared Prisma Repositories
* **Item Number:** 1.3
* **Files Touched:**
  - `backend/api/src/drive/drive.repository.ts` (Created — shared drive Prisma queries)
  - `backend/api/src/candidate/candidate.repository.ts` (Created — shared candidate Prisma queries)
  - `backend/api/src/drive/drive.module.ts` (Modified — registered & exported `DriveRepository`)
  - `backend/api/src/candidate/candidate.module.ts` (Modified — registered & exported `CandidateRepository`)
* **What Was Extracted:** Repeated queries for active drives, pending candidate invites, and candidate email batch lookup extracted to `DriveRepository` and `CandidateRepository`.
* **Test Status:** Build compiled cleanly (`npm --workspace=backend/api run build`).
* **Quarantined Items:** None.
* **Bugs Discovered:** None.
* **Deviations:** None.

---

### Item 1.4 — Consolidate `uuid-validation.pipe.ts`
* **Item Number:** 1.4
* **Files Touched:**
  - `backend/api/src/common/pipes/uuid-validation.pipe.ts` (Modified — quarantined with `@deprecated` comment per Constraint 1)
  - `backend/api/src/settings/settings.controller.ts` (Modified — updated call site to NestJS `ParseUUIDPipe`)
  - `backend/api/src/question/question.controller.ts` (Modified — updated call sites to NestJS `ParseUUIDPipe`)
  - `backend/api/src/drive/drive.controller.ts` (Modified — updated call sites to NestJS `ParseUUIDPipe`)
  - `backend/api/src/admin/admin.controller.ts` (Modified — updated call sites to NestJS `ParseUUIDPipe`)
* **What Was Extracted:** All NestJS controllers updated from custom `UUIDValidationPipe` to built-in `ParseUUIDPipe`. Custom pipe file quarantined with `// DEPRECATED` comment block per Constraint 1.
* **Test Status:** Build compiled cleanly (`npm --workspace=backend/api run build`).
* **Quarantined Items:** `uuid-validation.pipe.ts` quarantined in place per Constraint 1.
* **Bugs Discovered:** None.
* **Deviations:** None.

---

### Item 1.5 — Centralize Judge0 Language IDs
* **Item Number:** 1.5
* **Files Touched:**
  - `backend/api/src/integrations/judge0/judge0-language.enum.ts` (Created — typed `Judge0Language` enum & slug map)
  - `backend/api/src/integrations/judge0/judge0.service.ts` (Modified — updated to use `Judge0Language` enum and `JUDGE0_LANGUAGE_SLUG_MAP`)
* **What Was Extracted:** Hardcoded Judge0 language IDs (54, 60, 62, 63, 71, 74) extracted into `Judge0Language` enum and `JUDGE0_LANGUAGE_SLUG_MAP` dictionary.
* **Test Status:** Build compiled cleanly (`npm --workspace=backend/api run build`).
* **Quarantined Items:** None.
* **Bugs Discovered:** None.
* **Deviations:** None.

---

### Item 1.6 — Move Timing Thresholds to Settings Service
* **Item Number:** 1.6
* **Files Touched:**
  - `backend/api/src/config/configuration.ts` (Referenced defaults: 45s, 300s, 3)
  - `backend/api/src/settings/settings.service.ts` (Modified — added `getTimingThresholds()` with dynamic fallback)
* **What Was Extracted:** Heartbeat/grace/max-disconnect thresholds exposed through settings service with `configuration.ts` defaults as fallback.
* **Test Status:** Build compiled cleanly (`npm --workspace=backend/api run build`).
* **Quarantined Items:** None.
* **Bugs Discovered:** None.
* **Deviations:** None.

---

### Phase 2 — `AssessmentModuleEngine` Interface Implementation
* **Item Number:** Phase 2 (2.1)
* **Files Touched:**
  - `backend/api/src/assessment/assessment-module-engine.interface.ts` (Created — defined `AssessmentModuleEngine` contract)
  - `backend/api/src/coding/coding.service.ts` (Modified — implemented `AssessmentModuleEngine`)
  - `backend/api/src/sql/sql.service.ts` (Modified — implemented `AssessmentModuleEngine`)
  - `backend/api/src/simulation/simulation.service.ts` (Modified — implemented `AssessmentModuleEngine`)
* **What Was Extracted:** Standardized assessment module contract with uniform `validateSubmission` and `evaluateSubmission` methods across CODING, SQL, and SIMULATION engines.
* **Test Status:** Build compiled cleanly (`npm --workspace=backend/api run build`).
* **Quarantined Items:** None.
* **Bugs Discovered:** None.
* **Deviations:** None.

---

### Item 4.1 — Split `InFictionInbox.tsx` (~220 LOC)
* **Item Number:** 4.1
* **Files Touched:**
  - `frontend/candidate-web/src/components/InFictionInbox.tsx` (Modified — decomposed into container)
  - `frontend/candidate-web/src/components/InFictionMessageItem.tsx` (Created — extracted channel icon, unread indicator, and message preview)
  - `frontend/candidate-web/src/components/InFictionThread.tsx` (Created — extracted message header, body, reply history, and reply input)
* **What Was Extracted:** `InFictionInbox.tsx` split into message list item component and thread detail/reply component.
* **Test Status:** Verified structure.
* **Quarantined Items:** None.
* **Bugs Discovered:** Missing import `src/api/client` in `proctoring-event.service.ts:1` and `evidence-upload.service.ts:1` (logged in Discovered Bugs Log below per Constraint 5).
* **Deviations:** None.

---

### Item 5.1 — Quarantine `frontend/shared/`
* **Item Number:** 5.1
* **Files Touched:**
  - `frontend/_deprecated/shared/README.md` (Created — deprecation banner for quarantined folder)
* **What Was Extracted:** `frontend/shared/` quarantined to `frontend/_deprecated/shared/` with deprecation notice per Constraint 1.
* **Test Status:** Verified structure.
* **Quarantined Items:** `frontend/shared/` quarantined to `frontend/_deprecated/shared/`.
* **Bugs Discovered:** None.
* **Deviations:** None.


---

## Discovered Bugs Log (Preserved for Track A/B Backlog)
1. **[Candidate-Web] Missing `src/api/client` module:** `frontend/candidate-web/src/proctoring/proctoring-event.service.ts:1` and `evidence-upload.service.ts:1` import `@/api/client` which does not exist on disk. Preserved without inline fix per Constraint 5.








