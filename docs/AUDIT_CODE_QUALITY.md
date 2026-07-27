# CD-Recruit — Repository Code Quality Audit (Discovery Findings)

> **Audit Type:** Read-Only Discovery Pass  
> **Scope:** Entire Monorepo (`backend/api`, `backend/correlation-engine`, `frontend/admin-web`, `frontend/candidate-web`, `packages/shared-types`)  
> **Constraint:** No code modified, deleted, or refactored during this discovery pass.

---

## Section 1: File Size Census

This census lists all source files in the monorepo exceeding 300 Lines of Code (LOC), categorized by application module and severity.

* **Critical (>2,000 LOC):** None identified.
* **High (>500 LOC):** 13 files identified.
* **Moderate (300–500 LOC):** 10 files identified.

| File Path | LOC | App / Module | Severity |
| :--- | :--- | :--- | :--- |
| `frontend/admin-web/src/routes/reports.tsx` | **959** | Admin Web | **High** |
| `frontend/admin-web/src/routes/drives._id.tsx` | **949** | Admin Web | **High** |
| `frontend/admin-web/src/lib/store.ts` | **925** | Admin Web | **High** |
| `backend/api/src/drive/drive.service.ts` | **813** | Backend API | **High** |
| `frontend/admin-web/src/routes/dashboard.tsx` | **808** | Admin Web | **High** |
| `frontend/admin-web/src/routes/questions.tsx` | **740** | Admin Web | **High** |
| `backend/api/src/session/session.service.ts` | **720** | Backend API | **High** |
| `frontend/admin-web/src/routes/invites.tsx` | **707** | Admin Web | **High** |
| `frontend/admin-web/src/routes/results.tsx` | **682** | Admin Web | **High** |
| `frontend/admin-web/src/routes/results._id.tsx` | **645** | Admin Web | **High** |
| `backend/prisma/seed.ts` | **524** | Database | **High** |
| `backend/api/src/admin/dashboard.service.ts` | **506** | Backend API | **High** |
| `frontend/admin-web/src/routes/settings.tsx` | **493** | Admin Web | **Moderate** |
| `frontend/candidate-web/src/components/InFictionInbox.tsx` | **490** | Candidate Web | **Moderate** |
| `backend/api/src/simulation/simulation.service.ts` | **457** | Backend API | **Moderate** |
| `backend/api/src/coding/coding.service.ts` | **455** | Backend API | **Moderate** |
| `backend/api/src/proctoring/proctoring.service.ts` | **429** | Backend API | **Moderate** |
| `backend/api/src/admin/admin.service.ts` | **402** | Backend API | **Moderate** |
| `backend/api/src/sql/sql.service.ts` | **388** | Backend API | **Moderate** |
| `backend/api/src/question/question.service.ts` | **378** | Backend API | **Moderate** |
| `backend/api/src/admin/invite.service.ts` | **372** | Backend API | **Moderate** |
| `frontend/candidate-web/src/store/sessionMachine.ts` | **358** | Candidate Web | **Moderate** |
| `backend/correlation-engine/app/scoring/consistency/engine.py` | **309** | Correlation Engine | **Moderate** |

---

## Section 2: God-File Responsibility Breakdown

Below is an inventory of responsibilities held by each oversized file (>500 LOC).

### 1. `frontend/admin-web/src/routes/reports.tsx` (959 LOC)
* **Candidate Result Summary Rendering**: Displays top-level score cards, pass/fail badges, and duration metrics.
* **Radar & Bar Chart Visualizations**: Renders competency skill charts inline using SVG/CSS chart primitives.
* **Proctoring Anomaly Log**: Displays webcam snapshot clips, audio breach markers, and tab-switch timelines.
* **Answer Detail Inspector**: Renders candidate response payloads across MCQ, SQL, Coding, and Simulation modules.
* **PDF Export & Download Triggers**: Handles client-side PDF document generation and print styling.
* **Inline Filter & Search State**: Manages local search state for candidate response lookup.

### 2. `frontend/admin-web/src/routes/drives._id.tsx` (949 LOC)
* **Drive Detail View**: Renders drive metadata, schedule dates, target role templates, and recruitment rules.
* **Candidate Roster Table**: Renders paginated candidate table with status badges and score indicators.
* **CSV File Upload & Validation**: Renders drag-and-drop CSV upload dropzone, parses client headers, and displays error feedback.
* **Batch Invite Modal**: Renders modal dialog for sending candidate invitations with expiration controls.
* **Drive Stats & Score Distribution Cards**: Calculates and renders pass rate progress bars and score distribution binned histograms.

