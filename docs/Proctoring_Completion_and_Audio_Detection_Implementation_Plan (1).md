# Proctoring System — Completion & Audio Detection — Implementation Plan

Companion to the camera/webcam proctoring audit (code-verified against the current repo state). Face/pose/object detection and the rolling-buffer clip-capture pipeline are confirmed **fully working** — this plan does not touch either. Everything below closes a specific confirmed gap or adds the new microphone/audio detection capability on top of the existing, working pipeline.

---

## User Review Required

> [!IMPORTANT]
> **Two silent placeholders are currently live in candidate/reviewer-facing UI.** `ConsentScreen.tsx` shows a green "✓ Captured" badge on selfie capture even though the photo is discarded client-side and never uploaded — `Session.baselineSelfieRef` stays `null` for every real candidate. Separately, the admin dashboard's "View Clip" modal renders a static `[Proctoring Evidence Video Stream Player]` placeholder div, not an actual video. Both look complete to anyone who isn't reading the code. Treat these with the same urgency as the hardcoded `85.0` Say-Do score from the Track C audit — same failure mode, different subsystem.

> [!WARNING]
> **Webcam-sourced integrity signals are currently invisible to review and scoring.** Phone/headphone/book/seat-exit/gaze events are stored only in `ProctoringEvent`, not `IntegrityFlag`/`EvidenceClip`. `ProctoringService.evaluateEvent()` only creates `IntegrityFlag` rows for paste/copy anomalies. This means the admin flag list, the reports UI, and (once built) the Correlation Engine's integrity-signal input are all blind to every webcam-based detection today, despite the detectors themselves working correctly.

> [!CAUTION]
> **Biometric clips currently have no retention enforcement.** `biometricRetentionDays: 30` exists in settings but nothing acts on it — clips persist indefinitely in MinIO and Postgres. This is a legal exposure, not a polish item, given the DPIA obligations already flagged for biometric processing.

> [!CAUTION]
> **Audio adds a new consent and DPIA surface.** Enabling microphone capture requires an explicit, separate consent step — do not bundle it silently into existing video consent. Confirm the DPIA scope is updated to cover voice data before this ships to real candidates; in some jurisdictions voice used for any recognition purpose counts as biometric data even when only doing voice-activity detection, not speaker identification.

> [!IMPORTANT]
> **Track A ownership overlap — coordinate before starting Phase 1.** A teammate is separately building the `identity`/KYC real adapter (consent screen + baseline selfie + blink/head-turn liveness challenge) under Track A. That build touches the same file as Phase 1 below (`ConsentScreen.tsx`) and likely implements the selfie-upload call as part of building the adapter from scratch. **Do not start Phase 1 until you've confirmed with your teammate whether their KYC adapter work supersedes it.** If their work is imminent, skip Phase 1 and let it land as part of their build. If their work is scheduled later, Phase 1 can go in now as a small stopgap fix — but flag to your teammate that this file was touched, so their later work doesn't silently overwrite or conflict with it. The dead-code cleanup for `services/cv/real.ts` (previously Phase 7 in this plan) has been removed entirely — it's a duplicate of Track A item 3 and is now solely owned there.

---

## Open Questions

1. **Audio detection scope for MVP.** This plan implements voice-activity-detection (VAD) plus a sustained/overlapping-speech heuristic as a proxy for "a second person may be present" — not true speaker diarization (reliably distinguishing whose voice is whose). Is a proxy signal acceptable for MVP, with real diarization deferred, or does day-one credibility require the stronger version?
2. **Identity re-check model choice.** No face-embedding/similarity approach exists yet. Options range from lightweight (reusing MediaPipe FaceLandmarker geometry as a coarse similarity proxy) to a dedicated face-recognition WASM model (more accurate, more bundle weight, likely more reliable). Needs a short accuracy spike before committing — which threshold of confidence is "good enough" to flag `IDENTITY_MISMATCH` without false-positiving on lighting/angle changes?
3. **`ProctoringEvent` vs `IntegrityFlag`/`EvidenceClip` — keep both or migrate fully?** This plan keeps `ProctoringEvent` for raw telemetry and adds `IntegrityFlag`/`EvidenceClip` as the canonical review/report surface. Confirm that's the right long-term shape rather than a full migration off `ProctoringEvent`.
4. **Retention job schedule and audit granularity.** How often should the deletion job run (hourly/daily), and does each deletion need an audit-log entry for compliance purposes, or is a structured log line sufficient at MVP stage?
5. **Timing of the teammate's KYC adapter build vs. Phase 1.** Is the Track A identity/KYC adapter (consent screen + baseline selfie + liveness challenge) starting imminently, or is it scheduled later? This determines whether Phase 1 runs now as a stopgap or is skipped entirely in favor of their build.

