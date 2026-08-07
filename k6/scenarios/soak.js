// scenarios/soak.js
// Purpose: catch things smoke/load/stress miss because they're too short -
// judge0 worker/container leaks, DB connection pool exhaustion over time,
// Redis memory creep, disk filling from logs/evidence uploads, MinIO
// bucket growth. Run on staging, overnight if possible.
//
//   k6 run k6/scenarios/soak.js --env API_BASE_URL=https://staging.example.com/api/v1 ...

import { candidateJourney } from '../lib/journey.js';

export const options = {
  scenarios: {
    soak: {
      executor: 'constant-vus',
      vus: 100,
      duration: '90m',
    },
  },
  thresholds: {
    'journey_errors': ['rate<0.03'],
    // Watch for latency creeping UP over the run in Grafana even if this
    // threshold never breaches - that's the actual soak-test signal.
    'step_coding_total': ['p(95)<8000'],
  },
};

export default function () {
  candidateJourney();
}
