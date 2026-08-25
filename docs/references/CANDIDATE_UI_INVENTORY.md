# Candidate UI Inventory

**Audit date:** 2026-07-23  
**Auditor:** Read-only discovery pass — no code modified.  
**Canonical spec:** `CD-Recruit_Candidate_Assessment_UX_Flow_and_Design_System.md`  
**Scope:** `frontend/candidate-web/` — every screen and state in the candidate journey.

---

## 0. Quick Reference Map

| Journey Phase | File(s) | Screen State Key |
|---|---|---|
| Link-click resolution | `routes/InviteResolver.tsx`, `routes/SessionRouter.tsx`, `App.tsx` | `resolving` |
| Too Early | `routes/TooEarlyScreen.tsx` | `too-early` |
| System Check | `routes/SystemCheckScreen.tsx` | `system-check` |
| Consent – Terms | `routes/ConsentScreen.tsx` (step=`terms`) | `consent` |
| Consent – Biometric | `routes/ConsentScreen.tsx` (step=`biometric`) | `consent` |
| Consent – Liveness | `routes/ConsentScreen.tsx` (step=`liveness`) | `consent` |
| Consent – Selfie | `routes/ConsentScreen.tsx` (step=`selfie`) | `consent` |
| Consent – Audio | `routes/ConsentScreen.tsx` (step=`audio`) | `consent` |
| Tutorial | `routes/TutorialScreen.tsx` | `tutorial` |
| Waiting Room | `routes/WaitingRoomScreen.tsx` | `waiting-room` |
| Assessment (MCQ) | `modules/mcq/MCQModule.tsx` + `components/ModuleShell.tsx` | `assessment` |
| Assessment (SQL) | `modules/sql/SQLModule.tsx` + `components/ModuleShell.tsx` | `assessment` |
| Assessment (Coding) | `modules/coding/CodingModule.tsx` + `CodingWorkspace.tsx` | `assessment` |
| Assessment (AI Prompting) | `modules/prompting/PromptingModule.tsx` | `assessment` |
| Assessment (Contextual Sim) | `modules/contextual/ContextualModule.tsx` + `InFictionInbox.tsx` | `assessment` |
| Pre-Submit Review | `routes/PreSubmitReview.tsx` | `pre-submit-review` |
| Syncing / Final Submit | `routes/SyncingScreen.tsx` | `syncing` |
| Done / Thank You | `routes/DoneScreen.tsx` | `done` |
| Session Conflict | `routes/SessionConflictScreen.tsx` | `session-conflict` |
| Expired | `routes/ExpiredScreen.tsx` | `expired` |
| Missing Token (fallback) | `App.tsx` inline | _(no screen state)_ |

---

## 1. Application Entry — Routing & Shell