---

## Proposed Changes

Ordered to fix the smallest/most isolated issue first, then the highest-impact structural gap (schema alignment, since it blocks correct dashboard and Correlation Engine behavior), then the net-new audio work last so it lands on a clean, schema-aligned pipeline.

---

### Phase 1 — Selfie Upload Wiring (Day 1) — ⚠️ HOLD, pending teammate coordination

**Do not start until Open Question 5 is answered.** This phase may be entirely superseded by the teammate's Track A KYC adapter build (see User Review Required above).

#### [MODIFY] `session-api/port.ts`
Add an `uploadSelfie(sessionId, selfieDataUrl)` method to `CandidateSessionApiPort`, calling the existing backend endpoint `POST /api/v1/sessions/:sessionId/selfie` (already correctly implemented in `session.service.ts:734` — no backend change needed here).

#### [MODIFY] `ConsentScreen.tsx`
- Call the new `uploadSelfie` method immediately after capture, before `transitionTo({ type: 'tutorial' })` fires.
- Only show the "✓ Captured" success state after the upload actually resolves successfully — not on local canvas capture alone. Add a distinct in-progress/error state for the upload step so a failed upload is visible, not silently swallowed.

---

### Phase 2 — Schema Alignment: Webcam Events → `IntegrityFlag` + `EvidenceClip` (Day 1–3)

The highest-impact fix — everything downstream (dashboard, reports, future Correlation Engine input) depends on this.

#### [MODIFY] `proctoring.service.ts`
Extend `evaluateEvent()` (around lines 231–301) so webcam detection events — not just `PASTE`/`EXTERNAL_INSERT` — create an `IntegrityFlag` row. Map detection types to `category` values: `PHONE_DETECTED`, `HEADPHONES_DETECTED`, `BOOK_DETECTED`, `SEAT_EXIT`, `GAZE_AWAY` (extend with `IDENTITY_MISMATCH` in Phase 6, `SPEECH_DETECTED`/`SECOND_VOICE_SUSPECTED` in Phase 5).

#### [MODIFY] `proctoring.service.ts` (lines 119–124 area)
When a webcam clip finishes uploading to MinIO, create a linked `EvidenceClip` row (`storage_ref`, `expires_at`) referencing the same object already produced by the existing upload logic — no new upload code needed, just the missing DB linkage.

#### [KEEP] `ProctoringEvent` table
Retain as-is for raw telemetry (per Open Question 3) — this phase adds `IntegrityFlag`/`EvidenceClip` alongside it, not instead of it.

---

### Phase 3 — Dashboard Clip Viewer Fix (Day 3–4)

Depends on Phase 2 landing first so flags actually populate correctly.

#### [MODIFY] `results.$id.tsx` (lines 382–409, 402, 482–485)
- Replace the hardcoded `setActiveClipUrl('/proctoring/clips/${flag.id}.webm')` with a real call to the existing, already-working presigned-URL endpoint: `GET /api/v1/proctoring/session/:sessionId` (`MinioService.getSignedUrl()` in `proctoring.service.ts:156` — backend needs no change).
- Replace the `[Proctoring Evidence Video Stream Player]` placeholder div with an actual `<video>` element, `src` set to the returned signed URL.
- Update the flag list to read from `IntegrityFlag` (post-Phase-2) so webcam clips appear alongside paste/copy flags instead of being absent.

---

### Phase 4 — Retention/Deletion Job (Day 3–4, parallel with Phase 3)

#### [NEW] Scheduled BullMQ repeatable job (reuses existing Redis/BullMQ infra — no new infrastructure)
- Query `EvidenceClip` and baseline-selfie records where `expires_at` has passed (window driven by the existing `biometricRetentionDays` setting).
- Delete the MinIO object, then the DB row.
- Log each deletion (structured log line at minimum, per Open Question 4 — escalate to a formal audit-log entry if compliance requires it).

#### [MODIFY] `settings.service.ts`
Confirm `biometricRetentionDays` is read live by the job rather than only surfaced in the settings UI — currently it's saved but nothing consumes it.

---

### Phase 5 — Microphone / Audio Detection (Day 4–7)

Net-new capability. Reuses the existing rolling-buffer/clip pipeline entirely — the only new work is capture-permission and detection.

#### [MODIFY] Wherever `getUserMedia({ video: true })` currently runs for camera setup
Add `audio: true` to the same call. Since `rolling-buffer.service.ts` and `evidence-capture.service.ts` already record from the `MediaStream` via `MediaRecorder`, audio is captured automatically once present on the stream — **no changes needed to either file**.

