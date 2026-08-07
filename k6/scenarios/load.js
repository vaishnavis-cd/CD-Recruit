// scenarios/load.js
// Purpose: latency/error behavior at realistic expected concurrency.
// Run only after smoke.js passes cleanly.
//
//   k6 run k6/scenarios/load.js --env API_BASE_URL=... --env CANDIDATE_WEB_URL=...
//
// Adjust `target` to your real expected concurrent-candidate number - 50 is
// a reasonable starting point for a mid-size assessment window.

import { candidateJourney } from '../lib/journey.js';

export const options = {
  scenarios: {
    load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 50 },   // ramp-up
        { duration: '10m', target: 50 },  // steady state
        { duration: '2m', target: 0 },    // ramp-down
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    'step_invite_open': ['p(95)<800'],
    'step_session_start': ['p(95)<1000'],
    'step_coding_total{name:coding_execute_sync}': ['p(90)<5000', 'p(95)<8000'],
    'step_judge0_queue_wait': ['p(95)<15000'], // only populated in async mode
    'step_final_submit': ['p(95)<1500'],
    'journey_errors': ['rate<0.02'],
    'http_req_failed': ['rate<0.02'],
  },
};

export default function () {
  candidateJourney();
}
