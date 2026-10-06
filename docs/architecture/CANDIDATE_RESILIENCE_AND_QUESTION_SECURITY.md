# CD-Recruit — Candidate Session Resilience, Fault-Tolerance & Question Security

This document specifies the resilience mechanisms, failover lifecycles, clock-drift protections, and anti-cheat question sanitization safeguards implemented across the CD-Recruit assessment platform.

---

## 1. Candidate Fault-Tolerance & Session Lifecycles

During high-stakes online recruitment drives, candidates inevitably face hardware shutdowns, depleted laptop batteries, intermittent Wi-Fi drops, and accidental browser closures. The platform handles each failure through deterministic server-side state machines.

### 1.1 Disconnect Detection & Stale Threshold (45s)
* **Client Keepalive:** The candidate browser sends continuous heartbeat pings every 15 seconds to `POST /api/v1/sessions/:sessionId/heartbeat` with an ephemeral `tabId`.
* **Server Heartbeat Scanner:** In `backend/api/src/queue/heartbeat.service.ts`, BullMQ executes periodic scans (`scanAndMarkStale`). If a session in `IN_PROGRESS` state has not reported a heartbeat within `heartbeatStaleThresholdSeconds` (45s), the server transitions the session to `DISCONNECTED`, records `disconnectedAt = NOW()`, and increments `disconnectCount`.

### 1.2 The 5-Minute Grace Window & Reconnect Limit
* **Reconnection Endpoint:** `POST /api/v1/sessions/:sessionId/resume`
* **Grace Window (`graceWindowSeconds = 300`):** The candidate has exactly 300 seconds (5 minutes) from the moment the server marks them disconnected to power on their device, restore internet, and resume.
* **Maximum Disconnects (`maxDisconnectCount = 3`):** To prevent malicious intermittent disconnect exploitation, candidates are allowed a maximum of 3 disconnect cycles.
* **Auto-Submission Watchdog:** If `disconnectCount >= 3` or if the 300-second grace window expires without reconnection, `GraceWindowProcessor` locks the session and moves it to `AUTO_SUBMITTED`.

### 1.3 Same-Machine Recovery vs. Laptop Switching
* **Session Reuse:** When a candidate reopens their unique invite link on any device, `SessionService.startSession` queries existing records in PostgreSQL:
  ```typescript
  // session.service.ts
  const existingSession = await this.prisma.session.findFirst({
    where: {
      candidateId: candidateRecord.id,
      status: { in: [SessionStatus.NOT_STARTED, SessionStatus.IN_PROGRESS, SessionStatus.DISCONNECTED] },
    },
  });
  ```
  Instead of generating a duplicate test, the server reuses the in-progress session, preserving the existing schedule and responses.
* **Single Active Tab Protection:** The database stores `activeTabId`. If a candidate opens the assessment across multiple tabs or two laptops simultaneously, the second connection receives an HTTP `409 SECOND_TAB_DETECTED` error. When legitimately switching laptops, calling `/resume` safely updates `activeTabId` to the new device.

### 1.4 Autosave & Cross-Device Draft Recovery
* **Continuous Cloud Sync:** The candidate UI continuously syncs unsaved work via `POST /api/v1/sessions/:sessionId/drafts`. PostgreSQL persists `{ draftResponses, cursor: { moduleIndex, questionIndex }, sentinel }` in `session.simulationSnapshot`.
* **Offline Buffering:** `candidate-web/src/components/NetworkStatusBar.tsx` monitors `navigator.onLine`. If network connectivity drops locally, keystrokes and code edits are held in React memory and auto-flushed to the server immediately upon connection restoration.
* **Rehydration:** On page reload or laptop switch, `getDraftResponses` re-populates the candidate's exact code, selected options, and question cursor.

### 1.5 Timer Security & Server Authority
* **No Local Clock Reliance:** The candidate interface never uses client `Date.now()` to compute remaining time. In `candidate-web/src/services/time/real.ts`, the client calculates `serverTimeOffsetMs` by pinging `/api/v1/health` and adjusting for round-trip latency.
* **Hard Deadline Ceiling:** When a session begins (`POST /sessions/:sessionId/begin`), the server sets an immutable `deadlineAt = startedAt + durationMinutes`. Closing the browser does **not** pause the clock. When submitting, `closeSession` strictly rejects submissions where `now > deadlineAt` with `410 DEADLINE_PASSED`.

