# CD-Recruit — Audit Findings TODO & Three-Track Build Plan

Companion to `CD-Recruit_Repository_Gap_Analysis_and_Build_Backlog.md`, built directly from the Phase 0 discovery audit output. This is a live tracking document, not a finalized spec — check items off in place as they land.

---

## 0. Critical Findings — read before picking a track

Two things are worse than "not yet built" and deserve visibility regardless of who picks them up:

- **The Say-Do Consistency Score is fake right now.** `backend/correlation-engine` is empty (0-byte `main.py`, `.gitkeep`-only subfolders). `simulation.service.ts:237` returns a hardcoded `85.0` in its place. Until Track C ships a real engine, **any score currently visible anywhere in the admin dashboard is not real** — recommend the Reports popup explicitly labels it "Placeholder — not yet computed" rather than silently showing a real-looking number a reviewer could act on by mistake. This is an honesty/trust issue, not just a missing feature — treat it with the same seriousness as the "prevention is an overclaim" framing already applied to integrity monitoring.
- **Confidence gating doesn't gate anything.** It's wired into dashboard stat groupings only — not into actual auto-score-vs-human-review routing. The TAD's core review-safety mechanism doesn't exist as a functional gate yet.

One more item needs a precise answer, not an assumption — flagged in Track B, item 1: whether `EventGenerationService`'s Claude API usage runs live during an active candidate session. If it does, that's a direct violation of the locked principle that raw LLM generation never touches a live session. The audit confirms the API key is used there for scenario content, but not the timing — this needs a targeted follow-up read before anything else in that area gets touched.

---

## 1. Naming Collision — resolved, no action needed

Confirmed clean: `drive` module implements the Drive entity correctly; storage is properly separated under `integrations/storage` (`ObjectStoragePort`) and `minio`. Cross this off — it was the right thing to check, and it checked out.

---

## 2. Schema Correction to Prior Doc

The earlier gap analysis listed `disposition` on `INTEGRITY_FLAG` as an open gap from memory — the audit shows it's actually **present** (`disposition String?`, schema.prisma:265). Only `agreed_with_ai` on `REVIEWER_DECISION` is still genuinely absent. Updating the record here so the backlog reflects reality.

---

## 3. How the Three Tracks Stay Autonomous

This follows your existing ownership split (MVP plan §8) — Dev A / Candidate Experience, Dev B / Backend Core & Orchestration, Dev C / Correlation Engine, Grading & Data — with one adjustment worth flagging explicitly: **the Drive-wizard upgrade is assigned to Track B**, since it wasn't clearly owned by anyone in the original split (Dev B owns admin backend endpoints, Dev C owns admin analytics views, but neither was named owner of general admin-web frontend build work) and it pairs naturally with Track B's other backend-endpoint work.

**The one real cross-track dependency:** Track A and Track B both need new Prisma fields that only Track C can migrate. To keep this from becoming a hidden blocker:

- Track C should land the **schema migration** (Section 6 below) in the first day or two — before going deep on the Correlation Engine build itself — so the fields exist even before the logic using them is finished.
- Track A and Track B should develop against typed mock shapes for those fields in the meantime, same pattern already established for port adapters defaulting to mock — don't sit idle waiting on the migration.
- Track B's item 6 (wire confidence gating into real routing) is soft-blocked on Track C shipping basic grading output — sequence that item last within Track B's list, not first.

---

## 4. Track A — Candidate Experience

- [ ] **Build the `proctoring-event` real adapter.** Currently no folder/adapter exists at all. Wire tab-switch, paste-anomaly, and fullscreen-exit events to the backend Proctoring Event Service. Coordinate the event contract shape with Track B item 3 (backend correlation logic) so both sides agree on payload shape before either is finished.
- [ ] **Build the `identity`/KYC real adapter.** Also completely missing. Build against the DIY liveness-challenge default (MVP plan §10.1 recommendation) unless told otherwise — consent screen + baseline selfie + blink/head-turn challenge.
- [ ] **Fix `cv/real.ts`.** Currently throws an error ("stays mock") rather than being a documented deferred state. At minimum, replace the throw with an explicit, clearly-commented "not implemented — MediaPipe CV deliberately deferred" state so it reads as a decision, not a bug, for anyone hitting it later.
- [ ] **Wire new time-gate/session fields into the UI** once Track C's migration lands: `scheduled_time` countdown, `buffer_minutes`/`grace_minutes` pulled from Drive/Invite instead of any hardcoded default, `tutorial_mode` (full vs. condensed) selection, `actual_start_at` capture on session start.
- [ ] **Functional pass on time-gate states + FlowControlPanel.** The audit confirms these exist in code and are wired — worth an actual end-to-end functional test (Too Early → Buffer → Grace → Expired transitions, dev-only state jumping) rather than just confirming the files exist.
- [ ] **Accessibility pass.** Screen-reader support, keyboard-only navigation, admin-settable extended-time flag — still entirely unaddressed in the codebase and every prior spec doc. Worth scoping explicitly rather than continuing to let it default into silence.

