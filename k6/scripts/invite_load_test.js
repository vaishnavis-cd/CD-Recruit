// invite_load_test.js – minimal k6 script using a CSV of invite links
import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

// -------------------------------------------------------------------
// Load CSV with invite URLs (first column only). The file lives in k6/data.
// -------------------------------------------------------------------
const inviteRows = new SharedArray('invite rows', () => {
  const csv = open('../data/invites.csv');
  return csv
    .trim()
    .split('\n')
    .filter(line => line && !line.startsWith('#'))
    .map(line => line.split(',')[0].trim());
});

// -------------------------------------------------------------------
// Test configuration – 5 VUs, 40‑minute ramp as requested.
// -------------------------------------------------------------------
export const options = {
  stages: [
    { duration: '2m', target: 5 },   // ramp‑up
    { duration: '36m', target: 5 },  // steady state
    { duration: '2m', target: 0 },   // ramp‑down
  ],
  thresholds: {
    http_req_duration: ['p(95)<1500'], // 95% under 1.5 s
  },
};

// -------------------------------------------------------------------
// Helper – deterministic round‑robin mapping of VU → invite URL.
// -------------------------------------------------------------------
function getInviteForVU() {
  const idx = (__VU - 1) % inviteRows.length;
  return inviteRows[idx];
}

// -------------------------------------------------------------------
// Main VU flow: open the invite, then execute a tiny Python program.
// -------------------------------------------------------------------
export default function () {
  const inviteLink = getInviteForVU();

  // 1️⃣ Open invite page
  const openRes = http.get(inviteLink);
  check(openRes, { 'invite opened (200)': r => r.status === 200 });

  // 2️⃣ Submit a minimal Python snippet to the execution endpoint
  const execUrl = inviteLink.replace('/invite/', '/coding/execute/');
  const payload = {
    language_slug: 'python',
    source_code: Buffer.from('print("hello")').toString('base64'),
    stdin: Buffer.from('').toString('base64'),
    expected_output: Buffer.from('hello').toString('base64'),
  };

  const execRes = http.post(
    execUrl,
    JSON.stringify(payload),
    { headers: { 'Content-Type': 'application/json' } }
  );
  check(execRes, { 'code executed (200)': r => r.status === 200 });

  // 3️⃣ Small think‑time
  sleep(0.5);
}