---

## 2. Question Delivery & Anti-Cheat Sanitization

### 2.1 Upfront Batch Loading vs. Per-Question Fetching
To deliver a smooth, zero-latency candidate experience, CD-Recruit loads all allocated questions in the initial `POST /begin` response.
* **Why Upfront Loading:** Fetching questions individually on every "Next" click adds 100–300ms network round-trips, requires loading spinners between questions, and risks failure if a minor network hiccup occurs while switching questions.
* **The Security Requirement:** Because all questions are loaded in the browser up front, the server must ensure that **no answers, hidden test cases, or evaluation rubrics** are included in the transit payload.

### 2.2 The Sanitization Engine (`sanitiseQuestionContent`)
Defined in `backend/api/src/session/session.service.ts`, `sanitiseQuestionContent` processes every question before it leaves the server across both `buildQuestionList` and `getQuestion`:

| Module Type | Stripped Fields (Never Sent to Client) | Retained Fields (Sent to Client) |
| :--- | :--- | :--- |
| **MCQ** | `correctIndex`, `answerIndex`, `correctAnswer`, `correctOption`, `explanation` | `prompt`, `options`, `difficulty`, `tags` |
| **SQL** | `expectedQuery`, `explanation` | `prompt`, `schema`, `seedData`, `difficulty` |
| **NOSQL** | `expectedOperation`, `expectedQuery`, `explanation` | `prompt`, `schema`, `seedData`, `difficulty` |
| **CODING** & **DEBUGGING** | `hiddenTestCases`, `hiddenTests`, `solution`, `referenceSolution`, `explanation`, and all test cases where `isHidden: true` | `prompt`, `starterCode`, `visibleTestCases`, `constraints` |
| **AI_PROMPTING** | `rubric`, `evaluationCriteria`, `idealResponseSummary`, `explanation` | `prompt`, `context`, `constraints` |
| **SIMULATION** | `rubric`, `hiddenTestCases`, `explanation` | `title`, `description`, `triggers` (tickets, emails) |
| **TEST_SCENARIOS** | `rubric`, `referenceCriteria`, `idealAnswer`, `modelAnswer`, `explanation` | `prompt`, `scenario`, `context` |

### 2.3 Verification Boundary
All answer evaluations occur strictly on the backend:
* **MCQ:** Checked by `SessionScoringService` during session submission using original database records.
* **Coding:** Tested by `Judge0Service` using full visible + hidden test suites.
* **SQL / NoSQL:** Executed in isolated PostgreSQL/MongoDB sandboxes and compared against backend expected states.
* **AI & Simulation:** Graded by `AiEvaluationService` using the LLM evaluation gateway.

---

## 3. The Role of Redis in Question Delivery & Performance

### 3.1 What Redis Currently Powers
1. **BullMQ Distributed Queues:** Manages `execution-inbound`, `execution-outbound`, `heartbeat-monitor`, and `grace-window` queues.
2. **Sub-millisecond Execution Read-Cache:** Pre-seeds `execution:${executionId}` so candidate polling returns in `<1ms`.
3. **Atomic Aggregation Lock:** Runs `JUDGE0_ACCUMULATE_AND_LOCK_LUA` in Redis to coordinate parallel Judge0 test callbacks.
4. **SSE Event Streaming:** Uses Redis Pub/Sub (`execution:events:${executionId}`) for real-time test result broadcasts.

### 3.2 Should Redis Cache Questions?
* **Current Upfront Architecture:** With `sanitiseQuestionContent` active in `buildQuestionList`, questions are sanitized and transmitted once at test start. Navigation between questions is handled entirely in browser memory with **0ms latency**.
* **Why Per-Question Redis Fetching is Avoided:** Introducing Redis queries on every question transition would add unnecessary network hops without improving security, since the questions are already sanitized.
* **Optional Future Scale Optimization (10,000+ Concurrent Candidates):**
  If thousands of candidates join a drive at the exact same second, Redis can cache the pre-sanitized question bank (`drive:${driveId}:questions:sanitized`), allowing `POST /begin` to read from Redis memory instead of running PostgreSQL joins.
