// k6 load test for Judge0 integration
import http from 'k6/http';
import { check, sleep } from 'k6';
import { encode } from 'k6/encoding';

export const options = {
  stages: [
    { duration: '1m', target: 5 },   // ramp‑up to 5 VUs
    { duration: '5m', target: 5 },   // sustain load
    { duration: '1m', target: 0 },    // ramp‑down
  ],
  thresholds: {
    http_req_duration: ['p(95)<1500'], // 95% of requests under 1.5 s
  },
};

const baseUrl = __ENV.BASE_URL || 'http://localhost:3000'; // adjust to your API gateway

function submitCode(langSlug, source, stdin, expected) {
  // Ensure inputs are strings – k6/encoding.encode expects a string, not null
  const src = source ?? '';
  const inpt = stdin ?? '';
  const exp = expected ?? '';
  const payload = {
    language_slug: langSlug,
    source_code: encode(src),
    stdin: encode(inpt),
    expected_output: encode(exp),
  };
  const res = http.post(`${baseUrl}/coding/execute`, JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' },
  });
  check(res, { 'status 200': (r) => r.status === 200 });
  // poll for async result if needed – simplified here
  sleep(0.5);
}

export default function () {
  // Python example
  submitCode('python', 'print(input())', 'hello', 'hello');
  // JavaScript example
  submitCode('javascript', 'console.log(require("fs").readFileSync(0, "utf8"))', 'world', 'world');
}
