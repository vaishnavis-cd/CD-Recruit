# CD-Recruit — API Contract (v0, Phase 0)

Covers the full candidate session lifecycle for the two in-scope modules: **Coding/DSA** and **Contextual Simulation**. This is what Dev A (frontend) and Dev B (backend) both build against — it's the interface, not the implementation. Treat any change to this file as something both devs agree on together, not something either side changes unilaterally.

Base path: `/api/v1`
Auth: Bearer token (Keycloak-issued JWT) on every endpoint except `POST /sessions` (candidate entry via invite link token, not a full login)

---

## 1. Start a session

`POST /sessions`

Candidate follows their invite link, which encodes an invite token. This creates the session and returns the first question.

**Request**
```json
{
  "inviteToken": "string"
}
```

**Response `201`**
```json
{
  "sessionId": "uuid",
  "candidateId": "uuid",
  "roleTemplate": "Software Developer",
  "cvMode": "FULL | REDUCED",
  "status": "IN_PROGRESS",
  "startedAt": "ISO8601"
}
```

**Why it's shaped this way:** `cvMode` is decided server-side (based on the pre-flight hardware check result the client reports just before this call, or as part of it — see note below) so the client doesn't get to self-report capability without the server logging what it actually offered. If the pre-flight check needs to happen as its own step, add `POST /sessions/:id/preflight` before this — flag if you find you need that during Phase 1.

---

## 2. Get the current question

`GET /sessions/:sessionId/question`

Returns whichever question the session is currently on — server tracks progression, not the client. This keeps a refresh or reconnect from letting a candidate re-pick a question.

**Response `200`**
```json
{
  "questionId": "uuid",
  "moduleType": "CODING | SIMULATION",
  "content": {
    "// CODING shape": "",
    "prompt": "string",
    "starterCode": "string",
    "language": "string",
    "testCasesVisible": [ { "input": "string", "expectedOutput": "string" } ]
  }
}
```

For `SIMULATION`, `content` instead carries the scenario script (initial Email/Slack/Ticket event payload) — same envelope, different inner shape. Document the SIMULATION content shape once Phase 3 design is locked; don't guess it now.

---

## 3. Submit a module response

`POST /sessions/:sessionId/submit`

**Request (CODING)**
```json
{
  "questionId": "uuid",
  "responsePayload": {
    "code": "string",
    "language": "string"
  },
  "timeSpentSeconds": 0
}
```

**Request (SIMULATION)**
```json
{
  "questionId": "uuid",
  "responsePayload": {
    "actionLog": [ { "type": "string", "payload": {}, "timestamp": "ISO8601" } ]
  },
  "timeSpentSeconds": 0
}
```

**Response `200`**
```json
{
  "moduleResponseId": "uuid",
  "executionResult": {
    "status": "PASS | FAIL | ERROR",
    "stdout": "string",
    "stderr": "string"
  },
  "nextQuestionId": "uuid | null"
}
```

`executionResult` is only populated for CODING (comes from the Judge0/Piston call). For SIMULATION it's `null` — simulation responses are graded asynchronously by the Correlation Engine, not synchronously on submit. `nextQuestionId` is `null` when the module — and the session — is complete, telling the client to move to session close.

---

## 4. Log a behavioral/integrity event

`POST /sessions/:sessionId/events`

Fire-and-forget from the client — paste, tab-switch, gaze/phone detection results (detection result only, never raw frames, per your architecture doc's edge-security note).

**Request**
```json
{
  "eventType": "string",
  "payload": {},
  "occurredAt": "ISO8601"
}
```

**Response `202`** — empty body. Client shouldn't block UI on this.

---

## 5. Close the session

`POST /sessions/:sessionId/close`

Called once `nextQuestionId` is `null` after the final submit.

**Response `200`**
```json
{
  "sessionId": "uuid",
  "status": "SUBMITTED",
  "submittedAt": "ISO8601"
}
```

This is what queues the async grading job (BullMQ) server-side — client doesn't call grading directly.

---

## 6. Admin: list sessions

`GET /admin/sessions?status=&roleTemplate=`

**Response `200`**
```json
{
  "sessions": [
    {
      "sessionId": "uuid",
      "candidateName": "string",
      "roleTemplate": "string",
      "status": "string",
      "compositeScore": 0.0,
      "sayDoConsistencyScore": 0.0,
      "humanReviewRequired": true
    }
  ]
}
```

---

## 7. Admin: session detail

`GET /admin/sessions/:sessionId`

**Response `200`**
```json
{
  "sessionId": "uuid",
  "candidate": { "name": "string", "email": "string" },
  "moduleResponses": [ { "moduleType": "string", "responsePayload": {}, "executionResult": {} } ],
  "integrityFlags": [ { "category": "string", "severity": "string", "confidence": 0.0, "evidenceClipUrl": "string | null" } ],
  "score": {
    "compositeScore": 0.0,
    "moduleScores": {},
    "sayDoConsistencyScore": 0.0,
    "aiConfidence": 0.0
  }
}
```

`evidenceClipUrl` is a signed, short-TTL MinIO URL — generated fresh on this request, never stored as a permanent link, per the architecture doc's reviewer-access note.

---

## 8. Admin: record a decision

`POST /admin/sessions/:sessionId/decision`

**Request**
```json
{
  "decision": "ADVANCE | REJECT"
}
```

**Response `200`**
```json
{
  "sessionId": "uuid",
  "decision": "string",
  "decidedAt": "ISO8601"
}
```

`reviewerId` is taken from the authenticated JWT server-side, never sent by the client.

---

## Notes for both devs

- Every request/response shape here maps directly to a Prisma model field (see `schema.prisma`) — if you need a field that isn't in the schema, add it to the schema first, then update this file, don't invent a shape that outruns the data model.
- `responsePayload` and `content` are intentionally `Json` — module-specific shape lives inside them so we don't need a schema migration every time question content changes.
- This is v0. Once Phase 1 (Coding module vertical slice) is actually built, expect 1-2 rounds of contract adjustment — normal, not a failure of this design. Update this file when it happens; don't let code and contract drift apart.