### 3. `frontend/admin-web/src/lib/store.ts` (925 LOC)
* **Monolithic Global State**: Single Zustand store instance managing 12+ separate state slices.
* **Auth & Staff User State**: Manages JWT tokens, current staff user profile, and role permissions.
* **Drive Management State**: Stores active drive selection, drive lists, and drive CRUD actions.
* **Question Bank State**: Caches question lists, tag filters, search terms, and question CRUD actions.
* **Candidate Roster State**: Stores candidate lists, invite status filters, and invite dispatch handlers.
* **Report & Analytics Cache**: Caches candidate score summaries, detailed evaluation reports, and proctor logs.
* **System Settings State**: Manages global proctoring sensitivity thresholds and application settings.

### 4. `backend/api/src/drive/drive.service.ts` (813 LOC)
* **Drive Entity Lifecycle**: Handles creation, updating, archiving, and retrieval of recruitment drives.
* **CSV Parsing & Validation**: Ingests uploaded candidate CSV buffers, parses columns (`name`, `email`, `role`), and validates email formats.
* **Candidate Deduplication**: Checks incoming CSV candidates against existing database profiles to prevent duplicate creation.
* **Invite Token Batch Dispatch**: Generates cryptographic invite tokens, attaches expiration times, and queues invitation records.
* **Roster Analytics Aggregation**: Calculates drive pass rates, completed session counts, and candidate score averages.

### 5. `frontend/admin-web/src/routes/dashboard.tsx` (808 LOC)
* **Recruiter Overview Metrics**: Renders top summary cards (total drives, candidate volume, average pass rate, flagged sessions).
* **Recent Activity Feed**: Renders timeline log of recent candidate submissions and recruiter actions.
* **Drive Leaderboard**: Renders active recruitment drives ranked by completion percentage.
* **Quick Invitation Trigger**: Renders inline form to quickly dispatch individual candidate invites.

### 6. `frontend/admin-web/src/routes/questions.tsx` (740 LOC)
* **Question Bank Table**: Renders paginated question list with difficulty tags and category filters.
* **Question Editor Modal**: Multi-step modal for creating/editing MCQ, SQL, Coding, and Prompting questions.
* **Coding Test Case Editor**: Interface for adding public/hidden test case inputs and expected outputs.
* **SQL Schema & Seed Data Editor**: Interface for writing table DDL and expected query output matrices.

### 7. `backend/api/src/session/session.service.ts` (720 LOC)
* **Session Initialization & Verification**: Validates candidate tokens, verifies schedule windows, and creates `TestSession` records.
* **Section State Machine Transitions**: Governs candidate movement between assessment modules (MCQ $\rightarrow$ Coding $\rightarrow$ Simulation).
* **Time Gate & Heartbeat Validation**: Validates session timers, detects stale candidate connections, and triggers disconnection grace periods.
* **Auto-Submission on Expiration**: Automatically finalizes abandoned or expired test sessions.
* **Final Score Aggregation**: Aggregates module sub-scores into a composite 0-100 score and computes the Say-Do Consistency metric.

---

## Section 3: Cross-Module Duplication Findings (5 Assessment Modules)

The five assessment modules (**MCQ, SQL, Coding, AI Prompting, Contextual Simulation**) share core operational requirements, but currently implement them with duplicate code structures:

### 1. Backend Evaluation & Scoring Duplication
* **Submission Persistence**: `coding.service.ts`, `sql.service.ts`, `simulation.service.ts`, and `session.service.ts` each implement independent Prisma update queries to create `QuestionSubmission` records, serialize response JSON payloads, and log timestamps.
* **Score Normalization**: Each module independently calculates raw scores and normalizes them to a 0–100 scale using duplicated percentage math instead of a shared `ScoreCalculator` utility.
* **Time & Expiration Checks**: Each module re-checks session time remaining and section lock states with separate `if (session.expiresAt < new Date())` condition blocks.
* **Missing Common Interface**: There is no standard `AssessmentModuleEngine` interface or abstract base class. Adding a 6th assessment module would require re-writing boilerplate routes, DTO mappers, and submission wrappers.