#### [MODIFY] `ConsentScreen.tsx`
Add an explicit microphone/audio-recording consent step, separate from the existing terms → biometric → selfie steps. Microphone capture must not enable for any candidate who hasn't completed this consent step independently of video consent.

#### [NEW] `audio-detection.service.ts`
Structured like the existing detector services (`face-detection.service.ts`, `pose-detection.service.ts`, `object-detection.service.ts`):
- Runs a lightweight client-side voice-activity-detection (VAD) model on the microphone track.
- Applies a heuristic for sustained/overlapping speech as a proxy for a possible second speaker (per Open Question 1 — not full diarization at this stage).
- Emits `SPEECH_DETECTED` / `SECOND_VOICE_SUSPECTED` events into the existing `DetectionEngineService`, with their own per-event cooldowns following the existing pattern (30s for phone, 15s for face-missing — set comparable cooldowns here to avoid flag spam).

#### [MODIFY] `proctoring.module.ts`
Subscribe the new audio events to the same pipeline used by vision events (lines 67–79 area) so clip capture, upload, and — post-Phase-2 — `IntegrityFlag`/`EvidenceClip` creation all fire identically for audio and video detections.

#### Explicitly deferred, documented in code
True speaker diarization is out of scope for this pass. Flag it clearly in code comments as a deliberate MVP simplification (same convention already used elsewhere in this codebase for deferred scope, e.g. the CV-mode binary/adaptive distinction), not a bug for someone to "fix" later without context.

---

### Phase 6 — Identity Re-check Against Baseline Selfie (Day 7–9)

#### [NEW] Face-embedding/similarity spike, then implementation
- Evaluate embedding approach per Open Question 2 before committing code.
- Periodically capture a frame during the session (matching the flow's existing "periodic silent identity re-check" behavior), compute an embedding, compare against the baseline selfie's embedding via cosine similarity.
- Emit `IDENTITY_MISMATCH` through the existing `DetectionEngineService` pipeline when similarity drops below the chosen threshold — same pattern as every other detector, no new plumbing.

---

## File Summary

| Action | File | Phase |
|---|---|---|
| MODIFY ⚠️ *on hold — see Phase 1* | `session-api/port.ts` | 1 |
| MODIFY | `ConsentScreen.tsx` | 1 ⚠️ *on hold*, 5 |
| MODIFY | `proctoring.service.ts` | 2 |
| MODIFY | `results.$id.tsx` | 3 |
| NEW | Retention/deletion BullMQ job | 4 |
| MODIFY | `settings.service.ts` | 4 |
| MODIFY | camera/mic permission call site (`getUserMedia`) | 5 |
| NEW | `audio-detection.service.ts` | 5 |
| MODIFY | `proctoring.module.ts` | 5 |
| NEW | Face-embedding identity re-check module | 6 |

*`services/cv/real.ts` removed from this plan — owned solely by Track A item 3 (duplicate work).*

---

## Verification Plan

### Automated Tests
- Unit test `evaluateEvent()` to confirm webcam detection types now produce `IntegrityFlag` + `EvidenceClip` rows, not just `ProctoringEvent`.
- Unit test the retention job against seeded expired/non-expired `EvidenceClip` records — confirm only expired ones are deleted from both MinIO and Postgres.
- Unit test `audio-detection.service.ts` VAD/heuristic logic against sample audio fixtures (silence, single speaker, overlapping speech).

### Manual Verification
- Complete a full candidate session with selfie consent → confirm `Session.baselineSelfieRef` is populated (not `null`) and the object exists in MinIO's biometric bucket.
- Trigger a phone/headphone/book detection during a test session → confirm an `IntegrityFlag` row appears (not just `ProctoringEvent`), linked to a playable `EvidenceClip`.
- Open the flagged clip in the admin dashboard → confirm a real `<video>` element plays the actual 6-second clip via a signed URL, not the placeholder div.
- Manually set an `EvidenceClip.expires_at` into the past → confirm the retention job removes both the MinIO object and the DB row on its next run.
- Speak near the candidate mic with a second voice present during a test session → confirm a `SECOND_VOICE_SUSPECTED` flag and clip are produced, and that video+audio are both present in the resulting clip.
- Attempt to enable microphone capture without completing audio consent → confirm capture is blocked.

---

*This plan assumes Open Questions 1–5 get explicit answers before or during build — defaults are stated inline per item but should be confirmed, not silently adopted. Phase 1 is explicitly on hold pending Open Question 5; Phases 2–6 have no ownership overlap with Track A and can proceed independently.*
