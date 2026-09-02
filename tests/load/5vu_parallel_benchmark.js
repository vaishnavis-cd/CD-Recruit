import { group, check, sleep } from 'k6';
import http from 'k6/http';
import { Trend, Rate, Counter } from 'k6/metrics';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';

// --- CUSTOM TELEMETRY TRENDS & METRICS ---
export const S1_ApiAckLatency        = new Trend('s1_api_ack_latency_ms', true);
export const S3_SandboxRunTime       = new Trend('s3_sandbox_execution_duration_ms', true);
export const S6_CandidatePollLatency = new Trend('s6_candidate_poll_latency_ms', true);
export const S7_TotalE2ETurnaround   = new Trend('s7_e2e_turnaround_total_ms', true);
export const S7_E2ESuccessRate       = new Rate('s7_e2e_success_rate');
export const S7_ThroughputRuns       = new Counter('s7_completed_runs_total');

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001/api/v1';
const QUESTION_ID = __ENV.QUESTION_ID || '921dcfd2-be8f-4dd4-b1eb-39509bee8b8f';

const CANDIDATE_TOKENS = [
  'inv_11a20a8bb34b838dd54ce2f0',
  'inv_2f632d6ae6ede392cc56bbb8',
  'inv_07c1ececfa2550e4a4f23ebb',
  'inv_3a91f7ea447def764bed3e37',
  'inv_3fce2b6190aed218ecea118e',
];

const SOLUTION_CODE = `nums = list(map(int, input().split()))
target = int(input())
seen = {}
for i, num in enumerate(nums):
    comp = target - num
    if comp in seen:
        print(seen[comp], i)
        break
    seen[num] = i
else:
    print(-1)`;

export const options = {
  scenarios: {
    five_vu_parallel_benchmark: {
      executor: 'per-vu-iterations',
      vus: 5,
      iterations: 5, // 5 iterations per VU = 25 total runs
      maxDuration: '90s',
    },
  },
  thresholds: {
    'http_req_failed':              ['rate<0.01'],
    's1_api_ack_latency_ms':        ['p(95)<300'],
    's6_candidate_poll_latency_ms': ['p(95)<30'],
    's7_e2e_turnaround_total_ms':   ['p(95)<8000'],
    's7_e2e_success_rate':          ['rate==1.0'],
  },
};

// ── SETUP: Initialize 5 candidate sessions once on test start ────────────────
export function setup() {
  const sessions = [];

  for (let i = 0; i < CANDIDATE_TOKENS.length; i++) {
    const inviteToken = CANDIDATE_TOKENS[i];
    let sessionId = null;

    const startRes = http.post(
      `${BASE_URL}/sessions/start`,
      JSON.stringify({ inviteToken }),
      { headers: { 'Content-Type': 'application/json' } }
    );

    if (startRes.status === 200 || startRes.status === 201) {
      sessionId = startRes.json('sessionId');
    } else {
      const resumeRes = http.post(
        `${BASE_URL}/sessions/resume`,
        JSON.stringify({ inviteToken }),
        { headers: { 'Content-Type': 'application/json' } }
      );
      if (resumeRes.status === 200) {
        sessionId = resumeRes.json('sessionId');
      }
    }

    if (sessionId) {
      http.post(
        `${BASE_URL}/sessions/${sessionId}/begin`,
        JSON.stringify({}),
        { headers: { 'Content-Type': 'application/json' } }
      );
      sessions.push(sessionId);
    }
  }

  console.log(`[setup] Initialized ${sessions.length} sessions for 5 VUs`);
  return { sessions };
}

// ── DEFAULT: 5 VUs execute 5 iterations in parallel ─────────────────────────
export default function (data) {
  const vuIndex = (__VU - 1) % data.sessions.length;
  const sessionId = data.sessions[vuIndex];

  // 1. Trigger Code Run
  const t_start = Date.now();
  const runRes = http.post(
    `${BASE_URL}/coding/run`,
    JSON.stringify({
      sessionId,
      questionId: QUESTION_ID,
      language: 'python',
      sourceCode: SOLUTION_CODE,
    }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { stage: 'coding_run' },
    }
  );

  const ackDuration = Date.now() - t_start;
  S1_ApiAckLatency.add(ackDuration);

  const ok = check(runRes, {
    'Run status is 200': (r) => r.status === 200,
    'Run ACK status is PENDING': (r) => r.json('status') === 'PENDING',
  });

  const executionId = runRes.json('executionId');
  if (!ok || !executionId) {
    S7_E2ESuccessRate.add(false);
    return;
  }

  // 2. Poll Execution Status
  let isCompleted = false;
  let attempts = 0;

  while (attempts < 30 && !isCompleted) {
    attempts++;
    sleep(0.4); // Poll every 400ms

    const t_poll = Date.now();
    const pollRes = http.get(`${BASE_URL}/coding/execution/${executionId}`, {
      tags: { stage: 'coding_poll' },
    });
    const pollDuration = Date.now() - t_poll;
    S6_CandidatePollLatency.add(pollDuration);

    if (pollRes.status === 200) {
      const body = pollRes.json();
      if (body.status === 'COMPLETED' || body.status === 'FAILED' || body.status === 'WRONG_ANSWER') {
        isCompleted = true;
        const e2eTotal = Date.now() - t_start;
        S7_TotalE2ETurnaround.add(e2eTotal);
        S7_E2ESuccessRate.add(body.status === 'COMPLETED');
        S7_ThroughputRuns.add(1);

        if (body.executionTime) {
          const raw = Number(body.executionTime);
          const ms = raw < 20 && raw > 0 ? Math.round(raw * 1000) : Math.round(raw);
          S3_SandboxRunTime.add(ms);
        }
        break;
      }
    }
  }

  if (!isCompleted) {
    S7_E2ESuccessRate.add(false);
  }

  sleep(0.5);
}

export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
    'tests/load/5vu_summary.json': JSON.stringify(data, null, 2),
  };
}