### 2. Frontend Component Duplication
* **Autosave & Draft Debouncing**: `CodingPage.tsx`, `InFictionInbox.tsx`, and module components in `candidate-web` implement separate `setInterval` / `useEffect` timers to debounce and push candidate draft answers to the API.
* **Submission Feedback Toasts & Loading States**: Each module reimplements local loading spinners, error alerts, and submission confirmation modals.

---

## Section 4: Hardcoded-vs-Dynamic Audit

| File Location | Hardcoded Value | Expected Dynamic / Single-Source Value |
| :--- | :--- | :--- |
| `frontend/admin-web/src/lib/store.ts:14` | `"http://localhost:3001/api/v1"` | `import.meta.env.VITE_API_BASE_URL` |
| `frontend/candidate-web/src/services/time/real.ts:4` | `'/api/v1'` fallback string | Shared configuration token |
| `frontend/candidate-web/src/App.tsx:15` | `'demo-token-2024'` default route | Environment-driven or dynamic routing |
| `backend/api/src/config/configuration.ts:27-32` | `45s` stale, `300s` grace, `3` max disconnects | Configurable via database `SystemSettings` |
| `frontend/admin-web/src/routes/drives._id.tsx` | Page size `10` hardcoded in state | User-configurable pagination default constant |
| `frontend/admin-web/src/routes/invites.tsx` | Page size `10` hardcoded in state | Shared `DEFAULT_PAGE_SIZE` constant |
| `frontend/admin-web/src/routes/questions.tsx` | Page size `10` hardcoded in state | Shared `DEFAULT_PAGE_SIZE` constant |
| `frontend/admin-web/src/routes/results.tsx` | Page size `10` hardcoded in state | Shared `DEFAULT_PAGE_SIZE` constant |
| Multiple admin-web route files | `"SUPER_ADMIN"`, `"RECRUITER"` string literals | `StaffRole` enum imported from `@cd-recruit/shared-types` |
| `backend/api/src/coding/coding.service.ts` | Language IDs `54`, `62`, `71`, `63` inline | `Judge0Language` enum / config map |

---

## Section 5: Frontend Reusability Audit (Both SPAs)

### 1. `frontend/admin-web` Component Reusability
* **Duplicate HTML Table Implementations**: `drives._id.tsx`, `invites.tsx`, `questions.tsx`, `reports.tsx`, and `results.tsx` each copy-paste complete `<table>`, `<thead>`, `<tbody>`, `<tr>`, pagination button rows, and empty state containers (~1,500 cumulative LOC of duplicated table boilerplate) instead of using a single parameterized `<DataTable<T>>` component.
* **Search & Filter Headers**: Identical search text inputs, status dropdown selectors, and date pickers are re-implemented across 5 route files.
* **Modal Dialog Structure**: Backdrop overlays, modal headers, body containers, and footer button rows are duplicated across `drives._id.tsx` (Invite Modal), `questions.tsx` (Question Form Modal), and `invites.tsx` (Batch Modal).
* **Prop Drilling**: Views read from the global Zustand store at the route root and pass properties down 3 to 4 component levels to inner table rows and badges.

### 2. `frontend/candidate-web` Component Reusability
* **Monolithic `InFictionInbox.tsx` (490 LOC)**: Renders ticket list sidebar, active chat message stream, message composer, action buttons, and scenario timer in one single component file.
* **Timer Component Logic**: `Timer.tsx` duplicates countdown formatting and warning thresholds already tracked in `sessionMachine.ts`.

---

## Section 6: Backend Coupling Audit

### 1. Bypass of Domain Abstractions / Repositories
* **`session.service.ts`**: Directly performs raw Prisma queries on `this.prisma.proctoringLog`, `this.prisma.simulationEvent`, and `this.prisma.competencyScore` rather than delegating to dedicated module domain providers.
* **`drive.service.ts`**: Handles CSV buffer parsing, string regex validation, candidate entity creation, AND database transaction logic within a single class method.

### 2. Controller Responsibility Creep
* **`admin.controller.ts` & `session.controller.ts`**: Contain inline parameter transformations, date parsing, and response mapping logic instead of delegating to NestJS `Pipes` and `DTO` transformers.

