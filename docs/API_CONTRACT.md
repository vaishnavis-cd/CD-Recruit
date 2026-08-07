# CD-Recruit API Contract v1

> **Base URL:** `http://localhost:3001/api/v1`  
> **Auth:** All candidate endpoints require a Bearer JWT (Keycloak-issued or invite-token-derived).  
> All admin endpoints require a Bearer JWT with `recruiter` or `admin` role.  
> **Content-Type:** `application/json` on all request bodies.

---

## Table of Contents

1. [Session Lifecycle](#1-session-lifecycle)
2. [Free Navigation — Questions](#2-free-navigation--questions)
3. [Response Submission](#3-response-submission)
4. [Proctoring Events](#4-proctoring-events)
5. [Admin](#5-admin)
6. [Judge0 Code Execution](#6-judge0-code-execution-coding-only)

---

## 1. Session Lifecycle

### 1.0 Candidate DPDP Consent (`POST /sessions/:sessionId/consent`)
Wired via `CandidateController` ([candidate.module.ts:5](file:///d:/Projects/cd-recruit/codebase/backend/api/src/candidate/candidate.module.ts#L5)). Persists DPDP Act §6 legal consent records (`TERMS`, `BIOMETRIC`, `SELFIE`, `AUDIO`) with IP address audit logging.

**Request Body:**
```json
{
  "consentType": "BIOMETRIC",
  "version": "1.0"
}
```

### 1.1 Start Session

```
POST /sessions/start
```

> **Note on Progress Endpoint (`GET /sessions/:id/progress`):** Returns `501 Not Implemented` ([session.controller.ts:154](file:///d:/Projects/cd-recruit/codebase/backend/api/src/session/session.controller.ts#L154)). Candidate progress is tracked client-side via Zustand `sessionMachine`.

Validates the invite token, creates a Session (NOT_STARTED → IN_PROGRESS), sets `startedAt = now()`, and `deadlineAt = startedAt + roleTemplate.durationMinutes`.

**Request**

```json
{ "inviteToken": "eyJhbGciOiJ..." }
```

**Response 201**

```json
{
  "sessionId": "uuid",
  "candidateId": "uuid",
  "roleTemplateId": "uuid",
  "roleTemplateName": "Software Developer",
  "durationMinutes": 90,
  "cvMode": "FULL",
  "status": "IN_PROGRESS",
  "startedAt": "2026-07-14T10:00:00Z",
  "deadlineAt": "2026-07-14T11:30:00Z",
  "disconnectCount": 0,
  "questions": [
    { "questionId": "uuid", "moduleType": "MCQ", "moduleIndex": 0 },
    { "questionId": "uuid", "moduleType": "MCQ", "moduleIndex": 1 }
  ]
}
```

**Errors**

| Status | Code                     | Reason                                       |
| ------ | ------------------------ | -------------------------------------------- |
| 400    | `INVITE_TOKEN_MISSING`   | Body missing inviteToken                     |
| 401    | `INVITE_TOKEN_INVALID`   | Token malformed or signature invalid         |
| 410    | `INVITE_TOKEN_EXPIRED`   | Token past TTL (default 48 h)                |
| 409    | `SESSION_ALREADY_ACTIVE` | Candidate already has an IN_PROGRESS session |

---

### 1.2 Resume Session

```
POST /sessions/:sessionId/resume
```

Resumes a DISCONNECTED session. Allowed only when:

- `Session.status === DISCONNECTED`
- `Session.disconnectCount < 3` (i.e., fewer than 3 disconnects have occurred)
- The reconnect window is still open (within 5 minutes of `disconnectedAt`)

On success: sets `status = IN_PROGRESS`, records `RECONNECTED` EventLog entry.  
On window expired or 3rd disconnect: session has already been AUTO_SUBMITTED by the backend scheduler; this endpoint returns 409.

**Request**

```json
{ "sessionId": "uuid", "tabId": "browser-tab-uuid" }
```

**Response 200**

```json
{
  "sessionId": "uuid",
  "status": "IN_PROGRESS",
  "deadlineAt": "2026-07-14T11:30:00Z",
  "disconnectCount": 1,
  "reconnectedAt": "2026-07-14T10:07:00Z",
  "questions": [{ "questionId": "uuid", "moduleType": "MCQ", "moduleIndex": 0 }]
}
```

**Errors**

| Status | Code                       | Reason                                                                 |
| ------ | -------------------------- | ---------------------------------------------------------------------- |
| 404    | `SESSION_NOT_FOUND`        | sessionId unknown or not owned by caller                               |
| 409    | `SESSION_NOT_DISCONNECTED` | Session is not in DISCONNECTED state                                   |
| 410    | `RESUME_WINDOW_EXPIRED`    | 5-minute reconnect grace period has lapsed; session was AUTO_SUBMITTED |
| 410    | `MAX_DISCONNECTS_REACHED`  | disconnectCount has reached 3; session is AUTO_SUBMITTED               |

---

### 1.3 Heartbeat

```
POST /sessions/:sessionId/heartbeat
```

Must be sent every **15–30 seconds** by the active candidate tab. Backend updates `Session.lastHeartbeatAt`. If no heartbeat for **45–90 seconds** (2–3 missed cycles), backend transitions the session to DISCONNECTED and increments `disconnectCount`.

`tabId` is used to enforce single-active-session: a heartbeat from a second tab while another is active returns 409 `SECOND_TAB_DETECTED` (frontend should surface a blocking modal).

**Request**

```json
{ "sessionId": "uuid", "tabId": "browser-tab-uuid" }
```

**Response 200**

```json
{
  "ok": true,
  "sessionStatus": "IN_PROGRESS",
  "deadlineAt": "2026-07-14T11:30:00Z"
}
```

Client **must** check `sessionStatus` on every heartbeat response — the backend may return `AUTO_SUBMITTED` or `CLOSED` to indicate the session has ended out-of-band (deadline reached, admin forced close).

**Errors**

| Status | Code                      | Reason                                                |
| ------ | ------------------------- | ----------------------------------------------------- |
| 409    | `SECOND_TAB_DETECTED`     | A different tabId is already registered as active     |
| 404    | `SESSION_NOT_FOUND`       | sessionId not found or wrong candidate                |
| 422    | `SESSION_NOT_IN_PROGRESS` | Session is not IN_PROGRESS (already submitted/closed) |

---

### 1.4 Get Session Progress

```
GET /sessions/:sessionId/progress
```

Returns the candidate's current progress across all modules and questions. Used by the free-navigation sidebar to colour-code answered/draft/untouched questions.

**Response 200**

```json
{
  "sessionId": "uuid",
  "items": [
    {
      "questionId": "uuid",
      "moduleType": "CODING",
      "moduleIndex": 0,
      "status": "draft",
      "lastAutosavedAt": "2026-07-14T10:15:00Z"
    },
    {
      "questionId": "uuid",
      "moduleType": "MCQ",
      "moduleIndex": 0,
      "status": "submitted",
      "lastAutosavedAt": null
    },
    {
      "questionId": "uuid",
      "moduleType": "SQL",
      "moduleIndex": 1,
      "status": "untouched",
      "lastAutosavedAt": null
    }
  ],
  "answeredCount": 2,
  "totalCount": 10
}
```

---

### 1.5 Close Session (Manual Submit)

```
POST /sessions/:sessionId/close
```

Candidate explicitly submits the session. Transitions: IN_PROGRESS → SUBMITTED. Sets `submittedAt = now()`. All draft ModuleResponses are treated as final.

**Response 200**

```json
{
  "sessionId": "uuid",
  "status": "SUBMITTED",
  "submittedAt": "2026-07-14T11:25:00Z"
}
```

**Errors**

| Status | Code                      | Reason                                                  |
| ------ | ------------------------- | ------------------------------------------------------- |
| 422    | `SESSION_NOT_SUBMITTABLE` | Session already submitted, auto-submitted, or abandoned |

---

## 2. Free Navigation — Questions

> **Design Decision:** Candidates can jump freely between ALL modules and ALL questions.  
> There is no forced ordering or module locking. `moduleIndex` is a stable 0-based position within a module type used for navigation display — it does NOT enforce traversal order.

### 2.1 Get Question by ID

```
GET /sessions/:sessionId/questions/:questionId
```

Returns the full content for the specified question. The client maps question IDs from the `questions[]` array returned by session start/resume.

**Response 200**

```json
{
  "questionId": "uuid",
  "roleTemplateId": "uuid",
  "content": {
    "moduleType": "CODING",
    "prompt": "Given an array of integers nums...",
    "starterCode": {
      "python": "def solve(nums):\n    pass",
      "javascript": "function solve(nums) {}"
    },
    "testCases": [
      {
        "input": "[2,7,11,15], 9",
        "expectedOutput": "[0,1]",
        "label": "Example 1"
      }
    ],
    "constraints": ["2 ≤ nums.length ≤ 10^4"],
    "difficulty": "easy"
  }
}
```

The `content` object shape varies by `moduleType`:

| moduleType     | Key fields (client-facing)                                                 |
| -------------- | -------------------------------------------------------------------------- |
| `MCQ`          | `prompt`, `options[]`                                                      |
| `SQL`          | `prompt`, `schema`, `seedData`                                             |
| `CODING`       | `prompt`, `starterCode{}`, `testCases[]`, `constraints[]`, `difficulty`    |
| `AI_PROMPTING` | `prompt`, `context?`, `rubric{evaluationCriteria[], idealResponseSummary}` |
| `SIMULATION`   | `title`, `description`, `triggers[]`, `rubric[]`                           |

**Server-only fields never included in this response:** `correctIndex` (MCQ), `expectedQuery` (SQL), `hiddenTests` (CODING).

**Errors**

| Status | Code                 | Reason                         |
| ------ | -------------------- | ------------------------------ |
| 404    | `QUESTION_NOT_FOUND` | questionId not in this session |
| 403    | `SESSION_CLOSED`     | Session is not IN_PROGRESS     |

---

## 3. Response Submission

### 3.1 Save Draft (Autosave)

```
POST /sessions/:sessionId/responses/draft
```

Creates or updates a `ModuleResponse` with `isDraft = true` and `lastAutosavedAt = now()`.  
**Trigger:** debounced every 10–15 s while typing + immediately on blur.

**Request**

```json
{
  "sessionId": "uuid",
  "questionId": "uuid",
  "responsePayload": {
    "moduleType": "CODING",
    "code": "def two_sum(nums, target):\n    ...",
    "language": "python"
  },
  "timeSpentSeconds": 120
}
```

**Response 200**

```json
{
  "moduleResponseId": "uuid",
  "isDraft": true,
  "lastAutosavedAt": "2026-07-14T10:12:34Z"
}
```

**Errors**

| Status | Code                      | Reason                                  |
| ------ | ------------------------- | --------------------------------------- |
| 404    | `QUESTION_NOT_IN_SESSION` | questionId not assigned to this session |
| 422    | `SESSION_NOT_IN_PROGRESS` | Session already closed                  |

---

### 3.2 Submit Response (Final)

```
POST /sessions/:sessionId/responses/submit
```

Marks a `ModuleResponse` as final (`isDraft = false`).  
For **CODING** submissions: triggers Judge0 execution (see Section 6).  
For all other module types: `executionResult` is always `null`.

**Request** — same shape as SaveDraftRequest.

**Response 200**

```json
{
  "moduleResponseId": "uuid",
  "isDraft": false,
  "executionResult": {
    "executionStatus": "PASS",
    "stdout": "",
    "stderr": "",
    "allVisiblePassed": true
  }
}
```

For CODING when Judge0 times out (PENDING fallback):

```json
{
  "moduleResponseId": "uuid",
  "isDraft": false,
  "executionResult": {
    "executionStatus": "PENDING",
    "stdout": "",
    "stderr": "",
    "allVisiblePassed": false
  }
}
```

---

## 4. Proctoring Events

```
POST /sessions/:sessionId/events
```

Fire-and-forget event log. Client sends and moves on — no meaningful response body.  
Backend persists to `EventLog` table.

**Request**

```json
{
  "eventType": "TAB_SWITCH",
  "payload": { "targetUrl": "https://stackoverflow.com" },
  "occurredAt": "2026-07-14T10:14:00Z"
}
```

Valid `eventType` values:

- **Proctoring:** `PASTE`, `TAB_SWITCH`, `GAZE_DEVIATION`, `FACE_NOT_VISIBLE`, `MULTIPLE_FACES`
- **Session integrity:** `HEARTBEAT_MISSED`, `DISCONNECTED`, `RECONNECTED`, `GRACE_WINDOW_EXPIRED`, `AUTO_SUBMITTED`, `SECOND_TAB_DETECTED`, `DEADLINE_REACHED`

**Response 204** — no body.

---

## 5. Admin

All admin endpoints require a JWT with `recruiter` or `admin` Keycloak role.

### 5.1 List Sessions

```
GET /admin/sessions?page=1&pageSize=20&status=SUBMITTED&roleTemplateId=uuid
```

**Query params:** `page` (default 1), `pageSize` (default 20, max 100), `status` (optional filter), `roleTemplateId` (optional filter).

**Response 200**

```json
{
  "items": [
    {
      "sessionId": "uuid",
      "candidateName": "Alice Smith",
      "candidateEmail": "alice@example.com",
      "roleTemplateName": "Software Developer",
      "status": "SUBMITTED",
      "startedAt": "2026-07-14T10:00:00Z",
      "submittedAt": "2026-07-14T11:20:00Z",
      "deadlineAt": "2026-07-14T11:30:00Z",
      "disconnectCount": 0,
      "compositeScore": 0.78,
      "sayDoConsistencyScore": 0.65,
      "humanReviewRequired": true
    }
  ],
  "total": 42,
  "page": 1,
  "pageSize": 20
}
```

---

### 5.2 Get Session Detail

```
GET /admin/sessions/:sessionId
```

**Response 200** — full session detail including typed module responses, integrity flags, and score.

```json
{
  "sessionId": "uuid",
  "candidate": {
    "id": "uuid",
    "name": "Alice Smith",
    "email": "alice@example.com"
  },
  "roleTemplateName": "Software Developer",
  "status": "SUBMITTED",
  "cvMode": "FULL",
  "startedAt": "2026-07-14T10:00:00Z",
  "submittedAt": "2026-07-14T11:20:00Z",
  "deadlineAt": "2026-07-14T11:30:00Z",
  "disconnectCount": 0,
  "moduleResponses": [
    {
      "moduleResponseId": "uuid",
      "questionId": "uuid",
      "moduleType": "CODING",
      "responsePayload": {
        "moduleType": "CODING",
        "code": "def solve()...",
        "language": "python"
      },
      "timeSpentSeconds": 840,
      "isDraft": false,
      "lastAutosavedAt": "2026-07-14T11:18:00Z"
    }
  ],
  "integrityFlags": [
    {
      "flagId": "uuid",
      "category": "GAZE_DEVIATION",
      "severity": "MEDIUM",
      "confidence": 0.82,
      "flaggedAt": "2026-07-14T10:30:00Z",
      "evidenceClipUrl": "https://minio.../clips/uuid.webm?token=..."
    }
  ],
  "score": {
    "compositeScore": 0.78,
    "moduleScores": { "MCQ": 0.85, "CODING": 0.72 },
    "sayDoConsistencyScore": 0.65,
    "aiConfidence": 0.91,
    "humanReviewed": false
  }
}
```

---

### 5.3 Record Reviewer Decision

```
POST /admin/sessions/:sessionId/decision
```

Records the human reviewer's ADVANCE/REJECT decision.

**Request**

```json
{ "decision": "ADVANCE" }
```

**Response 201**

```json
{
  "sessionId": "uuid",
  "decision": "ADVANCE",
  "decidedAt": "2026-07-14T14:00:00Z"
}
```

**Errors**

| Status | Code                        | Reason                                               |
| ------ | --------------------------- | ---------------------------------------------------- |
| 409    | `DECISION_ALREADY_RECORDED` | A decision already exists for this session           |
| 422    | `SESSION_NOT_REVIEWABLE`    | Session not yet scored (status not SUBMITTED/CLOSED) |

---

## 6. Judge0 Code Execution (CODING only)

**Decision: Synchronous-with-timeout-then-poll fallback.**

```
Background: CD-Recruit uses the hosted Judge0 CE API (judge0-ce.p.rapidapi.com)
NOT a self-hosted instance. Self-hosted Judge0 is scoped to a later upgrade trigger.
```

**Flow:**

1. `POST /sessions/:id/responses/submit` (CODING) → backend calls Judge0 synchronously.
2. Backend waits up to **8 seconds** for Judge0 to return a result.
3. **If result arrives ≤ 8 s:** Response includes fully-populated `executionResult`.
4. **If Judge0 times out:** Response includes `executionResult.executionStatus = "PENDING"`. Client must poll:

### 6.1 Poll Execution Status

```
GET /sessions/:sessionId/responses/:moduleResponseId/execution
```

Returns the current execution result. Client polls every **3 seconds** until `executionStatus !== "PENDING"`.

**Response 200**

```json
{
  "moduleResponseId": "uuid",
  "executionResult": {
    "executionStatus": "PASS",
    "stdout": "6\n",
    "stderr": "",
    "allVisiblePassed": true
  }
}
```

> **Note on hidden tests:** `allVisiblePassed` reflects only the public test cases shown to the candidate. The Correlation Engine (Phase 10) runs hidden tests post-submission for final scoring and does not surface individual hidden test results to the candidate.
