# CD-Recruit — Architecture Decision Log

This file records explicit decisions made during MVP design. Each entry captures what was decided, why, and what would trigger revisiting it. Disagreement with a decision here goes through a PR on this file — not through a comment in Slack or silent code divergence.

---

## Decision 1 — KYC / Liveness Approach

**Decision:** DIY liveness challenge (MediaPipe blink + head-turn) for the pilot. No third-party KYC vendor in scope for MVP.

**Rationale:**

- Paid KYC vendors (Onfido, DigiLocker-linked flows, etc.) introduce meaningful integration time, per-check cost, and contractual onboarding lead time — none of which are compatible with a fast pilot.
- DIY MediaPipe liveness is not equivalent fraud resistance to a government-ID-backed check, and we are not claiming it is.
- The baseline selfie capture + continuous silent re-verification during the simulation addresses session-continuity identity drift (someone switching seats mid-session) without requiring a government credential at entry.
- Pilot design-partner clients will be told explicitly that this is a lighter check than production KYC. Written acknowledgement is required before any pilot client processes real hiring decisions.

**What would trigger revisiting:**

- A pilot client or legal counsel requires government-ID verification as a condition of use.
- Observed identity fraud rate in pilot sessions exceeds a threshold that the DIY check fails to catch.
- A paid vendor's onboarding lead time drops below 1 week with acceptable per-check cost.

**Owner:** Product lead sign-off required to change.

---

## Decision 2 — Module Scope for MVP

**Decision:** Coding/DSA + Contextual Simulation only. MCQ, SQL, and AI Prompting are out of MVP scope.

**Rationale:**

- The platform's core differentiator is the Say-Do Consistency Score, which requires at minimum one code-quality signal (Coding) and one behavioral/judgment signal (Simulation). Those two modules are the minimum to produce a defensible score.
- MCQ and SQL modules add content-authoring burden without contributing to the Consistency Score logic. AI Prompting is architecturally straightforward but the evaluation rubric is not mature enough to grade reliably in the pilot timeframe.
- Shipping two well-designed modules is better than shipping five shallow ones. Content depth in these two modules matters more than module breadth.

**What would trigger revisiting:**

- A pilot client explicitly requires a specific additional module as a condition of participation.
- Post-pilot data shows that the two-module score has meaningful gaps that a third signal would address.
- Content-authoring bandwidth increases enough to write, validate, and grade a third module type properly.

**Owner:** Product lead + engineering lead joint decision required to add a module.

---

## Decision 3 — Role Scope for MVP

**Decision:** Software Developer role only. No other role templates in scope for the pilot.

**Rationale:**

- The Correlation Engine's Say-Do scoring relies on a role-specific rubric. Building a credible rubric for one role well is more valuable than a generic rubric that applies weakly across many.
- The seeded question bank, scenario scripts, and weighting presets need real SME review. That review is feasible for one role in the pilot timeframe; it is not feasible for three.
- A single role also allows the first real sessions to generate comparison data quickly — you need a cohort of sessions on the same role to validate whether the score is meaningful, and a single role gets you there faster.

**What would trigger revisiting:**

- The pilot produces enough Software Developer sessions to validate the scoring model (define "enough" in the pilot success criteria before build starts).
- A second role's scenario content is authored, SME-reviewed, and ready — not just drafted.

**Owner:** Engineering can implement multi-role infrastructure at any point (the schema already supports it). Adding a live role template to the question bank requires product sign-off.

---

## Decision 4 — Data Residency / Compliance Region

**Decision:** India deployment. DPDP Act (Digital Personal Data Protection Act, 2023) is the governing compliance regime for personal data. Biometric data (webcam evidence clips) is treated as sensitive personal data under DPDP.

**Rationale:**

- All pilot clients are India-based. Hosting in an India region removes cross-border transfer questions for personal data.
- DPDP applies to processing of digital personal data in India. Biometric processing during proctoring falls squarely in scope.
- Architecture decisions downstream of this: Postgres and MinIO must physically reside in an India region, evidence clips must have a defined retention/deletion lifecycle, and candidate consent must be captured explicitly before biometric collection begins.

**Key compliance constraints this decision imposes:**

1. A Data Protection Impact Assessment (DPIA) must be completed — with counsel — before any code that processes webcam data reaches a real candidate.
2. Candidate consent screen must include plain-language disclosure of what biometric data is collected, for how long, and who can access it.
3. `EvidenceClip.expires_at` is not optional and must be enforced by an automated deletion job — not manual cleanup.
4. No persistent biometric identity template is ever built or stored. The baseline selfie is session-scoped, not used to build a cross-session identity profile.

**What would trigger revisiting:**

- A pilot client is based outside India, requiring assessment of additional data protection regimes.
- Counsel advises a different lawful basis or a different consent-flow structure based on DPDP guidance that post-dates this decision.

**Owner:** Legal/compliance review required to change the residency or compliance posture. Engineering implements whatever the outcome is.

---

## Decision 5 — Monorepo Structure with Root `packages/shared-types`

**Decision:** Single monorepo. Shared TypeScript types live in `packages/shared-types` at the root, not duplicated in `frontend/shared/types` and `backend/shared/types`.

**Rationale:**

- The FE/BE contract (API shapes, Prisma model types, enum values) is the highest-leverage artifact to keep in sync. A single source of truth prevents the silent drift that happens when two copies of the same type diverge across a PR or two.
- `packages/shared-types` is a workspace package; both `frontend/candidate-web` and `backend/api` add it as a dependency. Any type change is a single PR that touches one file, with both consumers immediately seeing the breakage if they diverge.
- `frontend/shared` and `backend/shared` directories exist for app-specific utilities (React hooks, NestJS utilities) that are not cross-boundary — they are not duplicating `packages/shared-types`, they're a different category.

