# CD-Recruit — Platform Audit & Status Report

> **Generated:** July 17, 2026  
> **Scope:** Full candidate track + admin platform comparison against execution plan, UX spec, and MVP architecture docs.

---

## Table of Contents

1. [What is Built & Working](#1-what-is-built--working)
2. [What is Incomplete — Functionality Breakdown](#2-what-is-incomplete--functionality-breakdown)
3. [Data Model Gaps](#3-data-model-gaps)
4. [Suggestions — What a Complete HackerRank-Like Platform Needs](#4-suggestions--what-a-complete-hackerrank-like-platform-needs)

---

## 1. What is Built & Working

### Backend — NestJS API

#### Session Lifecycle ✅
- `POST /sessions/start` — redeem invite token, create session with status `NOT_STARTED`
- `POST /sessions/:id/begin` — transition `NOT_STARTED → IN_PROGRESS`, compute `deadlineAt` server-side
- `POST /sessions/:id/close` — candidate explicit submit with deadline guard
- `POST /sessions/:id/selfie` — upload baseline selfie to MinIO, write `baselineSelfieRef`
- `POST /sessions/:id/heartbeat` — 15-second tab-alive signal, single-tab enforcement (returns 409 `SECOND_TAB_DETECTED`)
- `POST /sessions/:id/resume` — reconnect within grace window only
- `GET /sessions/:id/questions/:questionId` — fetch question with answer fields stripped
- Server-side deadline enforcement — `deadlineAt` computed and enforced at close/submit time
- Grace window BullMQ job → `autoSubmit` after expiry
- Heartbeat stale scan (`scanAndMarkStale`) → `markDisconnected`
- `disconnectCount >= 3` → auto `AUTO_SUBMITTED`
- `InviteTokenRateLimitGuard` on session start

#### Module Execution ✅
- **Coding:** `POST /coding/run` (sample cases only), `POST /coding/submit` (all cases, hidden stdout concealed), `POST /coding/draft`, `GET /coding/execution/:id`
- **SQL:** `POST /sql/run`, `POST /sql/submit`, `POST /sql/draft` — sandboxed Postgres execution, result comparison
- **MCQ:** draft + submit with server-side self-grading against `correctIndex`
- **AI Prompting:** draft + submit (stored; graded by correlation engine)
- All modules: `ModuleResponse` upsert with `isDraft` flag, `timeSpentSeconds`, `lastAutosavedAt`

#### Judge0 Integration ✅
- Language mapping: Python (71), JavaScript (63), TypeScript (74), Java (62), C++ (54), Go (60)
- Parallel submission of all test cases to Judge0
- Polling with retry (max 15 attempts, 2-second intervals)
- Status mapping: ACCEPTED/WRONG_ANSWER → COMPLETED, TIME_LIMIT_EXCEEDED → TIMEOUT, etc.
- stdout/stderr/compileOutput decoded from Base64
- Output normalization (`trim` + `toLowerCase` + whitespace collapse) for comparison
- **Run vs Submit distinction:** Run loops only `isHidden: false` test cases; Submit loops all test cases
- Hidden test case outputs are NOT returned to the candidate on submit
- Seed data includes proper `testCases` array with `{ input, expectedOutput, isHidden }` and `starterCode` per language

#### Admin Module ✅
- Session list (paginated, filtered by status/role/drive/search/needsReview, sortable)
- Session detail (candidate, module responses, integrity flags with presigned evidence URLs, score, reviewer decision)
- Record ADVANCE/REJECT decision with audit log, duplicate prevention
- Event timeline per session
- Integrity flags with disposition tracking
- Drive CRUD (create, list, detail, update, duplicate, close early, delete cascade)
- Drive question mapping, lock after links generated
- Bulk candidate add + `generate-links` (JWT signing per candidate)
- Invite management: create, list, revoke, extend expiry, regenerate token, bulk revoke/resend
- Full dashboard analytics: funnel, score histograms, say-do stats, timing metrics, integrity metrics, reviewer metrics
- Role templates listing, session score comparison, drive bulk export
- AuditLog on every write operation

#### Infrastructure ✅
- Prisma schema: 16 models, 11 enums — fully migrated
- `@cd-recruit/shared-types` — single source of truth for enums and types shared frontend ↔ backend
- JWT invite token signing + verification
- Keycloak JWT guard on all admin routes
- MinIO integration (putObject + presigned GET)
- Dual queue mode: BullMQ with Redis (full) / in-memory fake (local dev) via `INFRA_MODE` env var
- Dev seed script: generates real invite tokens, real test questions with `isHidden` test cases and per-language `starterCode`

---

### Frontend — candidate-web

#### Routes & Navigation ✅
All pages scaffolded and route-guarded:

| Page | Path | Status |
|---|---|---|
| Login | `/login` | ✅ Working |
| Lobby | `/lobby` | ✅ Scaffolded |
| System Check | `/system-check` | ✅ Scaffolded |
| Tutorial | `/tutorial` | ✅ Scaffolded |
| Waiting Room | `/waiting-room` | ✅ Scaffolded |
| Assessment Shell | `/assessment` | ✅ Working |
| Pre-Submit | `/pre-submit` | ✅ Scaffolded |
| Sync Validation | `/sync-validation` | ✅ Scaffolded |
| Thank You | `/thank-you` | ✅ Scaffolded |
| Too Early | `/too-early` | ✅ Scaffolded |
| Link Expired | `/link-expired` | ✅ Scaffolded |
| Error | `/error` | ✅ Working |

`RequireSession` guard: redirects to `/login` if no session, to `/error` on terminal status, to `/lobby` if `NOT_STARTED`.

#### State & Hooks ✅
- `useSessionStore` (Zustand): full session state, `startSession`, `resumeSession`, `beginSession`, `updateFromHeartbeat`, `setSecondTab`
- `sessionStorage` persistence — cross-reload session recovery works
- `useHeartbeat` — 15s interval, `SECOND_TAB_DETECTED` handling, status sync from server
- Per-tab `TAB_ID` for second-tab detection
- Theme store (light/dark)

#### Coding Module — CodingWorkspace ✅
- Monaco editor with syntax highlighting
- Language selector (Python, JavaScript, TypeScript, Java, C++, Go)
- Per-language starter code loaded from `question.content.starterCode`; defaults to boilerplate templates if question has none
- **Run (sample cases only):** calls `POST /coding/run`, shows per-case input/expected/actual output for visible test cases
- **Submit (all cases):** calls `POST /coding/submit`, shows pass/fail count; hidden case details concealed with "inputs hidden for security" message
- **Autosave — debounced 1.5s:** triggers `POST /coding/draft` 1.5 seconds after any keypress stops
- **Autosave on question switch:** `useEffect` cleanup calls `saveCodingDraft` on unmount (when navigating away to another question)
- Output terminal panel: tabbed (Test Cases / Compiler Output), collapsible
- Per-test-case granular results (input, expected, actual, pass/fail badge)
- Time + memory usage display
- `WatermarkOverlay` component built
- `SecondTabOverlay` component built

#### Assessment Shell ✅
- Loads questions from backend via `GET /sessions/:id/questions/:questionId`
- Question palette with status badges (answered/flagged/skipped/unvisited)
- Module sidebar navigation
- Server-authoritative countdown timer (synced from `deadlineAt`)
- Timer pressure warning at 10 minutes remaining
- Routes CODING questions to `CodingWorkspace`, others to textarea fallback
- Skip and Flag for Review buttons
- Auto-navigate to `/sync-validation` on deadline

#### Admin Web ✅
Routes: Dashboard, Drives, Drive Detail, Invites, Questions, Reports, Settings — all exist with TanStack Router file-based routing.

---

## 2. What is Incomplete — Functionality Breakdown

### 2.1 Session Progress Endpoint (Backend)
**What it should do:** `GET /sessions/:id/progress` returns per-question status (untouched/draft/submitted) so the frontend sidebar and pre-submit page can show accurate completion state.

**Current state:** Returns `501 Not Implemented` with message `"Not implemented — Phase 3"`.

**Impact:** Pre-submit review page cannot show how many questions were answered. Question palette statuses in `AssessmentShell` are tracked in local React state only — a page refresh loses all status badges.

---

### 2.2 MCQ Module — No Real Submit Wired (Frontend)
**What it should do:** When a candidate selects a radio option and clicks Submit, it should call `POST /sessions/:id/responses/submit` with `moduleType: "MCQ"` and `selectedIndex`. Server self-grades against `correctIndex` and locks the response.

**Current state:** The radio options render correctly from `question.content.options`. Clicking "Submit Answer" in the non-coding branch calls `updateQuestionStatus("answered")` locally and navigates to next. There is **no API call** — the answer is never sent to the backend.

**Impact:** MCQ answers are lost on refresh. No server-side scoring. `ModuleResponse` table has no MCQ entries after a session.

---

### 2.3 SQL Module — No Real Editor or API Calls (Frontend)
**What it should do:** Provide a SQL editor (CodeMirror or Monaco in SQL mode), a schema preview panel, a Run button (`POST /sql/run`), and a Submit button (`POST /sql/submit`).

**Current state:** SQL questions fall into the generic `textarea` branch in `AssessmentShell`. The textarea pre-fills with the schema and seedData as comments. The "Run Code" button calls `updateQuestionStatus("answered")` locally. The "Submit Answer" button also just updates local status. **No API calls to `/sql/run` or `/sql/submit` are made.**

**Impact:** SQL queries are never executed or saved. The `sql_execution` table and `SQLExecution` Prisma model exist and work (confirmed via the earlier migration error), but the frontend never calls them.

---

### 2.4 AI Prompting Module — No Real Editor or API Calls (Frontend)
**What it should do:** Provide a text area for the candidate to write their prompt/response, autosave to `POST /sessions/:id/responses/draft`, and submit to `POST /sessions/:id/responses/submit`.

**Current state:** Falls into the generic `textarea` branch. Placeholder text says "Type your prompt here..." but **no API calls are wired.** Nothing is saved.

**Impact:** AI Prompting responses are never stored. Cannot be graded by the correlation engine later.

---

### 2.5 Proctoring Event Capture (Frontend + Backend endpoint missing)
**What it should do:** 
- Frontend listens to `visibilitychange`/`window.blur` (tab switch), `paste` events, and optionally gaze deviation from MediaPipe.
- On detection, sends `POST /sessions/:id/events` with `{ eventType: "TAB_SWITCH" | "PASTE" | "GAZE_DEVIATION", payload: {...} }`.
- Backend inserts into `EventLog`.

**Current state:** 
- The backend endpoint `POST /sessions/:id/events` **does not exist**. No route, no handler, no service method.
- The frontend has a `proctoring/` components folder but no event listeners are attached in `AssessmentShell`.
- `EventLog` table exists in the schema. Heartbeat/disconnect events are written there, but no proctoring events ever land in it.

**Impact:** Zero integrity signals are captured during the assessment. Admin dashboard `flagsByCategory` will always be empty. The integrity layer of the platform is non-functional.

---

### 2.6 Network-Drop Retry Banner (Frontend)
**What it should do:** When a heartbeat or API call fails due to network loss, show a non-blocking "Reconnecting…" banner. The candidate should not lose in-progress work. Retry with backoff.

**Current state:** `useHeartbeat` catches network errors and `console.warn`s them. There is no visible UI indicator. No retry logic with backoff exists.

**Impact:** Candidates on flaky connections see nothing. If they close and reopen the browser they can resume (via `sessionStorage` + `/resume`), but mid-drop they get no feedback.

---

### 2.7 Pre-Submit Review Screen — Content Missing (Frontend)
**What it should do:** Show a summary of all questions: how many answered, how many skipped/flagged, time remaining. Allow the candidate to jump back to any unanswered question. Final "Submit Assessment" confirmation button.

**Current state:** `PreSubmitPage` route exists and renders. It receives `questions` via router `state`, but the question statuses are the local React state from `AssessmentShell` (lost on refresh). Since `GET /sessions/:id/progress` is a 501, there is no server-backed source of truth for completion status.

**Impact:** The pre-submit screen is a shell. The summary will be inaccurate after a reload.

---

### 2.8 Consent Recording (Frontend + Backend)
**What it should do:** Show a consent screen (biometric consent separate from ToS), record acceptance to `ConsentRecord` table.

**Current state:** `ConsentRecord` model exists in Prisma schema with `candidateId`, `version`, `consentedAt`, `ipAddress`. A `Consent/` page folder exists in the frontend. There is **no backend endpoint** to create a consent record, and the consent page is not wired into the route flow.

**Impact:** Legally, biometric processing consent is not being recorded. The `ConsentRecord` table will always be empty.

---

### 2.9 Correlation Engine — Entirely Empty (Backend)
**What it should do:** FastAPI Python service that:
- Grades coding submissions and AI prompting responses via Claude API
- Computes `compositeScore`, `moduleScores`, `aiConfidence`
- Writes to the `Score` table
- Gates low-confidence scores for human review

**Current state:** `main.py` is **0 bytes**. The `scoring/grading/` and `scoring/consistency/` subdirectories are `.gitkeep` stubs only. `analytics/` and `prompts/` have some content. The NestJS `integrations/correlation-engine/` HTTP client exists and is wired.

**Impact:** No sessions are ever scored. The admin dashboard score section, say-do stats, and AI confidence metrics all show null/empty. `humanReviewed` never triggers. The entire scoring pipeline does not function.

---

### 2.10 Time-Gate Logic — Buffer / Grace Periods Not Implemented
**What it should do:**
- `Invite` has a `scheduledTime` field per candidate.
- If candidate clicks before `scheduledTime - 30min` → redirect to `/too-early` with countdown.
- Between `scheduledTime - 30min` and `scheduledTime` (buffer) → proceed to lobby with full tutorial.
- Between `scheduledTime` and `scheduledTime + 20min` (grace) → condensed tour, start immediately.
- After `scheduledTime + 20min` without a session → redirect to `/link-expired`.

**Current state:** `Invite` has no `scheduledTime` field in the schema. `TooEarlyPage` and `LinkExpiredPage` exist as route destinations but are never reached via time-gate logic. The token JWT expiry (`expiresAt`) is the only time gate that exists (48h by default).

**Impact:** The time-gate experience described in the UX spec does not exist. All candidates enter the lobby immediately regardless of timing.

---

### 2.11 System Check / Hardware Check — Not Fully Wired (Frontend)
**What it should do:** Check WASM support, webcam availability, microphone, CPU, storage estimate, connectivity latency. Set `cvMode = FULL` or `REDUCED` based on result. Request camera permission with a plain-language explainer before the browser dialog fires.

**Current state:** `SystemCheckPage` component folder exists. The session store has `cvMode` field. The backend uses `cvMode` in `Session`. However, the actual hardware check logic, permission priming copy, and FULL/REDUCED decision are not confirmed as wired end-to-end.

**Impact:** `cvMode` is likely always defaulting to `FULL`. Reduced-proctoring fallback is not a real path the candidate goes through.

---

### 2.12 Waiting Room Countdown — No Server-Authoritative Timer (Frontend)
**What it should do:** Show a server-authoritative countdown to `scheduledTime`. Auto-advance when time arrives.

**Current state:** `WaitingRoomPage` route exists. Since `scheduledTime` doesn't exist on `Invite`, there is nothing to count down to.

---

### 2.13 Tutorial Content — Empty (Frontend)
**What it should do:** Walk the candidate through the platform controls — timer location, question palette, how Run vs Submit works, how to navigate modules.

**Current state:** `TutorialPage` route exists. No content is built inside it.

---

### 2.14 Thank You Page — No Reference ID or Next Steps (Frontend)
**What it should do:** Show session reference ID for support, "what happens next" timeline, Learning Hub links, support contact, optional micro-survey, confirmation that camera/mic access released.

**Current state:** `ThankYouPage` route exists. Content is scaffold-level only — no session reference ID display, no next-steps copy, no support link.

---

### 2.15 Sync Validation Page — No Real Sync Logic (Frontend)
**What it should do:** After final submit, validate that all module responses and event logs are fully flushed to the server. Show real progress, "don't close this tab" warning, retry on failure.

**Current state:** `SyncValidationPage` route exists and is navigated to on deadline expiry. No real sync validation logic — likely a static placeholder.

---

## 3. Data Model Gaps

These fields are described in the UX spec or execution plan but are **missing from the Prisma schema**:

| Missing Field | Where | Why It Matters |
|---|---|---|
| `scheduledTime` | `Invite` | Per-candidate appointment time — required for buffer/grace time-gate logic |
| `bufferMinutes` | `Drive` or `Invite` | Configurable buffer period (default 30 min) |
| `graceMinutes` | `Drive` or `Invite` | Configurable grace period (default 20 min) |
| `tutorialMode` | `Session` | Distinguishes full tutorial (buffer) vs condensed (grace) for reviewer context |
| Question version snapshot at session start | `Session` → `DriveQuestion` | If a question is edited mid-drive, active sessions see wrong content |

---

## 4. Suggestions — What a Complete HackerRank-Like Platform Needs

These are **not in the current plan** but are standard for a production coding assessment platform:

### Candidate Experience
| Feature | Why Needed |
|---|---|
| **Per-module sub-timer with visible lock** | HackerRank locks each section after its time. Prevents time-shifting strategies. Your spec defers this decision — it needs to be made and implemented. |
| **Question flagging persisted server-side** | "Flag for review" is in the UI but only in local React state. A page refresh loses flags. Needs a `flaggedForReview` boolean on `ModuleResponse`. |
| **Copy-paste restriction in editor** | Standard on coding platforms. You track paste events for integrity — whether to block or just log is a decision needed. |
| **Mobile responsive layout** | Coding assessments on tablet/mobile are uncommon but can happen. The current split-pane layout likely breaks on small screens. |
| **Accessibility / keyboard navigation** | No screen-reader support, no `aria-label`s on interactive elements, no keyboard-only navigation confirmed. Legal exposure for hiring platforms. |

### Platform Features
| Feature | Why Needed |
|---|---|
| **Candidate-facing result page** | After submission, candidates on HackerRank see their score. Your platform has no plan for this. Do candidates ever see results? |
| **Email delivery (Resend/Postmark)** | Mentioned in spec as deferred but still needed. No transactional email means invite links must be manually shared forever. |
| **Question version snapshots** | If admin edits a question while candidates are mid-session, their question changes under them. Needs snapshot binding at `beginSession` time. |
| **Test case management UI (Admin)** | Admin cannot add or edit coding test cases through the UI — only via seed scripts. The question bank needs a full test case editor. |
| **Per-drive analytics** | Admin has a global dashboard but no per-question difficulty stats, skip rate, average time-on-question. Needed for question quality tuning. |
| **Plagiarism / similarity detection** | Coding submissions are not checked for copy-paste from each other or public solutions. HackerRank has this. |
| **Question CSV / bulk import** | Backend code mentions CSV bulk parsing for questions but it is not confirmed implemented. Admin needs to bulk-upload question banks. |
| **Extended time accommodations** | No `extendedTimeMultiplier` field on `Invite` or `Session`. Required for accessibility compliance in hiring contexts. |
| **ATS / webhook integration** | No way to push scores and decisions to Greenhouse, Lever, Workday, etc. Table-stakes for enterprise clients. |
| **Leaderboard / percentile ranking** | Optional for candidate view, but common on HackerRank. Gives context to the score. |
| **Custom output checkers** | For questions requiring floating-point tolerance or special comparison logic (e.g., "any valid topological sort"). Judge0 integration currently only does `stdout.trim() === expected.trim()`. |
| **Multi-language i18n** | No localization infrastructure. Fine for MVP but needed before global roll-out. |
| **Mid-test support escalation** | No in-platform support chat. Candidates with technical issues have no path except abandoning the session. |

---

## Quick Reference — Remaining Work Priority Order

| Priority | Functionality | Effort |
|---|---|---|
| 🔴 Critical | MCQ submit wired to backend | Small |
| 🔴 Critical | SQL editor + run/submit API calls | Medium |
| 🔴 Critical | AI Prompting textarea + save/submit API calls | Small |
| 🔴 Critical | `GET /sessions/:id/progress` — implement (remove 501 stub) | Small |
| 🔴 Critical | Proctoring event endpoint `POST /sessions/:id/events` + frontend listeners | Medium |
| 🟠 High | Network-drop retry banner in `useHeartbeat` | Small |
| 🟠 High | Pre-submit review screen pulls from server progress | Small (unblocked once progress endpoint done) |
| 🟠 High | Consent recording endpoint + frontend flow | Medium |
| 🟠 High | Correlation engine `main.py` — FastAPI app, grading via Claude | Large |
| 🟡 Medium | Time-gate logic (`scheduledTime` field + buffer/grace routing) | Large |
| 🟡 Medium | System check hardware detection wired to `cvMode` decision | Medium |
| 🟡 Medium | Tutorial content | Medium |
| 🟡 Medium | Thank You page content (reference ID, next steps, support) | Small |
| 🟡 Medium | Sync Validation page real logic | Small |
| 🔵 Low | Email delivery integration | Medium |
| 🔵 Low | Question version snapshots | Medium |
| 🔵 Low | Test case management UI in admin | Large |
