# CD-Recruit — Complete Build Guide (Phase by Phase) — v2

**Scope:** MCQ + SQL + Coding/DSA + AI Prompting + Contextual Simulation modules (all five — v1 incorrectly scoped only two, corrected here) · Software Developer role · India (DPDP Act) · DIY KYC liveness
**Structure:** As per the corrected folder structure (frontend/, backend/, docker/, docs/) with a root-level `packages/shared-types` fix applied — see note in Phase 2.
**How to use this guide:** Each phase lists what you're building, exactly which folders it lives in, the tasks in order, and — most importantly — a concrete **Outcome** that tells you when the phase is actually done. Don't move to the next phase until the Outcome is real, not "mostly working."

**v2 changelog:** corrected module scope to all 5 (new Phase 5.5); added autosave (Phase 6); added disconnect heartbeat + grace window (Phase 4); added server-side deadline enforcement (Phase 5); added network-drop retry UX (Phase 6); added within-module question navigation (Phase 6); added invite-token rate limiting (Phase 4); added single-active-session enforcement (Phase 4). See end of document for a consolidated diff summary.

---

## Phase 0 — Repository & Environment Setup

**Goal:** Get the skeleton in place so both devs are working inside the same structure from commit one.

**Folders touched:** entire root skeleton, `.github/`, `.husky/`, `docker/`, `docs/`

**Tasks:**
1. Create the GitHub repo (private), clone locally
2. Scaffold the full folder tree from the finalized structure (empty folders are fine — use `.gitkeep` where needed)
3. Root `package.json` with npm/pnpm workspaces pointing at `frontend/candidate-web`, `frontend/admin-web`, `backend/api`, `packages/shared-types`
4. `.env.example` listing every env var you already know you'll need (`DATABASE_URL`, `REDIS_URL`, `KEYCLOAK_*`, `JUDGE0_API_URL`, `ANTHROPIC_API_KEY`, `MINIO_*`)
5. `.gitignore` (node_modules, .env, dist, build artifacts, `__pycache__`)
6. Install Husky, add a pre-commit hook: lint-staged on changed files
7. Drop in `docs/DECISIONS.md` (KYC, modules, role, region — already written) and this guide itself as `docs/BUILD_GUIDE.md`
8. Push initial scaffold directly to `main` (one-time exception — after this, everything is a PR)

**Outcome:** Both devs can `git clone`, run `npm install` at root, and see the exact folder structure agreed on. No app code exists yet — this phase is purely the container everything else goes into.

---

## Phase 1 — Data Layer (Prisma Schema & Migrations)

**Goal:** One authoritative data model that every other phase builds against.

**Folders touched:** `backend/prisma/`