### 3. Repeated Prisma Query Patterns
* Active drive lookups (`where: { driveId, status: InviteStatus.PENDING }`) and candidate user lookups are duplicated identically across `admin.service.ts`, `drive.service.ts`, `invite.service.ts`, and `dashboard.service.ts`.

---

## Section 7: Dead Code & Unused Artefacts

1. **`frontend/shared/` Directory**: Unused scaffold directory (`components`, `constants`, `hooks`, `types`, `utils`). Its `types/index.ts` file merely re-exports `@cd-recruit/shared-types`.
2. **`backend/api/src/common/pipes/uuid-validation.pipe.ts`**: Custom pipe that duplicates NestJS's built-in `ParseUUIDPipe`.
3. **Hardcoded Demo Token (`demo-token-2024`)**: Hardcoded fallback token route in `candidate-web/src/App.tsx` and `candidate-web/src/routes/SessionRouter.tsx`.

---

## Section 8: Test Coverage Gaps

* **`backend/api/src/drive/drive.service.ts` (813 LOC)**: **0% unit test coverage**.
* **`backend/api/src/session/session.service.ts` (720 LOC)**: **0% unit test coverage**.
* **`backend/api/src/admin/dashboard.service.ts` (506 LOC)**: **0% unit test coverage**.
* **`frontend/admin-web` (All 9 route files & Zustand store)**: **0% automated component / UI test coverage**.
* **Existing Tests**: Only 1 small test file exists in the repository: `backend/correlation-engine/tests/test_correlation.py` (17 LOC).

---

## Section 9: Ranked Top-10 Highest-Leverage Fixes

The following is a ranked list of recommended architectural improvements, ordered by impact on code health, maintainability, and complexity reduction:

1. **Decompose Monolithic Zustand Store (`admin-web/src/lib/store.ts` - 925 LOC)**
   * *Reasoning:* Splitting the 925 LOC store into focused domain slices (`useAuthStore`, `useDriveStore`, `useQuestionStore`, `useResultStore`) will prevent unnecessary component re-renders and isolate state side-effects.

2. **Extract Reusable `<DataTable<T>>` Component in `admin-web`**
   * *Reasoning:* Eliminates ~1,500 lines of copy-pasted table markup and pagination controls across `drives._id.tsx`, `invites.tsx`, `questions.tsx`, `reports.tsx`, and `results.tsx`.

3. **Decompose `drive.service.ts` (813 LOC)**
   * *Reasoning:* Separating CSV parsing (`CsvIngestionService`), candidate creation (`CandidateService`), and drive management (`DriveService`) adheres to Single Responsibility Principle and enables unit testing.

4. **Establish Unified `AssessmentModuleEngine` Interface**
   * *Reasoning:* Standardizing answer submission, score calculation, and section timing across MCQ, SQL, Coding, Prompting, and Simulation removes duplicated grading boilerplate.

5. **Decompose `session.service.ts` (720 LOC)**
   * *Reasoning:* Splitting session state transitions (`SessionStateMachine`), timer/grace windows (`SessionLifecycleService`), and final score calculation (`SessionScoringService`) cleans up core business logic.

6. **Extract View Sub-Components from `reports.tsx` (959 LOC) & `drives._id.tsx` (949 LOC)**
   * *Reasoning:* Modularizing 900+ LOC route files into focused components (`CandidateReportSummary`, `ProctoringTimeline`, `CandidateRoster`) dramatically improves code readability and maintainability.

7. **Centralize Hardcoded Config & Enums**
   * *Reasoning:* Replacing inline string literals (e.g., `"http://localhost:3001/api/v1"`, role strings) with typed configuration constants prevents silent runtime configuration bugs.

8. **Remove Unused `frontend/shared/` Directory**
   * *Reasoning:* Deletes redundant directory scaffolding to maintain a clean single-source-of-truth import strategy from `@cd-recruit/shared-types`.

9. **Extract Common Prisma Query Repositories**
   * *Reasoning:* Replaces repeated drive and candidate lookup queries across `admin.service.ts`, `drive.service.ts`, `invite.service.ts`, and `dashboard.service.ts` with shared repository methods.

10. **Add Unit Test Suite for Core Engine Services**
    * *Reasoning:* Writing unit tests for `session.service.ts`, `drive.service.ts`, and `coding.service.ts` provides safety against regressions during future feature additions.