**What would trigger revisiting:**

- The monorepo becomes large enough that a separate package repo for shared-types is worth the overhead. That is not a near-term concern.

**Owner:** Engineering decision, no additional sign-off required. Any structural change to the workspace layout requires a PR to this file.

---

## Decision 6 — `activeTabId` Generation Ownership

**Decision:** The **frontend generates** `activeTabId` — a UUID (`crypto.randomUUID()`) created once per tab on initial load, stored in module-level memory (not `sessionStorage`, not `localStorage`).

**Rationale:**

- The backend's job is to enforce single-active-session by comparing the incoming `tabId` against `Session.activeTabId`. It does not care where the UUID came from as long as it is stable for the lifetime of a tab and unique across concurrent tabs.
- `crypto.randomUUID()` is available in all target browsers without a dependency, produces cryptographically random UUIDs, and requires zero backend round-trips.
- Memory-only storage (not `sessionStorage`/`localStorage`) means a page reload generates a new `tabId`, which is the correct behavior — a reload should be treated as a reconnect, going through `POST /sessions/:id/resume` with the fresh `tabId`. This correctly increments `disconnectCount` if the session was in DISCONNECTED state when the tab reloaded, rather than silently re-using the old `tabId` and bypassing the disconnect accounting.
- If `tabId` were server-generated, the client would need an extra round-trip before the first heartbeat, adding latency and a new failure mode (what if the ID endpoint is unreachable?) for no benefit.

**Implementation note:**

```ts
// candidate-web/src/store/session.ts (or equivalent module)
// Generated once on tab load. Never persisted. Never sent to the server
// except in heartbeat and resume requests.
export const TAB_ID = crypto.randomUUID();
```

**What would trigger revisiting:**

- A requirement emerges to detect tab duplication (user opens session in a new tab via Cmd+T from an existing tab). In that case the server may need to issue a challenge token tied to the original tab. Not a current requirement.

**Owner:** Engineering decision. Both frontend and backend must agree on the `tabId` field name in request bodies — that is locked in `packages/shared-types` (`HeartbeatRequest.tabId`, `ResumeSessionRequest.tabId`).

---

## Decision 7 — Heartbeat Timing Numbers

**Decision:** The following concrete values govern the heartbeat / disconnect / reconnect lifecycle. They are the exact numbers the schema's `disconnectCount`, `lastHeartbeatAt`, and `disconnectedAt` fields are built around.

| Parameter                          | Value                                | Where it lives                                      |
| ---------------------------------- | ------------------------------------ | --------------------------------------------------- |
| Heartbeat send interval            | **15 s**                             | Frontend — `setInterval` in heartbeat hook          |
| Heartbeat stale threshold          | **45 s**                             | Backend — BullMQ scheduler checks `lastHeartbeatAt` |
| Missed cycles before DISCONNECTED  | **3** (3 × 15 s = 45 s)              | Derived; not a separate config value                |
| Grace window (reconnect allowed)   | **5 minutes** from `disconnectedAt`  | Backend — resume endpoint + BullMQ delayed job      |
| Max disconnects before AUTO_SUBMIT | **3** (i.e., `disconnectCount >= 3`) | Backend — resume endpoint guard + schema comment    |
| BullMQ job poll cadence            | **10 s**                             | Backend — scheduler, not visible to frontend        |

**Why these numbers:**

- **15 s interval / 45 s stale:** Three missed heartbeats before declaring a disconnect is the minimum that avoids false positives from normal browser tab-backgrounding on mobile (iOS throttles timers to ~30 s when backgrounded). One missed heartbeat (15 s threshold) would flag backgrounding as disconnection on every phone. Three missed cycles is the safe floor.
- **5-minute grace window:** Long enough for a candidate to notice a browser crash, reopen the tab, and resume without losing work. Short enough that a genuine impersonation attempt (someone else sitting down at the machine) doesn't get a free pass. Matches what most proctoring platforms use as a reconnect window.
- **Max 3 disconnects → AUTO_SUBMIT:** A single disconnect (power blip, network hiccup) is routine. Two is suspicious. Three means the session integrity signal is too degraded to continue — auto-submitting what exists is the least bad outcome, since it preserves the candidate's work while flagging the session for human review.

**Schema fields this decision is pinned to:**

- `Session.lastHeartbeatAt` — updated on every successful heartbeat
- `Session.disconnectedAt` — set when `lastHeartbeatAt` crosses the 45 s stale threshold
- `Session.disconnectCount` — incremented each time status transitions to `DISCONNECTED`
- `Session.activeTabId` — set/updated on session start and resume (see Decision 6)

**Configuration:** These values are read from environment variables at startup so they can be tuned without a code deploy. See `.env.example` for the variable names (`HEARTBEAT_STALE_THRESHOLD_SECONDS`, `GRACE_WINDOW_SECONDS`, `MAX_DISCONNECT_COUNT`).

**What would trigger revisiting:**

- Real pilot data shows a false-positive disconnect rate > ~5% of sessions (suggests the 45 s threshold is too aggressive).
- A mobile-first candidate profile emerges (iOS timer throttling behavior may require a longer stale threshold).
- The 5-minute grace window generates support complaints ("my session expired while I was getting water") at meaningful frequency.

**Owner:** Engineering decision. Changing any number requires updating this table, the `.env.example` defaults, and the BullMQ job configuration together in one PR — never changing one without the others.
