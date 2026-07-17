# Candidate Web Integration Status Report

This document reports on the status of candidate-web's port adapters integration with the NestJS API backend. It provides the capability matrix, current configuration modes, and outstanding backend development needed to unlock ports currently running in mock mode.

## 1. Capability Matrix

| Port / Capability | Mode | Route / Details | Notes |
| :--- | :--- | :--- | :--- |
| **a. Invite Resolution** | `mock` | `None` | Backend has no public endpoint to decrypt/decode invite tokens without creating/redeeming a session. |
| **b. Session Creation** | `real` | `POST /sessions/start`<br>`POST /sessions/:sessionId/begin` | Supported. Sequentially starts and begins the session to retrieve the start state. |
| **c. Server Time Sync** | `real` | `GET /health` | Fetches backend system time to calibrate candidate's local clock offset. |
| **d. Heartbeat / Ping** | `real` | `POST /sessions/:sessionId/heartbeat` | Kept real as session ID is real. |
| **e. Disconnect / Grace Status** | `real` | Implicit via Heartbeat response | Monitors candidate state transitions from backend. |
| **f. Module Response Autosave / Submit** | `real` (partial) | `POST /sql/submit`<br>`POST /coding/submit` | Fully operational for **SQL** and **Coding** questions. **MCQ** and **AI Prompting** are mocked (no-op) since the backend doesn't support them. |
| **g. Event Log Sync** | `mock` | `None` | Keystroke and event sync are mocked as no backend endpoint exists. |
| **h. Final Submission** | `real` | `POST /sessions/:sessionId/close` | Marks the session as completed and closed on the backend. |
| **i. Sandbox Code Execution** | `real` | `POST /coding/run`<br>`POST /coding/submit` | Connects directly to backend's Judge0 execution engine. |
| **j. Scenario Engine** | `mock` | `None` | Inbox/ticket simulation WebSocket gateway does not exist in the backend. |
| **k. Integrity Signal Reporting** | `mock` | `None` | Tab switch and webcam proctoring signals are mocked. |
| **l. Question Retrieval** | `mock` (N/A) | `GET /sessions/:id/questions/:qId` | Backend has a routed endpoint, but the candidate UI uses static fixtures (`fixtures/questions.ts`) directly. |

---

## 2. Configuration Env Flags

The ports can be configured independently in `.env` or `.env.local` inside the workspace root:

```ini
# Choose 'real' or 'mock' for each port adapter (default is 'mock')
VITE_SESSION_API_MODE=real
VITE_TIME_MODE=real
VITE_EXECUTION_MODE=real
VITE_SCENARIO_MODE=mock
VITE_CV_MODE=mock
```

- When `VITE_TIME_MODE=real`, the developer panel's simulated time-travel and fast-forward controls are disabled and display a warning explaining the real-time mode lock.

---

## 3. Outstanding Backend Needs to Unlock Remaining Ports

To transition the remaining mock ports to real, the backend must implement the following:
1. **Invite Resolution Endpoint**:
   Provide a GET route (e.g. `GET /api/v1/invites/resolve?token=...`) that parses the token without altering the database state, so the lobby and waiting-room pages can retrieve candidate scheduling details.
2. **MCQ & AI Prompting Submit Routes**:
   Extend `ModuleResponse` controllers to handle MCQ selection updates and AI Prompting text drafts.
3. **Event Log & integrity Reporting Route**:
   Build an endpoint (e.g., `POST /api/v1/sessions/:sessionId/events/sync`) that records keystroke history, window blur, paste-anomalies, and proctoring logs.
4. **WebSocket/Scenario Gateway**:
   Implement a WebSocket gateway for the Inbox chat ticketing system (Module 5) to push incoming mock tickets and receive candidate replies in real-time.
