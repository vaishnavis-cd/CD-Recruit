# UI Transplant Mapping Matrix — Candidate-Web

**Document Status:** Phase 2 Screen-by-Screen Transplant Complete & Verified  
**Target Path:** `frontend/candidate-web` inside `CD-Recruit/`  
**Source Path (Visuals/Tokens):** `cd-recruit-frontend/` (Lovable Build)

---

## 1. Audit Summaries

### 1.1 Lovable Build (`cd-recruit-frontend/`) Audit
- **Framework & Libraries:** React 19.2.0, TailwindCSS v4.2.1 (`@tailwindcss/vite`), `lucide-react` 0.575.0, `@tanstack/react-router` (mock routing), Radix UI primitives (`@radix-ui/react-*`), `class-variance-authority`, `clsx`, `tailwind-merge`, `recharts`, `sonner`.
- **Design Tokens:** CSS variables in `src/styles.css` (`--background`, `--surface`, `--border`, `--foreground`, `--muted-foreground`, `--accent`, `--warning`, `--critical`, `--success`). Uses Plus Jakarta Sans for `--font-sans` and IBM Plex Mono for `--font-mono`.
- **Demo Tooling Scope:** `DemoPanel.tsx`, `DemoApp.tsx`, and `context.tsx` in `src/components/cdrecruit/`. These provide simulated timer progress, step jumps, and fake data overrides for the demo interface.
- **Mock Data Sources:** Hardcoded sample candidate names, fixed questions in `Modules.tsx`, fixed tick timing in `GateScreens.tsx` and `SyncingScreen.tsx`.

### 1.2 Production App (`CD-Recruit/frontend/candidate-web`) Audit
- **Framework & Libraries:** React 19.2.0, TailwindCSS v4.2.1 (`@tailwindcss/vite`), `lucide-react` 0.575.0, `react-router-dom` 6.28.0, `@monaco-editor/react`, `sql.js`, `zustand` 5.0.14, `@tanstack/react-query` 5.101.1, `@mediapipe/tasks-vision` 0.10.35.
- **State & Services Architecture:** Decoupled Port/Adapter layer (`src/services/`) supporting `INFRA_MODE` (`real` vs `mock` adapter per port), server-authoritative time sync (`services.time`), live proctoring face detection (`FaceDetectionService`), Judge0 code execution service, SQLite in-browser database execution, and offline queue submission retries.
- **Consent Structure:** Already cleanly decomposed into `src/routes/consent/` (`ConsentSimpleAgreementStep.tsx` for Terms & Audio, `ConsentBiometricStep.tsx`, `ConsentLivenessStep.tsx`, `ConsentSelfieStep.tsx`).
- **Dev Tooling:** `FlowControlPanel.tsx` in `src/dev/` provides legitimate developer state jumping and time travel QA controls when `VITE_TIME_MODE=mock`.

---

## 2. Mapping Matrix