### App.tsx
- **Router:** react-router-dom v6 BrowserRouter with v7_startTransition and v7_relativeSplatPath flags.
- **Routes:** /invite/:token, /invite, /start/:token, /start, /, * all hit TokenRouteHandler.
- **Token resolution:** checks useParams then ?token= query param. Falls back to empty string.
- **Missing-token inline UI:** dark card (bg-[#0B0B0D], bg-[#16161A], red ! icon) entirely outside the design token system — hardcoded hex colors.
- **LoginRedirect:** hardcoded to demo-token-2024 — dead code, never reached.

> **Redesign Risk R-01 (HIGH):** Missing-token error uses hardcoded dark hex colors that do not respond to theme toggle. Will look visually inconsistent after redesign unless ported to CSS tokens.

### routes/SessionRouter.tsx
- Inline ResolvingScreen: w-8 h-8 animate-spin div + "Loading your assessment..." text. No brand mark or logo.
- Maps screen.type to component tree. URL never changes during the candidate journey.
- Reads FIXTURE_INVITE.scheduledTime from fixtures (not API) to seed localStorage for the tutorial countdown.

> **Redesign Risk R-15 (MEDIUM):** FIXTURE_INVITE.scheduledTime seeds localStorage for tutorial soft-interrupt rather than the live API scheduled time.

---

## 2. Screen-by-Screen Inventory

### 2.1 Too Early Screen
**File:** routes/TooEarlyScreen.tsx | **State:** too-early

- Centered column, max-w-lg, min-h-screen flex items-center justify-center
- Emoji icon: clock at text-6xl opacity-60
- h1: "Your assessment hasn't opened yet"
- Scheduled time card: bg-[var(--surface)] rounded-xl border card with formattedTime + formattedDate
- Timezone mismatch alert: bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 (hardcoded Tailwind, not CSS var tokens)
- Live countdown: text-3xl font-mono font-bold text-[var(--accent)] showing HhMm or Mm Ss
- Auto-poll: useEffect setTimeout every 5s when within 2 minutes of buffer start, auto-transitions to system-check
- Support link: mailto:support@cd-recruit.example.com (placeholder email)

> **Redesign Risk R-05 (MEDIUM):** Timezone note uses hardcoded bg-blue-50 Tailwind classes, not CSS var tokens. Will not auto-adapt if palette changes.

---

### 2.2 System Check Screen
**File:** routes/SystemCheckScreen.tsx | **State:** system-check (mode: full | expedited)

- 4 check items: WASM, Camera (with pre-flight explainer), Connectivity (simulated delay), Fullscreen (real requestFullscreen)
- Check list: color-coded rows per status using template literal class combos
- Status icons: pure Unicode chars (checkmark, X, warning, rotating, circle) — no icon library
- Camera explainer renders inline before native permission prompt fires
- Retry button for camera denial
- Progress bar: h-1.5 bg-[var(--border)] + inner bg-[var(--accent)] transition-all duration-500
- Continue button disabled until allDone; disabled:opacity-40
- Grace mode amber banner: "You're in the grace window — we'll move quickly."
- Storage-full detection via localStorage test

> **Note:** Connectivity check is a simulated fake delay of 600-1000ms — no actual network ping. Status icons are plain Unicode text, not from an icon library.

---

### 2.3 Consent Screen — 5 Steps in One File
**File:** routes/ConsentScreen.tsx (765 lines) | **State:** consent (step: terms|biometric|liveness|selfie|audio)

One file, five sub-steps rendered via if (step === '...') blocks. No sub-component extraction.

**Step 1 — Terms of Use (step=terms):**
- h-64 overflow-y-auto scrollable static terms text
- Checkbox + "I agree and continue" CTA
- Persists consent to /sessions/{id}/consent

**Step 2 — Biometric Consent (step=biometric):**
- Three emoji icons (camera, lock, trash) at text-2xl
- Checkbox + "I consent, continue" CTA
- Decline button hidden behind CONSENT_MANDATORY=true constant (currently dead code)

**Step 3 — Liveness Challenge (step=liveness):**
- Live video element with -scale-x-100 mirror, FaceDetectionService polling at 100ms
- 3 tasks: Blink / Head Left / Head Right with real-time pass indicators
- "Skip Liveness Check (failsafe)" button — not visually de-emphasized
- Auto-advances to selfie step after 1 second when all 3 tasks pass

> **Redesign Risk R-03 (HIGH):** "Skip Liveness Check (failsafe)" looks identical to a standard secondary CTA. Should be visually de-emphasized or moved to a tertiary/danger style.

**Step 4 — Baseline Selfie (step=selfie):**
- aspect-video container: dashed border -> solid var(--success) on capture
- Mirror-flipped canvas capture (ctx.scale(-1,1)), stored as JPEG dataUrl in localStorage
- Up to 3 retries before flagging for manual review
- Oval guide overlay (dashed rounded-full opacity-40) after first failed attempt

**Step 5 — Audio/Microphone Consent (step=audio):**
- Emoji icons at text-2xl
- Checkbox + real getUserMedia audio test
- CTA blocked until both checkbox AND mic test pass
- Mic consent stored in localStorage only (not API)

**Compliance Halt Guard:**
- Rendered if complianceHalt===true — the setter is defined but NEVER CALLED (unreachable at runtime)
- Shows developer API route info in candidate-facing UI

> **Redesign Risk R-13 (MEDIUM):** Compliance halt screen exposes developer API route info in candidate UI.

---

### 2.4 Tutorial Screen
**File:** routes/TutorialScreen.tsx (382 lines) | **State:** tutorial (mode: full|condensed)

- Full mode: 7 steps — layout, timer, palette, run-vs-submit, module5-preview, practice, done
- Condensed mode: 4 steps — layout, timer, palette, done
- Step content in monolithic switch statement inside StepContent() inline function
- Progress bar (h-1 rounded-full bg-[var(--accent)] transition-all) + Back/Next nav
- Soft-interrupt countdown: amber banner in top-right when T minus 60 seconds (full mode only)
- Practice question (step 6): functional MCQ with instant feedback. 404 = correct. Wrong = amber text.
- Interface diagram (step 1): DOM-built CSS box mockup — no image asset
- Inbox preview (step 5): DOM-built two-column div mockup — no image asset
- proceedToAssessment() calls createSession() with selfie dataUrl from localStorage

> **Redesign Risk R-07 (MEDIUM):** Tutorial diagrams are DOM CSS boxes, not real illustrations or screenshots. Must be replaced during redesign. The step-content switch is 220+ lines — editing requires touching a monolithic function.

---

### 2.5 Waiting Room Screen
**File:** routes/WaitingRoomScreen.tsx | **State:** waiting-room

- Centered max-w-xl, no illustration or animation
- Large countdown: text-5xl font-mono font-bold MM:SS
- Module overview from MODULES fixture (NOT live session data)
- 4-item FAQ using native details/summary (no CSS transition animation)
- Auto-transitions to assessment when nowMs >= scheduledTimeMs

> **Redesign Risk R-08 (MEDIUM):** Module list from fixture, not live assigned questions.
> **Redesign Risk R-19 (LOW):** FAQ accordion has no CSS expand/collapse transition.

---

### 2.6 Assessment — ModuleShell (Shared Chrome)
**File:** components/ModuleShell.tsx

Used by all 5 module types as the outer chrome wrapper.

**Header (header element):**
- Left: Module name + Q{n} of {total} (hidden on < sm)
- Center-right: ProctoringIndicator + Timer + module nav tabs + theme toggle (emoji) + Final Review & Submit button
- Module tabs: px-2.5 py-1 rounded text-xs pills; active = bg-[var(--accent)] text-white
- Theme toggle: emoji moon/sun — no icon library used

**Left sidebar (aside element):**
- w-56 fixed width, hidden lg:block — NO mobile replacement

**Banner stack (above header):**
- TimerWarningBanner: amber at 10/5 min, bright amber+pulse at 1 min, never red
- Network disconnect banner (amber, role="alert")
- Fullscreen exit nudge (blue, with Re-enter fullscreen button)

**Integrity signals:**
- Tab-switch / window-blur: silent reportSilentSignal() — no candidate-visible UI
- F key: flags/unflags current question (disabled when focus is in text input)
- ProctoringModule singleton started once per assessment.sessionId

> **Redesign Risk R-02 (HIGH):** Sidebar is hidden lg:block with NO mobile fallback. Candidates on < 1024px have zero question navigation. This must be addressed in any responsive redesign.

---

### 2.7 Proctoring Indicator
**File:** components/ProctoringIndicator.tsx

- w-16 h-12 live video thumbnail (-scale-x-100 mirror) in the header
- Pulsing green/amber status dot + text: "Live Camera On/Off" + "Full/Basic Integrity"
- Click to expand: fixed bottom-5 right-5 z-50 floating panel, w-72 aspect-video video feed
- "REC • LIVE" red pulsing badge shown even when hasStream is false (display bug)
- Icons from lucide-react: Maximize2, Minimize2, Camera
- Expand animation: animate-in fade-in slide-in-from-bottom-2 duration-200

> **Redesign Risk R-10 (MEDIUM):** REC LIVE badge visible when camera is off — display bug.
> **Redesign Risk R-11 (MEDIUM):** Uses animate-in/fade-in/slide-in-from-bottom-2 Tailwind v4 utilities — confirm availability.

---

### 2.8 Timer Component
**File:** components/Timer.tsx

- font-mono text-sm px-3 py-1.5 rounded-md bg-[var(--surface)] border border-[var(--border)]
- Color thresholds: neutral -> warning at 10 min -> warning+semibold at 5 min -> warning+bold+animate-pulse at 1 min. Never red.
- "--:--" placeholder when timer not started
- useAssessmentTimer hook: watches elapsed time, auto-triggers syncing state on expiry
- TimerWarningBanner: three amber threshold banners rendered above header
- ModuleTimeBudgetIndicator: exported but rendered NOWHERE in the codebase

> **Redesign Risk R-14 (MEDIUM):** ModuleTimeBudgetIndicator is implemented but never used.

---

### 2.9 Question Palette
**File:** components/QuestionPalette.tsx

- Legend (4 statuses) at top of sidebar
- Question grid: flex flex-wrap gap-1.5 of w-8 h-8 square buttons
- Status styles:
  - unvisited: bg-[var(--surface)] border-[var(--border)]
  - answered: bg-[var(--success)]/20 border-[var(--success)]
  - skipped: bg-[var(--text-secondary)]/15 border-[var(--text-secondary)]
  - flagged: bg-amber-100 dark:bg-amber-900/30 border-[var(--warning)] (hardcoded Tailwind)
- Current question: ring-2 ring-[var(--accent)] ring-offset-1
- F keyboard shortcut hint below the grid

> **Redesign Risk R-06 (MEDIUM):** flagged status uses bg-amber-100 Tailwind classes, not CSS var. Won't adapt automatically if --warning token color changes.

---

### 2.10 MCQ Module
**File:** modules/mcq/MCQModule.tsx

- Questions fetched live: GET /sessions/{sessionId}/questions/{questionId}
- Restores persisted response from backend responsePayload.selectedOptions
- Custom radio/checkbox indicators: native input sr-only, visual circle/square span filled bg-[var(--accent)] when selected
- Option cards: flex items-center gap-4 p-4 rounded-lg border cursor-pointer transition-all
- Navigation: Previous | Skip | Next / Next Module / Final Review & Submit
- Loading: animate-pulse text. Error: text-[var(--warning)] message.

---

### 2.11 SQL Module
**File:** modules/sql/SQLModule.tsx

- Questions fetched live from API; schema + seed extracted from content
- sql.js loaded from CDN (cdnjs.cloudflare.com); also referenced as script tag in index.html
- Monaco editor, language="sql", theme adapts with useTheme()
- Schema reference: details/summary (no transition animation)
- Run Query: client-side sql.js exec, shows results table below
- Submit Answer: POST /sql/submit via services.sessionApi.submitModuleResponse()
- Results: font-mono text-xs table, NULL shown as italic text

> **Redesign Note:** sql-wasm.js CDN script loads globally on all pages (see index.html), not deferred.

---

### 2.12 Coding Module
**Files:** modules/coding/CodingModule.tsx, components/coding/CodingWorkspace.tsx (623 lines)

**CodingModule:**
- UUID validation guard: rejects fixture IDs that fail ParseUUIDPipe
- Two-panel grid-cols-1 lg:grid-cols-5 layout: description (2 cols) + workspace (3 cols)
- Left panel: challenge number, difficulty badge, title, prompt, constraints
- Uses CODING_QUESTIONS fixture for title/count fallback

**CodingWorkspace (623 lines):**
- 4 languages: Python, JavaScript, Java, C++ (via SUPPORTED_CODING_LANGUAGES)
- Monaco editor with custom cdRecruitDarkTheme / cdRecruitLightTheme
- Per-language code state preserved across language switches
- Starter code injected per language from content.starterCode
- Run: polls /coding/run with long-polling up to 30s, shows test case table
- Submit: POST /coding/submit, marks question answered
- Paste detection: fires DetectionEngineService integrity event
- Post-submit editor goes read-only
- Test results panel: collapsible max-h-64 / max-h-96
- Icons: lucide-react (Play, Server, Loader2, AlertCircle, CheckCircle, Terminal, ChevronUp, ChevronDown)
- Uses path alias @/ imports throughout

> **Redesign Risk R-12 (MEDIUM):** CodingModule uses bare bg-surface text-text-primary Tailwind semantic tokens rather than CSS var references. Requires matching Tailwind theme config to resolve.

---

### 2.13 AI Prompting Module
**File:** modules/prompting/PromptingModule.tsx

- Questions fetched live from API
- Context card: text-xs border surface card above the task
- Task card: p-4 rounded-lg border bg-[var(--surface)]
- Prompt textarea: font-mono, 6 rows, resize-y
- Verbatim detection: client-side token-overlap >= 65% shows amber "Direct Copy Detected" badge
- Submit: services.sessionApi.runAiPrompt() -> /ai-prompting/run; fallback to suggestedResponse on error
- AI response: whitespace-pre-wrap font-mono; "Socratic Mode Active" label when verbatim
- Revise prompt: clears response, re-enables input
- Loading dots: 3 animate-bounce spans with staggered animationDelay

---

### 2.14 Contextual Simulation Module
**Files:** modules/contextual/ContextualModule.tsx, components/InFictionInbox.tsx

- Falls back to CONTEXTUAL_QUESTIONS fixture if no assigned questions
- Scenario instructions card at top
- InFictionInbox: two-column layout — message list (w-72 fixed) + thread/reply panel
- Messages arrive via services.scenario.subscribe() (real-time)
- Unread badge on Inbox header
- InFictionThread: full message body + reply textarea + Send Reply button
- No skeleton or loading state while waiting for first message

> **Redesign Note:** w-72 fixed inbox sidebar clips on narrow screens. No responsive adaptation for < 768px.

---

### 2.15 Pre-Submit Review Screen
**File:** routes/PreSubmitReview.tsx

- Derives modules from live assessment.questions (falls back to fixture if empty)
- Per-module cards: number circle + name + "Return to module" link + answered/flagged/unanswered/total stats
- Completion bar per module: h-1.5 bg-[var(--success)]
- Unanswered warning: amber box if any question unanswered
- Timer shown in top-right
- "Return to assessment" + "Submit Final Assessment" buttons
- "This action cannot be undone." footnote

Note: Fully uses live assessment data — no mock data in current implementation.

---

### 2.16 Syncing Screen
**File:** routes/SyncingScreen.tsx

- 4 sequential steps: Syncing responses, Event log, Code submissions, Verifying integrity
- Each step card: flex items-center gap-3 p-3 rounded-lg border transition-colors
- Status icons: checkmark (done), warning (error), spinning char (syncing), circle (pending)
- animate-spin applied to span wrapping Unicode rotating char
- Auto mode banner: "Time's up — your last-saved answers are being submitted automatically."
- "Please don't close this window" in amber role="alert"
- responses step: iterates assessment.responses, calls submitModuleResponse() per question
- Final step: calls submitFinalAssessment() -> done transition
- Error + retry UI: "Retry sync" up to 5 times, then "Contact support"
- 20% random failure injected in mock mode for responses/verify steps (mixed into same runSync function)

> **Redesign Risk (MEDIUM):** Mock failure logic is in same code path as real API calls. Redesign of this component must not strip the real submitModuleResponse() call inside responses step.

---

### 2.17 Done / Thank You Screen
**File:** routes/DoneScreen.tsx

- text-6xl checkmark emoji as hero (no branded SVG icon)
- Two variants: "Assessment complete" (manual) / "Assessment submitted" (auto timeout)
- Reference ID: font-mono font-bold tracking-wider display
- Camera release confirmation: green card with unlocked emoji
- "What happens next": 3-step ordered list with bg-[var(--accent)]/20 numbered circles
- Learning Hub: 4 links all pointing to href="#learning-hub-*" stub anchors (go nowhere)
- Micro-survey: 1-5 rating buttons + textarea — submit is MOCKED (setTimeout 300ms), no API call
- services.cv.stop() called on mount to release camera/mic

> **Redesign Risk R-04 (HIGH):** Learning Hub links are dead stub anchors.
> **Redesign Risk R-09 (MEDIUM):** Survey submit wired to no API — data never collected.

---

### 2.18 Session Conflict Screen
**File:** routes/SessionConflictScreen.tsx

- Warning emoji, max-w-md text-center layout
- "Session active elsewhere" heading with two bullet options in surface card
- "Continue in this tab" button: broadcasts via BroadcastChannel, restores assessment state

---

### 2.19 Expired Screen
**File:** routes/ExpiredScreen.tsx

- Two variants: never-started (clock emoji) / drive-closed (lock emoji) with distinct headings and copy
- "What to do next" surface card with bullet list per variant
- "Contact Support" accent button + plain email text below

---

## 3. Design System — Token & Style Inventory

### 3.1 CSS Custom Properties
**Files:** src/index.css, src/theme/tokens.ts (TypeScript mirror)

| Token | Light | Dark |
|---|---|---|
| --bg | #FFFFFF | #0F1115 |
| --surface | #F5F6F8 | #1A1D24 |
| --border | #E4E6EB | #2A2E37 |
| --text-primary | #111318 | #F2F3F5 |
| --text-secondary | #6B7280 | #9CA3AF |
| --accent | #2F5CFF | #5B7FFF |
| --warning | #F59E0B | #FBBF24 |
| --critical | #E5484D | #F0555B |
| --success | #12B76A | #3ECF8E |

Theme toggled by .dark class on html element. ThemeProvider manages via React context with localStorage persistence + prefers-color-scheme auto-detection.

### 3.2 Typography

| Role | Family | Source |
|---|---|---|
| Body / UI | Plus Jakarta Sans | Google Fonts (preloaded in index.html) |
| Code / Mono | IBM Plex Mono | Google Fonts (preloaded in index.html) |

Weights: Jakarta Sans 300/400/500/600/700/800 + italic 400; IBM Plex Mono 400/500/600 + italic 400.
Applied in index.css on body and code, pre, .mono.

### 3.3 Monaco Editor Theme
**File:** src/theme/monacoTheme.ts

Custom cdRecruitLightTheme (base: vs) and cdRecruitDarkTheme (base: vs-dark) fully specified.
Dark uses #5B7FFF for cursor, #3ECF8E for strings, #F0555B for numbers.
Switched via useTheme() in Monaco editor components.

---

## 4. Component Reuse Map

| Component | Used By |
|---|---|
| ModuleShell | MCQModule, SQLModule, CodingModule, PromptingModule, ContextualModule |
| Timer | ModuleShell, PreSubmitReview |
| TimerWarningBanner | ModuleShell |
| QuestionPalette | ModuleShell |
| ProctoringIndicator | ModuleShell |
| CodeEditor (common) | SQLModule, CodingWorkspace |
| CodingWorkspace | CodingModule |
| InFictionInbox | ContextualModule |
| InFictionMessageItem | InFictionInbox |
| InFictionThread | InFictionInbox |
| ThemeProvider | App (root) |
| useModuleNavigation (hook) | MCQModule, SQLModule, CodingModule, PromptingModule, ContextualModule |
| useAssessmentTimer (hook) | AssessmentScreen |
| ModuleTimeBudgetIndicator | Defined in Timer.tsx — rendered nowhere |

---

## 5. Animation Inventory

| Animation | Implementation | Location |
|---|---|---|
| Resolving spinner | animate-spin on border div | SessionRouter.tsx ResolvingScreen |
| Timer pulse (< 1 min) | animate-pulse on timer text | Timer.tsx |
| Syncing step spinner | animate-spin on span wrapping Unicode char | SyncingScreen.tsx |
| System check spinner | inline-block animate-spin on span | SystemCheckScreen.tsx |
| Loading question text | animate-pulse | MCQ, SQL, Prompting modules |
| Tutorial pending text | animate-pulse | TutorialScreen.tsx |
| AI response dots | animate-bounce x3 with staggered animationDelay | PromptingModule.tsx |
| Progress bars | transition-all duration-500 | SystemCheckScreen, TutorialScreen |
| MCQ option card hover | transition-all on border/bg | MCQModule.tsx |
| Camera widget expand | animate-in fade-in slide-in-from-bottom-2 duration-200 | ProctoringIndicator.tsx |
| Proctoring status dot | animate-pulse on green/amber circle | ProctoringIndicator.tsx |
| Camera icon hover | transition-transform group-hover:scale-105 | ProctoringIndicator.tsx |
| FAQ accordion | Native details element — no CSS transition | WaitingRoomScreen.tsx |

Note: animate-in, fade-in, slide-in-from-bottom-2 are Tailwind v4 animation utilities. Confirm these are active before finalizing redesign tech stack.

---

## 6. Third-Party Dependencies

| Library | Version | Usage |
|---|---|---|
| react / react-dom | ^19.2.0 | Framework |
| react-router-dom | ^6.28.0 | Routing (v6 + v7 future flags) |
| tailwindcss | ^4.2.1 | Styling |
| @tailwindcss/vite | ^4.2.1 | Vite integration |
| zustand | ^5.0.14 | Session state store |
| @tanstack/react-query | ^5.101.1 | Installed but NOT USED (all calls via axios) |
| axios | ^1.7.9 | HTTP client (src/api/client.ts) |
| @monaco-editor/react | ^4.7.0 | Code editor (SQL + Coding modules) |
| monaco-editor | ^0.55.1 | Monaco peer dep |
| sql.js | ^1.14.1 | Client-side SQL engine |
| @mediapipe/tasks-vision | ^0.10.35 | Face/pose/object detection (proctoring) |
| lucide-react | ^0.575.0 | Icons (CodingWorkspace, ProctoringIndicator only) |
| @cd-recruit/shared-types | * | Shared TypeScript types |
| vite | ^6.0.3 | Build tool |

---

## 7. State Architecture

**State manager:** Zustand v5 — single store useSessionStore in src/store/sessionMachine.ts

**Screen state machine:** 11 possible states; transitions enforced via LEGAL_TRANSITIONS Set.
devForceJump() bypasses validation — used by InviteResolver for resume/conflict flows.

**localStorage keys:**

| Key | Content |
|---|---|
| cd-recruit-assessment-state | Full AssessmentState (responses, statuses, timer, questions) |
| cd-recruit-session | Full Session object |
| cd-recruit-session-token | Raw invite token |
| cd-recruit-scheduled-ms | Scheduled time in ms |
| cd-recruit-check-mode | System check mode (full/expedited) |
| cd-recruit-selfie-data | Base64 JPEG selfie (temporary, cleared on upload) |
| cd-recruit-mic-consent | 'true' when mic test passed |
| cd-recruit-theme | 'light' or 'dark' |

All screen navigation is state-driven, NOT URL-driven. URL stays fixed after token resolution.

---

## 8. Service / Adapter Architecture

src/services/index.ts — factory pattern selecting real vs mock adapters:

| Service | Port Interface | Env Var | Default |
|---|---|---|---|
| sessionApi | CandidateSessionApiPort | VITE_SESSION_API_MODE | real |
| time | TimeAuthorityPort | VITE_TIME_MODE | real |
| scenario | ScenarioEnginePort | VITE_SCENARIO_MODE | real |
| cv | CvDetectionPort | VITE_CV_MODE | real |

API base URL: VITE_API_BASE_URL (default: /api/v1).
All four services have typed port.ts interface + mock.ts + real.ts adapters.

---

## 9. Proctoring Pipeline Summary

16 files in src/proctoring/. Key services:

| Service | Responsibility |
|---|---|
| WebcamService | getUserMedia stream lifecycle |
| CapabilityCheck | WASM benchmark -> Tier A/B/C (2500/5000/10000ms polling interval) |
| FaceDetectionService | MediaPipe face landmark detection |
| PoseDetectionService | Body pose estimation |
| ObjectDetectionService | Object/phone detection |
| AudioDetectionService | Voice activity detection |
| DetectionEngineService | Orchestrates all, emits IntegrityEvent |
| EvidenceUploadService | Uploads clips to MinIO via /integrity/upload-evidence |
| RollingBufferService | 6-second rolling video+audio buffer, cuts clips on trigger |
| ProctoringEventService | Persists IntegrityEvent records to backend |

The proctoring pipeline is orthogonal to the visual layer. A screen redesign does not need to touch proctoring internals.

---

## 10. Redesign Risk Summary

| ID | Level | Location | Issue |
|---|---|---|---|
| R-01 | HIGH | App.tsx | Missing-token error uses hardcoded hex colors, ignores theme system |
| R-02 | HIGH | components/ModuleShell.tsx | Sidebar hidden lg:block with NO mobile fallback — zero question nav on < 1024px |
| R-03 | HIGH | routes/ConsentScreen.tsx | "Skip Liveness Check (failsafe)" visually identical to normal secondary CTAs |
| R-04 | HIGH | routes/DoneScreen.tsx | Learning Hub links all href="#..." — dead stub anchors |
| R-05 | MEDIUM | routes/TooEarlyScreen.tsx | Timezone alert uses hardcoded bg-blue-50 Tailwind classes, not CSS var tokens |
| R-06 | MEDIUM | components/QuestionPalette.tsx | flagged status uses bg-amber-100 Tailwind classes, not CSS var |
| R-07 | MEDIUM | routes/TutorialScreen.tsx | Tutorial diagrams are DOM CSS boxes — must be replaced with real illustrations |
| R-08 | MEDIUM | routes/WaitingRoomScreen.tsx | Module list from fixture, not live session questions |
| R-09 | MEDIUM | routes/DoneScreen.tsx | Micro-survey submit is mocked — no API wired |
| R-10 | MEDIUM | components/ProctoringIndicator.tsx | REC LIVE badge visible when camera is off (display bug) |
| R-11 | MEDIUM | components/ProctoringIndicator.tsx | Uses Tailwind v4 animate-in utilities — confirm availability before redesign |
| R-12 | MEDIUM | modules/coding/CodingModule.tsx | Uses bare bg-surface Tailwind tokens — needs theme config alignment |
| R-13 | MEDIUM | routes/ConsentScreen.tsx | Compliance halt screen shows developer API route info in candidate UI |
| R-14 | MEDIUM | components/Timer.tsx | ModuleTimeBudgetIndicator exported but never rendered anywhere |
| R-15 | MEDIUM | routes/SessionRouter.tsx | Fixture scheduledTime seeds localStorage for tutorial countdown instead of live API |
| R-16 | LOW | package.json | @tanstack/react-query installed but completely unused |
| R-17 | LOW | index.html | sql-wasm.js loads globally on all pages, not deferred or lazy-loaded |
| R-18 | LOW | App.tsx | LoginRedirect with hardcoded demo-token-2024 — unreachable dead code |
| R-19 | LOW | routes/WaitingRoomScreen.tsx | FAQ details accordion has no expand/collapse CSS transition |
| R-20 | LOW | Multiple files | All SUPPORT_LINK = mailto:support@cd-recruit.example.com — placeholder email |

