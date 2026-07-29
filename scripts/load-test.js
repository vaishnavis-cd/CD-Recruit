import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '15s', target: 10 },
    { duration: '30s', target: 50 },
    { duration: '30s', target: 100 },
    { duration: '15s', target: 0 },
  ],
};

function tokenForVU() {
  return `load-test-token-${__VU}`;
}

export default function () {
  // 1. Redeem invite token -> create session
  const startRes = http.post(
    'http://localhost:3001/api/v1/sessions/start',
    JSON.stringify({ inviteToken: tokenForVU() }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  
  check(startRes, {
    'session start returns 201/200': (r) => r.status === 201 || r.status === 200,
    'session start contains sessionId': (r) => r.json('sessionId') !== undefined,
  });

  const sessionId = startRes.json('sessionId');

  if (sessionId) {
    // 2. Begin session -> NOT_STARTED to IN_PROGRESS
    const beginRes = http.post(
      `http://localhost:3001/api/v1/sessions/${sessionId}/begin`,
      null,
      { headers: { 'Content-Type': 'application/json' } }
    );
    check(beginRes, { 'session begun successfully': (r) => r.status === 200 });

    // 3. Submit code execution
    const runRes = http.post(
      'http://localhost:3001/api/v1/coding/run',
      JSON.stringify({
        sessionId,
        questionId: '00000000-0000-4000-8000-000000000001',
        language: 'javascript',
        sourceCode: "const fs = require('fs');\nconst input = fs.readFileSync(0, 'utf-8').trim();\nconst parts = input.split(',');\nconsole.log(parseInt(parts[0]) + parseInt(parts[1]));",
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );

    check(runRes, {
      'run returns 200/201': (r) => r.status === 200 || r.status === 201,
      'run returns executionId': (r) => r.json('executionId') !== undefined,
    });
  }
  
  sleep(1);
}