| Production Screen / State | Has Lovable Equivalent? | Gap Detail (Missing State / Edge Case) | Real Logic to Preserve (Hooks / Services / Adapters) | Token / Styling System Conflict & Resolution |
| :--- | :--- | :--- | :--- | :--- |
| **Invite Resolver** (`InviteResolver.tsx`) | No | Lovable had no token decryption/loading screen. | `POST /sessions/start`, token validation, error routing to `ExpiredScreen`. | Manually construct using new `card-raised` and `animate-cd-fade-in` primitives. |
| **Too Early** (`TooEarlyScreen.tsx`) | Yes | Lovable faked countdown using local `useCountdown(120)` and manual button. Production auto-polls server time and transitions when window opens. | `services.time.subscribe(setNowMs)`, `scheduledTimeMs`, timezone difference comparison (`serverTzName` vs `localTz`), auto-transition to system check. | Map `--bg` to `--background` and `--text-primary` to `--foreground`. |
| **System Check** (`SystemCheckScreen.tsx`) | Yes | Lovable faked device checks. Production runs real camera, microphone, speaker, and network ping tests for `full` vs `condensed` modes. | `navigator.mediaDevices.getUserMedia`, canvas stream binding, speaker test audio play, mode switching. | Standardize status check icons and progress cards with new design tokens. |
| **Consent — Terms of Use & Audio** (`ConsentSimpleAgreementStep.tsx`) | Yes | Lovable had a combined tabbed view. Production splits terms and audio disclosure. | Terms acceptance state in `useSessionStore`, microphone permission check for audio consent. | Apply unified card container and clean checkbox styling. |
| **Consent — Biometric Notice** (`ConsentBiometricStep.tsx`) | Yes | Lovable auto-advanced. Production requires explicit biometric privacy opt-in. | Biometric consent flag in session store, audit log event dispatch. | Restyle notice card with updated typography and button hierarchy. |
| **Consent — Liveness Challenge** (`ConsentLivenessStep.tsx`) | Yes | Lovable used a fake 3-second timer. Production uses real MediaPipe/FaceMesh polling (head turn left/right, smile, blink). | `FaceDetectionService.startLivenessCheck()`, canvas overlay drawing, retry logic, liveness threshold verification. | Preserve liveness canvas overlay & guidance text while styling with new CSS variables. |
| **Consent — Baseline Selfie** (`ConsentSelfieStep.tsx`) | Yes | Lovable faked snapshot capture. Production captures camera frame to canvas and encodes to base64 DataURL with quality check. | Camera stream video element, canvas snapshot capture, retry / recapture handlers, store submission. | Style video container frame and capture action buttons with new tokens. |
| **Tutorial — Full Buffer** (`TutorialScreen.tsx`) | Yes | Lovable showed single static page. Production supports full 3-minute interactive sample exercise walkthrough. | `mode: 'full'`, sample answer evaluation, session begin API call (`services.session.beginSession`). | Restyle interactive sample widget using new input and card primitives. |
| **Tutorial — Condensed Grace** (`TutorialScreen.tsx`) | Yes | Lovable had no grace period variation. Production presents streamlined 3-card overview for grace candidates. | `mode: 'condensed'`, fast-track session start trigger. | Apply new card surface and chip styling. |
| **Waiting Room** (`WaitingRoomScreen.tsx`) | Yes | Lovable hardcoded static start time. Production calculates countdown to `assessmentStartTimeMs` via server time. | `services.time` countdown, auto-advance on 0ms, system check summary status. | Integrate `waiting-room-calm.png` artwork and new typography scale. |
| **Assessment Shell** (`AssessmentScreen.tsx`, `ModuleShell.tsx`) | Yes | Lovable used local state step index. Production orchestrates real module state transitions, header timing, and proctoring. | Module navigation, server time sync, window blur tracking, autosave status. | Replace shell navigation header, status chips, and module container styles. |
| **Timer Component** (`Timer.tsx`) | Yes | Lovable used local countdown interval. Production relies on server time calibration and locks QA controls in `VITE_TIME_MODE=real`. | Server time offset calculation, `VITE_TIME_MODE` lock check, deadline warnings. | Apply tabular mono numbers (`font-mono-data`) and warning pulse animation. |
| **Proctoring Indicator** (`ProctoringIndicator.tsx`) | Yes | Lovable used a mock toggle switch. Production monitors real webcam feed, tab switches, and integrity alerts. | Video stream state, tab-switch warning dialogs, posture anomaly events. | Restyle camera feed container and live indicator badge. |
| **Question Palette** (`QuestionPalette.tsx`) | Yes | Lovable used hardcoded status list. Production derives question status (answered, skipped, flagged) from candidate store. | Active question selection, answered status computation, module jump handlers. | Style palette pills with new accent/surface tokens. |
| **MCQ Module** (`modules/MCQModule.tsx`) | Yes | Lovable used sample question strings. Production reads real/mock question fixtures and records candidate selections. | Choice selection state, autosave payload generation. | Restyle radio option cards and selected state highlights. |
| **SQL Module** (`modules/SQLModule.tsx`) | Yes | Lovable showed static mock table. Production executes candidate query using `sql.js` in-browser SQLite engine. | In-browser SQLite execution, error parsing, data grid rendering. | Restyle query editor container and tabular results grid. |
| **Coding / DSA Module** (`modules/CodingModule.tsx`) | Yes | Lovable used static textarea/monaco mock. Production connects Monaco Editor to Judge0 backend API (`POST /coding/run`). | Monaco Editor integration, Judge0 execution runner, multi-testcase output tabs. | Restyle Monaco wrapper, testcase tabs, and execution result panels. |
| **AI Prompting Module** (`modules/AIPromptingModule.tsx`) | Yes | Lovable used fake delayed response. Production tracks prompt revisions, candidate reasoning, and response generation. | Prompt draft state, submission payload formation. | Restyle prompt chat interface and token/length counters. |
| **Contextual Simulation / Inbox** (`InFictionInbox.tsx`) | Yes | Lovable simulated incoming ticket on timer. Production manages ticket threads, reply drafting, and WebSocket events. | Ticket thread selection, unread badge counter, message draft submission. | Restyle email/ticket inbox list, thread header, and compose view. |
| **Pre-Submit Review** (`PreSubmitReview.tsx`) | Yes | Lovable had static list. Production audits answered vs unanswered questions across all 5 modules and confirms final submit. | Answer completion check, final session submit (`services.session.closeSession`). | Apply clean warning alerts for unanswered questions and action buttons. |
| **Sync Validation** (`SyncingScreen.tsx`) | Yes | Lovable faked sync with `setTimeout`. Production retries real payload submission queue and offers offline JSON download fallback. | Real offline queue submit loop (`submitModuleResponse`), `downloadBackupPayload` fallback. | Restyle sync progress bar and offline fallback card. |
| **Thank You / Completion** (`DoneScreen.tsx`) | Yes | Lovable showed static complete screen. Production renders session completion summary, receipt download, and external links. | Session summary metadata, receipt PDF/text export generator. | Embed `assessment-complete.png` artwork and restyle summary card. |
| **Link Expired / Drive Closed** (`ExpiredScreen.tsx`) | Yes | Lovable showed generic link expired. Production distinguishes expired invite, closed drive, and revoked token. | Invite token status parsing, support mailto link (`support@cd-recruit.com`). | Apply new alert surface and support action button. |
| **Session Active Elsewhere** (`SessionConflictScreen.tsx`) | Yes | Lovable had static takeover button. Production claims active session token and revokes remote tab session. | `services.session.claimSession()`, session takeover re-authentication. | Restyle conflict alert hero icon and action button. |
| **Disconnect Banner** | No | Lovable had no disconnect overlay. Production shows sticky banner when server WebSocket / heartbeat fails. | Network connection state listener, retry indicator. | Build styled sticky banner using new warning tokens and subtle pulse animation. |
| **Sandbox Failure Alert** | No | Lovable had no backend failure state. Production highlights Judge0 execution engine downtime vs candidate code bugs. | Judge0 HTTP error status parsing. | Construct distinct error alert using critical design tokens. |
| **Reduced-Proctoring Disclosure** | No | Lovable had no proctoring policy notice. Production notifies candidate when camera/mic is disabled by assessment policy. | Session proctoring policy flags. | Build disclosure badge and card using subtle accent tokens. |

---

## 3. Recommended Actions & Next Steps
1. **Phase 1 (Tokens & Shared Components):** Unify `index.css` design tokens, add missing shadcn/Radix/utility helpers (`btn-primary`, `btn-secondary`, `card-base`, `animate-cd-*`), and ensure `lucide-react` is exclusively used.
2. **Phase 2 (Screen Transplant):** Update screen components working strictly through the Mapping Matrix worklist, preserving underlying logic.
3. **Phase 3 (Cleanup):** Verify zero Lovable demo code (`DemoPanel`, `DemoApp`, `demo context`) or fake timers ship. Keep production `FlowControlPanel`.
4. **Phase 4 (QA & Regression):** Test server timing, proctoring events, Judge0 code runner, SQL engine, and offline sync.