---

## 5. Track B — Backend Core, Orchestration & Admin Dashboard

- [ ] **Urgent — confirm `EventGenerationService`'s call timing.** Read `event-generation.service.ts` lines 41-51 and 146-175 specifically to determine whether Claude API calls happen live during an active candidate session (Scenario Orchestrator triggering content on the fly) or only at offline content-authoring time. If live, this needs to be fixed immediately — it violates the locked "raw LLM generation never touches a live session" principle. If offline, document that clearly so it doesn't get miscategorized later.
- [ ] **Upgrade Drive creation from single-page modal to the specified 6-step wizard** (Basics → Modules → Questions → Schedule → Candidates → Review & Send), per Admin IA doc §3.1:
  - [ ] Per-module time allocation in the Modules step
  - [ ] Completeness check blocking Step 6 (e.g., "Contextual Simulation has no scenario template selected")
  - [ ] CSV/XLSX candidate bulk upload with preview/validate — duplicate-email and missing-field detection before invites generate
  - [ ] Concurrency warning at Step 4 if candidate count is high relative to the schedule window (Admin IA §3.3's flagged infra-risk gap)
- [ ] **Build/verify `proctoring-event` backend correlation logic** — tab-switch + large-external-insert weighting, provenance tagging for self-copied content (TAD §3.1). Cross-check the event contract against Track A's new adapter so both sides match.
- [ ] **Keycloak cutover from dev-JWT.** Already known-pending; strategy files exist as a stub per the audit.
- [ ] **Settings: add appeal-window timing config.** Retention days already exist in `settings.service.ts`; appeal-window duration does not — small, isolated addition.
- [ ] **Wire confidence gating into real auto-score-vs-human-review routing**, replacing the current dashboard-stat-only usage. Sequence this last — it needs Track C's Grading Service to produce a real confidence value first.

---

## 6. Track C — Correlation Engine, Grading & Data

This is the highest-priority track overall — it's the platform's core IP and the MVP's stated #1 success condition, and it's currently the least-built part of the system.

- [ ] **Schema migration first pass** (do this early, before the deep Correlation Engine build, so Tracks A/B aren't stalled):
  - [ ] `agreed_with_ai` (boolean) on `REVIEWER_DECISION`
  - [ ] `scheduled_time` on `INVITE`
  - [ ] `buffer_minutes`, `grace_minutes` on `INVITE`/`DRIVE`
  - [ ] `tutorial_mode` on `SESSION`
  - [ ] `actual_start_at` on `SESSION`
  - [ ] Slot auto-distribution field on `DRIVE`
  - [ ] Question-version snapshot-binding field
  - [ ] Confirm `SessionStatus.ABANDONED` enum is sufficient for the resume/abandonment tracking need, or needs a richer status
- [ ] **Critical — build the actual Correlation Engine.** Currently an empty directory. This is the real work: cross-referencing code diffs against admin-tagged concern flags, intent classification on written responses, producing the Say-Do Consistency Score.
- [ ] **Critical — remove the hardcoded `85.0`** from `simulation.service.ts:237` and replace with either a real call to the new engine or, until that's ready, a value explicitly flagged as a placeholder all the way through to the admin UI (coordinate the UI-side label with whoever's on Reports).
- [ ] **Build the Grading Service** — real Claude API rubric-based grading, to sit alongside or replace `CompetencyEngine`'s current deterministic/keyword-based scoring for the modules the dual-rubric (fresher/experienced) design covers.
- [ ] **Produce a real AI-confidence value per session** on the `SCORE` model, so Track B's routing logic has something real to gate on.
- [ ] **Complete the report schema** — ensure the real Say-Do output and AI rationale text actually populate both report variants (internal/candidate-facing) per the TAD's schema.

---

## 7. Suggested Order of Operations

1. Track C lands the schema migration (Section 6, first checklist) — days 1-2.
2. Tracks A and B start immediately in parallel against mocked field shapes; Track C continues into the Correlation Engine + Grading Service build.
3. Track B's confidence-gating item and Track A's non-schema items proceed independently of Track C's deeper build.
4. Once Track C ships a real score + confidence value, Track B closes out the routing item last.

---

*Update this document in place as items land — it's a live backlog, not a frozen spec.*
