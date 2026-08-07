// lib/config.js
// Every value here is overridable via `k6 run --env KEY=value` or a .env
// loaded through `-e` flags / your CI. Nothing is hardcoded to example.com.

export const config = {
  // ---- Targets ----
  apiBaseUrl: __ENV.API_BASE_URL || 'http://localhost:3001/api/v1',
  candidateWebUrl: __ENV.CANDIDATE_WEB_URL || 'http://localhost:3000',

  // ---- Judge0 behavior ----
  // 'sync'  -> POST /coding/run returns the final result in one call
  // 'async' -> POST returns a token, then we poll a result endpoint.
  judge0Mode: __ENV.JUDGE0_MODE || 'async',
  judge0PollIntervalSec: Number(__ENV.JUDGE0_POLL_INTERVAL_SEC || 1),
  judge0MaxPollAttempts: Number(__ENV.JUDGE0_MAX_POLL_ATTEMPTS || 30),

  // ---- Realism knobs ----
  // Heartbeat cadence must stay under HEARTBEAT_STALE_THRESHOLD_SECONDS/2
  // per docs/DECISIONS.md Decision 7 (45s threshold -> 15s heartbeats).
  heartbeatIntervalSec: Number(__ENV.HEARTBEAT_INTERVAL_SEC || 15),

  // "Thinking time" per module, in seconds - min/max, randomized per VU.
  // Reduced for smoke test (use longer times for load/stress tests)
  thinkTime: {
    mcq: [2, 5],
    sql: [5, 15],
    coding: [10, 30],
    aiPrompting: [5, 15],
    simulation: [5, 15],
  },

  // ---- AI-grading / KYC stub toggle ----
  usingStubbedGrading: (__ENV.USING_STUBBED_GRADING || 'true') === 'true',

  // ---- Routes (based on NestJS controllers in CD-Recruit) ----
  routes: {
    startSession: () => `/sessions/start`,
    heartbeat: (sessionId) => `/sessions/${sessionId}/heartbeat`,
    closeSession: (sessionId) => `/sessions/${sessionId}/close`,
    mcqSubmit: () => `/mcq/submit`,
    sqlSubmit: () => `/sql/submit`,
    codingRun: () => `/coding/run`,
    codingExecution: (id) => `/coding/execution/${id}`,
    aiPromptingSubmit: () => `/ai-prompting/submit`,
    simulationSubmit: (sessionId) => `/sessions/${sessionId}/simulation/submit`,
    evidenceUpload: (sessionId) => `/proctoring/session/${sessionId}/upload-evidence`,
    selfieUpload: (sessionId) => `/sessions/${sessionId}/selfie`,
    consent: (sessionId) => `/sessions/${sessionId}/consent`,
  },
};