**Tasks:**
1. Place the finalized `schema.prisma` into `backend/prisma/schema.prisma`. **v2: includes new session-integrity fields** — `Session.deadlineAt`, `Session.lastHeartbeatAt`, `Session.disconnectedAt`, `Session.activeTabId`, `Session.status` extended with `DISCONNECTED` and `AUTO_SUBMITTED` values, `ModuleResponse.isDraft`, `ModuleResponse.lastAutosavedAt`, `RoleTemplate.durationMinutes`
2. Set up `DATABASE_URL` pointing at local Postgres (via Docker — see Phase 3, can run Postgres standalone for now if Docker isn't ready yet)
3. Run `npx prisma migrate dev --name init` to generate the first migration
4. Write `backend/prisma/seed.ts` — seeds one `RoleTemplate` ("Software Developer", with `durationMinutes` set) and real `Question` rows across **all five** `module_type` values: `MCQ`, `SQL`, `CODING`, `AI_PROMPTING`, `SIMULATION`. **v2: seed at least 15-20 questions per module type**, not 5-10 — this gives enough headroom for random selection per candidate (Phase 5.5) so repeat candidates in the same pilot don't all get identical questions
5. Run the seed, confirm data lands correctly with `npx prisma studio`
6. Commit schema + migration + seed script together in one PR — this is the artifact both devs review together, since it's the highest-leverage file in the repo

**Outcome:** A running Postgres database with real tables matching the ER diagram, seeded with actual Software Developer questions across all five module types. `npx prisma studio` shows real rows, not empty tables.

---

## Phase 2 — Shared Types & API Contract

**Goal:** Lock the interface between frontend and backend before either side writes real feature code.

**Folders touched:** `packages/shared-types/` (new — root-level, fixes the disconnect between `frontend/shared` and `backend/shared`), `docs/API_CONTRACT.md`, `docs/DTO.md`

**Tasks:**
1. Create `packages/shared-types/` at the root. This is the single source of truth — `frontend/shared/types` and `backend/shared/types` should **re-export from this package**, not hand-duplicate definitions
2. Generate or hand-write TypeScript types matching each Prisma model (`Session`, `Question`, `ModuleResponse`, `Score`, etc.), including the v2 fields
3. Finalize `docs/API_CONTRACT.md` — session lifecycle: start/resume, get-question (by index, not just "next"), **save-draft (new)**, **heartbeat (new)**, submit, events, close, admin list/detail/decision
4. Write `docs/DTO.md` — the NestJS-side request/response DTO classes matching the contract, so `backend/api/src/common/dto/` has a spec to implement against
5. Both devs review and sign off on the contract together — this is the one artifact where disagreement now is far cheaper than disagreement in week 3

**Outcome:** `packages/shared-types` exists and builds independently. `API_CONTRACT.md` and `DTO.md` are complete enough that Dev A could build the frontend against mocked responses and Dev B could build the backend independently, and they'd meet in the middle without surprises.

---

## Phase 3 — Local Infrastructure (Docker Compose)

**Goal:** One command brings up every service dependency, for both current and future devs.

**Folders touched:** `docker/`

**Tasks:**
1. `docker/docker-compose.dev.yml`: Postgres, Redis, Keycloak (with a pre-configured realm export if possible), MinIO
2. `docker/api.Dockerfile` — NestJS dev image (hot reload)
3. `docker/correlation-engine.Dockerfile` — FastAPI dev image
4. Leave `docker/judge0.Dockerfile` as a stub/placeholder — **do not build this yet**, Phase 5 uses hosted Judge0 API; self-hosting is a later upgrade trigger, not a day-one requirement
5. Confirm `backend/api` and `backend/correlation-engine` can both connect to the same Postgres instance from inside Docker's network
6. Document the startup command in root `README.md`: `docker compose -f docker/docker-compose.dev.yml up`

**Outcome:** Running one command brings up Postgres + Redis + Keycloak + MinIO, all reachable from your local machine and from each other. `docker ps` shows all four healthy.

---

## Phase 4 — Backend Core: Auth & Session Module (expanded in v2)

**Goal:** A candidate can be authenticated (or invite-token verified), a session can be created and tracked, and the session is resilient to disconnects while resistant to deliberate misuse.

**Folders touched:** `backend/api/src/auth/`, `backend/api/src/session/`, `backend/api/src/candidate/`, `backend/api/src/common/guards/`, `backend/api/src/queue/` (grace-window job)

**Tasks:**
1. `auth/`: Keycloak integration for admin/recruiter login (JWT verification guard); separate lightweight invite-token verification for candidates (not a full Keycloak login — matches your architecture doc's candidate-friction concern)
2. `common/guards/`: `AuthGuard`, `RolesGuard` (recruiter vs admin RBAC), **`InviteTokenRateLimitGuard` (new)** — caps `POST /sessions` attempts per token/IP (e.g. 10/hour), reusing the same rate-limit pattern planned for Phase 7's event log
3. `candidate/`: minimal CRUD — candidate created on first invite-token redemption if not already existing
4. `session/`: implement `POST /sessions` (start) and `GET /sessions/:id` — matches `API_CONTRACT.md` Section 1. **v2: `POST /sessions` logic changes** — check for an existing session for this candidate+role first:
   - No existing session → create new, compute and store `deadlineAt = now + roleTemplate.durationMinutes`
   - Existing session with status `IN_PROGRESS` or `DISCONNECTED` and a *different* `activeTabId` requesting it → **do not fork a new session.** Attach the requester to the existing session, update `activeTabId`, and emit a `SECOND_TAB_DETECTED` event so the *original* tab can show a "this test is now open elsewhere" warning via a lightweight poll or `BroadcastChannel` check. This is the single-active-session enforcement — see Phase 6 task 6 for the frontend half.
5. Session status transitions enforced server-side, not trusted from client: `NOT_STARTED → IN_PROGRESS → DISCONNECTED → IN_PROGRESS (reconnect)` or `DISCONNECTED → AUTO_SUBMITTED` (grace window lapsed) or `IN_PROGRESS → SUBMITTED`
6. **Heartbeat endpoint (new):** `POST /sessions/:id/heartbeat` — fire-and-forget, called by the frontend every 15s (Phase 6). Updates `lastHeartbeatAt`. If a session's `lastHeartbeatAt` is more than 30s stale, a scheduled check (task 7) flips it to `DISCONNECTED`.
7. **Grace-window job (new):** a BullMQ delayed job, enqueued the moment a session flips to `DISCONNECTED`, fires after 5 minutes (confirm this duration in `DECISIONS.md` — see architecture doc Section 10). On fire: if the session is still `DISCONNECTED` (candidate never reconnected), flip it to `AUTO_SUBMITTED`, persist whatever the latest autosaved drafts were as final `ModuleResponse` rows, and raise an `EVENT_LOG` entry (`GRACE_WINDOW_EXPIRED`) plus flag the session for reviewer awareness in the admin view (Phase 8). **The assessment clock (`deadlineAt`) is never paused or extended during a disconnect** — this is what prevents the grace window from being a deliberate-pause exploit.
8. Deliberately **not building**: any candidate-facing "pause" or "break" button. A live, timed, integrity-monitored test has no legitimate self-serve pause; the grace window above exists only to protect against *involuntary* disconnects, triggered automatically by the heartbeat, never by candidate action.

**Outcome:** Hitting `POST /sessions` with a valid invite token creates a real `Session` row with a server-computed `deadlineAt`. A second redemption of the same token attaches to the existing session rather than forking one. Killing the frontend's heartbeat (e.g. closing devtools network throttling to offline) flips the session to `DISCONNECTED` within ~30s, and failing to reconnect within 5 minutes auto-submits it with a flag visible in the admin view. Hitting the session endpoint more than the rate limit allows returns a 429.

---

## Phase 5 — Backend: Coding Module + Execution (expanded in v2)

**Goal:** A candidate's submitted code actually runs and returns real results, and the server — not the client — is the authority on whether time has run out.

**Folders touched:** `backend/api/src/question/`, `backend/api/src/response/`, `backend/api/src/coding/`, `backend/api/src/integrations/judge0/`

**Tasks:**
1. `question/`: `GET /sessions/:id/questions` — **v2: returns the full ordered set of questions for the current module** (not "next question only"), so the frontend can support back/forward navigation within the module (Phase 6). Server still tracks which module the session is currently in and blocks requests for a different module's questions once the candidate has moved on.
2. `integrations/judge0/`: thin client wrapping the hosted Judge0 API — submit code, poll for result, map to your `executionResult` contract shape
3. `coding/`: orchestrates the submit flow — validate payload, call Judge0, persist `ModuleResponse`, return result
4. `response/`: `POST /sessions/:id/submit` per the contract, dispatches to `coding/` when `moduleType === CODING`. **v2: server-side deadline check added first** — compare `now()` against `session.deadlineAt` before processing the submit; if past deadline, reject with a clear error code the frontend can surface, and mark the session for auto-close. This makes the client-side countdown purely cosmetic — it can't be manipulated to extend real time.
5. Error handling: Judge0 timeouts, malformed code, unsupported language — all need real responses, not unhandled exceptions

**Outcome:** A real HTTP request with real code (e.g., a Python solution to a seeded question) returns actual pass/fail output from Judge0, and a `ModuleResponse` row is persisted with the correct `session_id` and `question_id`. A submit sent after `deadlineAt` is rejected server-side regardless of what the candidate's browser clock or JS timer showed. Testable entirely via Postman/curl — no frontend needed yet.

---

## Phase 5.5 — Backend + Frontend: MCQ, SQL & AI Prompting Modules (new in v2)

**Goal:** Ship the three remaining modules the architecture doc always specified, using the same generic response/submit pattern already proven in Phase 5 rather than building three bespoke systems.

**Folders touched:** `backend/api/src/mcq/`, `backend/api/src/sql/`, `backend/api/src/ai-prompting/`, `frontend/candidate-web/src/components/{mcq,sql,ai-prompting}/`, `frontend/candidate-web/src/pages/{MCQ,SQL,AIPrompting}/`

**Tasks:**
1. `mcq/`: simplest module — `Question.content = { options: string[], correctIndex: number }`. Submit compares selected index to `correctIndex`, auto-graded, no external service involved. Frontend renders radio/checkbox options instead of Monaco.
2. `sql/`: candidate writes a query against a seeded schema loaded client-side via `sql.js`. Submit sends the query (and/or its result set) to the backend, which re-runs it against the same in-browser-equivalent dataset server-side (or compares result-set diff) to prevent trusting client-computed results. Reuses the same `POST /sessions/:id/submit` dispatch pattern from Phase 5, keyed on `moduleType === SQL`.
3. `ai-prompting/`: candidate writes a prompt in response to a scenario; submit sends the prompt + a rubric to the Claude API for grading (this reuses the Claude-grading pattern that Phase 10's Correlation Engine already needs for Coding quality — same client, different prompt template). Store the raw prompt and the grading rationale in `ModuleResponse.response_payload`.
4. Extend `response/` dispatch (Phase 5) to route on all five `moduleType` values now, not just `CODING` and `SIMULATION`.
5. Extend the shared question-navigation frontend component (Phase 6, task 5) to work generically across MCQ/SQL/AI-Prompting/Coding — same prev/next pattern, different rendered input per module.

**Outcome:** A candidate can complete MCQ, SQL, and AI Prompting modules end-to-end, each producing a real persisted `ModuleResponse`, with MCQ auto-graded immediately and SQL/AI Prompting graded via the same pipelines used elsewhere in the platform. All five modules from the architecture doc are now actually implemented, closing the v1 scoping gap.

---

## Phase 6 — Frontend: Candidate Coding Flow (expanded in v2)

**Goal:** A real browser-based candidate journey through the coding module, wired to Phase 4/5's real endpoints, resilient to network drops and browser crashes.

**Folders touched:** `frontend/candidate-web/src/` (api/, components/coding/, pages/Coding/, pages/Lobby/, store/, routes/)

**Tasks:**
1. `api/`: typed client built against `packages/shared-types` and `API_CONTRACT.md` — no hand-written duplicate types
2. `pages/Lobby/`: invite-token entry → calls `POST /sessions` (now resume-aware per Phase 4)
3. `components/coding/`: Monaco editor wrapper, test case display, submit button
4. `pages/Coding/`: wires `GET questions` (full set) → editor → `POST submit` → shows `executionResult`
5. **Question navigation (new):** `store/` (Zustand) holds all questions + in-progress answers for the current module as an indexed array, not a single "current question" pointer. Add prev/next controls so a candidate can move freely between questions within a module (e.g. Coding question 2 of 5 → back to question 1 → forward to question 3) before finally moving to the next module. Navigating *away* from the current module (e.g. Coding → AI Prompting) is one-directional — once left, a module can't be reopened, to avoid retrospective advantage from later questions.
6. **Autosave (new):** debounced draft save — e.g. every 10s of inactivity or every ~500 characters changed — calling a new `PATCH /sessions/:id/responses/:questionId/draft` endpoint (fire-and-forget, same pattern as the existing events endpoint). Sets `ModuleResponse.isDraft = true` and `lastAutosavedAt`; overwritten by the real submit. On loading a question, `GET questions` also returns any existing draft so the editor pre-fills instead of starting blank.
7. **Heartbeat client (new):** a background interval posts `POST /sessions/:id/heartbeat` every 15s while the candidate is on any assessment page. Runs independently of user activity (not tied to keystrokes) so it accurately reflects "is the tab still open and connected," not "is the candidate typing."
8. **Network-drop retry UX (new):** wrap `submit` (and draft-save) calls in retry-with-backoff (e.g. 3 attempts). While retrying, show an explicit non-blocking banner — "Reconnecting… your answer is saved locally, don't close this tab" — rather than a silent spinner or a hang. Keep the last unsent payload in memory/localStorage until a 2xx response confirms it landed.
9. **Second-tab detection (new):** listen for the `SECOND_TAB_DETECTED` event (Phase 4 task 4) via a lightweight poll or `BroadcastChannel`; if this tab is the "original" and a second redemption attaches elsewhere, show a clear "this assessment is now open in another tab or device" notice.
10. `routes/`: guards so a candidate can't jump straight to `/coding` without a valid session in state

**Outcome:** Open the app in a browser, enter a real invite token, get real seeded questions, navigate back and forth between them, write code, submit, and see real pass/fail output — end to end, no mocked data anywhere in the path. Simulating a network drop (e.g. DevTools offline mode) for under 5 minutes and reconnecting resumes exactly where the candidate left off with their draft intact; simulating a drop beyond 5 minutes results in an auto-submit visible in the admin view. This is your first genuinely demoable vertical slice.

---

## Phase 7 — Behavioral Events & Integrity Flagging (Baseline)

**Goal:** Capture the raw signals needed for integrity detection — detection logic comes in Phase 9, this phase is plumbing.

**Folders touched:** `backend/api/src/proctoring/`, `frontend/candidate-web/src/components/proctoring/`

**Tasks:**
1. Frontend: capture paste events, tab-switch/blur events, and MediaPipe-based gaze/phone detection *results* (not raw video frames — per the architecture doc's edge-processing note)
2. `POST /sessions/:id/events` (fire-and-forget, per contract) wired on the frontend. **v2: event types extended** to include `HEARTBEAT_MISSED`, `DISCONNECTED`, `RECONNECTED`, `GRACE_WINDOW_EXPIRED`, `AUTO_SUBMITTED`, `SECOND_TAB_DETECTED` (emitted by Phase 4/6's new session-integrity logic) alongside the original proctoring events
3. Backend `proctoring/`: persist to `EventLog`, no scoring logic yet — just reliable ingestion
4. Add basic rate-limiting/sanity checks so a buggy client can't flood the event log — **this is the same guard pattern reused for the invite-token rate limit in Phase 4**, apply it consistently across both endpoints

**Outcome:** Every paste, tab-switch, gaze-deviation, and session-integrity event (disconnects, reconnects, auto-submits, second-tab detections) from a real candidate session shows up as a row in `EventLog`, timestamped and queryable — proof the signal pipeline works before you build detection logic on top of it.

---

## Phase 8 — Backend: Admin Module + Dashboard Read Path

**Goal:** A recruiter can see real session data, not mock data.

**Folders touched:** `backend/api/src/admin/`, `frontend/admin-web/src/` (pages/Dashboard/, pages/Candidates/, pages/SessionDetails/, components/dashboard/)

**Tasks:**
1. Backend `admin/`: `GET /admin/sessions` (list, filterable) and `GET /admin/sessions/:id` (detail) per contract. **v2: session list/detail surfaces the new status values** (`DISCONNECTED`, `AUTO_SUBMITTED`) distinctly so a reviewer can immediately see "this candidate's session was auto-submitted after a disconnect" rather than it looking like a normal completion
2. Frontend `pages/Dashboard/` + `pages/Candidates/`: session list view, pulling real data
3. Frontend `pages/SessionDetails/`: shows submitted code + execution result + (once Phase 7 lands) integrity events, including session-integrity events from v2
4. RBAC check: only authenticated recruiter/admin roles can hit these endpoints (reuses Phase 4's guards)

**Outcome:** Logging into the admin dashboard as a recruiter shows the real session you just completed in Phase 6, with the actual code and output visible, and any disconnect/auto-submit history clearly flagged — no placeholder rows anywhere.

---

## Phase 9 — Contextual Simulation Module

**Goal:** The final core module — this is what actually produces the Say-Do differentiator, not just another quiz type.

**Folders touched:** `backend/api/src/simulation/`, `frontend/candidate-web/src/` (components/simulation/, pages/Simulation/)

**Tasks:**
1. Design the scenario script format first (Email/Slack/Ticket-style triggers) — document the `content` JSON shape in `API_CONTRACT.md` Section 2
2. Backend `simulation/`: serves scenario questions, accepts `actionLog` submissions per the contract
3. Frontend `components/simulation/`: renders mock Email/Slack/Ticket UI, captures candidate actions into an `actionLog`
4. **Real-time transport decided as periodic client-driven submits, not WebSocket** — the simulation checks in every few seconds via the same submit pattern used everywhere else in the platform, rather than a persistent connection. This was an open question in v1; resolved in favor of the simpler, more failure-resistant option for MVP (see architecture doc Section 12 for the reasoning). Revisit only if pilot feedback shows the simulation feels laggy.
5. Wire baseline selfie capture + periodic DIY liveness re-check (blink/head-turn via MediaPipe) into this module's flow, since it's the identity-sensitive part of the session
6. This module also benefits from Phase 6's heartbeat/autosave/network-drop-retry work — no separate implementation needed, it's shared infrastructure

**Outcome:** A candidate can complete a full contextual simulation scenario end-to-end, with their actions logged in a structured, gradeable format via periodic submits, and the flow includes the identity re-check without disrupting the experience.

---

## Phase 10 — Correlation Engine: Grading & Say-Do Scoring

**Goal:** Turn raw responses into an actual score — this is the platform's core value proposition, live for the first time.

**Folders touched:** `backend/correlation-engine/app/` (scoring/consistency, scoring/grading, scoring/analytics), `backend/api/src/queue/`, `backend/api/src/integrations/correlation-engine/`

**Tasks:**
1. `backend/api/src/queue/`: BullMQ job enqueued on `POST /sessions/:id/close` (also handles the `AUTO_SUBMITTED` path from Phase 4 — an auto-submitted session should still get graded, just with the disconnect context visible to the reviewer)
2. `correlation-engine/scoring/grading/`: Claude API call for coding correctness/quality grading, and AI Prompting module grading (shared client from Phase 5.5)
3. `correlation-engine/scoring/consistency/`: the actual Say-Do Consistency Score logic — compares stated approach/behavior in the coding module against demonstrated behavior in the simulation module
4. `correlation-engine/scoring/analytics/`: aggregate into `composite_score`, `module_scores` (now across all five modules), `ai_confidence`
5. `backend/api/src/integrations/correlation-engine/`: NestJS client calling the FastAPI service, persisting results into the `Score` table
6. Confidence gating: below-threshold scores get `human_reviewed = false` and surface in admin as needing review

**Outcome:** Closing a completed session (all five modules) automatically produces a real `Score` row with a genuine Say-Do Consistency Score — not a placeholder number — visible on the admin session detail page from Phase 8.

---

## Phase 11 — Reviewer Decision Workflow

**Goal:** Close the loop — a human can act on the AI's output.

**Folders touched:** `backend/api/src/admin/` (extend), `frontend/admin-web/src/pages/SessionDetails/`, `frontend/admin-web/src/components/reports/`

**Tasks:**
1. Backend: `POST /admin/sessions/:id/decision` per contract — `reviewerId` taken from JWT, never client-supplied
2. Frontend: Advance/Reject UI on the session detail page, disabled until score data has loaded
3. Persist to `ReviewerDecision`, reflect the decision back in the session list view

**Outcome:** A recruiter can open a graded session, see the Say-Do score and any integrity flags, and record a real Advance/Reject decision that persists and shows up on subsequent visits.

---

## Phase 12 — Security & Compliance Hardening

**Goal:** Move from "works on our machines" to "safe to run with real candidate data," per India's DPDP Act.

**Folders touched:** `backend/api/src/integrations/minio/`, `backend/api/src/integrations/keycloak/` (harden), `docs/SECURITY.md`

**Tasks:**
1. `integrations/minio/`: separate bucket + IAM boundary for evidence clips (biometric-tier data) vs. general storage
2. Envelope encryption via KMS/Vault for anything in the biometric-tier bucket
3. Pseudonymization check: confirm no persistent biometric identity template is stored anywhere, only session-scoped UUIDs
4. Evidence clip lifecycle deletion job (scheduled cleanup respecting `expires_at`)
5. Signed, short-TTL URLs for evidence clip access from the admin dashboard (never permanent links)
6. Write `docs/SECURITY.md` documenting what's actually implemented vs. what's an upgrade trigger for later, **including the v2 session-integrity controls (heartbeat, grace window, deadline enforcement, rate limiting, single-active-session)**
7. Explicit candidate consent screen/flow for biometric data collection, worded for DPDP Act compliance

**Outcome:** Evidence data is encrypted, access-controlled, auto-expiring, and consented-to — this phase gates going anywhere near a real pilot candidate's data. Don't skip or shortcut this phase for a demo.

---

## Phase 13 — CI/CD & Testing

**Goal:** Make the repo self-checking, so 5 more developers can contribute without breaking things silently.

**Folders touched:** `.github/workflows/`, `test/` and `tests/` folders across apps

**Tasks:**
1. `.github/workflows/backend.yml`: lint + unit test + build for `backend/api` and `backend/correlation-engine`
2. `.github/workflows/frontend.yml`: lint + build for both frontend apps
3. `.github/workflows/deploy.yml`: stub for now — real deployment target comes later, don't over-build this yet
4. Baseline test coverage: session creation, code submission → execution, scoring pipeline, **plus v2 session-integrity paths** (heartbeat timeout → DISCONNECTED, grace window expiry → AUTO_SUBMITTED, server-side deadline rejection, single-active-session attach behavior, rate-limit 429) — these are exactly the paths most likely to have a subtle bug that only shows up under real network conditions
5. Branch protection on `main`: require these checks to pass before merge

**Outcome:** Every PR runs real checks automatically, and a broken build or failing test blocks merge — this is what makes onboarding 5 more devs safe rather than risky.

---

## Phase 14 — Pilot Readiness

**Goal:** Confirm the whole system works as one coherent product, not just as passing phases.

**Tasks:**
1. Run one complete real session start-to-finish across all five modules: invite → pre-flight → MCQ → SQL → Coding → AI Prompting → Simulation → close → grading → admin review → decision
2. **Deliberately test the disconnect path**: mid-session, kill network connectivity for under 5 minutes and confirm resume works with drafts intact; separately, kill it for over 5 minutes and confirm auto-submit + reviewer flag works correctly
3. **Deliberately test the deadline path**: manipulate the client system clock or freeze the JS timer and confirm the server still rejects a late submit
4. Verify DPDP consent flow triggers correctly and evidence data lifecycle behaves as designed
5. Load the real (even if small) Software Developer question bank across all five modules — no seeded placeholder content left in the path
6. Walk through `docs/DECISIONS.md` and `docs/SECURITY.md` — confirm nothing marked "temporary" from earlier phases is still temporary without a tracked follow-up
7. Dry-run the pilot with a real (or realistic) candidate to catch UX gaps the phased build wouldn't surface

**Outcome:** You have a working MVP that matches Section 1 of your architecture doc's core promise — the Say-Do Consistency Score is real, demonstrated end-to-end across all five modules, on real data, with real security and session-integrity controls. This is the point where bringing in 5 more developers is safe, because the contract between every layer has been proven under real use, not just designed on paper.

---

## How to use this across two devs

Phases 0-3 should be done together — they're the shared foundation everything else depends on. From Phase 4 onward, alternate primary ownership between backend-heavy phases (4, 5, 5.5's backend half, 7, 10, 12) and frontend-heavy phases (6, 5.5's frontend half, 8's frontend half, 9's frontend half) so both devs stay familiar with the whole system rather than splitting into permanent silos — that's what makes both of you able to onboard new developers into *any* part of the codebase later, not just your own corner of it.

---

## v2 Diff Summary

| # | Change | Phase(s) touched | Why |
|---|---|---|---|
| 1 | All 5 modules (MCQ, SQL, Coding, AI Prompting, Simulation) | New Phase 5.5, Phase 1 seed data | v1 only built 2 of 5 — scoping error |
| 2 | Autosave of draft answers | Phase 6 | Prevent lost work on crash/refresh |
| 3 | Heartbeat + 5-min disconnect grace window, auto-submit on expiry | Phase 4, 7, 8, 10, 14 | Protect against involuntary disconnects without opening a self-serve pause exploit |
| 4 | Server-side deadline enforcement | Phase 5, 14 | Client-side timer alone is manipulable |
| 5 | Network-drop retry UX | Phase 6 | No silent failure/hang on submit during a bad connection |
| 6 | Within-module prev/next question navigation | Phase 5, 6 | Candidates can revisit/revise before moving on; cross-module nav stays forward-only |
| 7 | Invite-token rate limiting | Phase 4, 7 | Invite token is the entire candidate auth boundary — needs the same protection as other endpoints |
| 8 | Single-active-session enforcement (multi-tab/device) | Phase 4, 6 | Prevent accidental session forking and deliberate two-tab comparison |
