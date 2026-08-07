// scenarios/smoke.js
// Purpose: prove the script and environment work end-to-end BEFORE spending
// any time on load/stress numbers. Not a performance test - a correctness
// gate. Run this first, every time, after any script or env change.
//
//   k6 run k6/scenarios/smoke.js \
//     --env API_BASE_URL=http://localhost:3001/api/v1 \
//     --env CANDIDATE_WEB_URL=http://localhost:3000 \
//     --env SMOKE_VUS=5 --env SMOKE_ITERATIONS_PER_VU=1

import { candidateJourney } from '../lib/journey.js';

const vus = Number(__ENV.SMOKE_VUS || 5);
const iterationsPerVU = Number(__ENV.SMOKE_ITERATIONS_PER_VU || 1);

export const options = {
  scenarios: {
    smoke: {
      executor: 'constant-vus',
      vus: vus,
      duration: '1m',
      gracefulStop: '10s',
    },
  },
  thresholds: {
    // Loose thresholds on purpose - smoke just needs "does it work", not
    // "is it fast". Tighten these once you have a real baseline.
    'checks': ['rate>0.95'],
    'journey_errors': ['rate<0.05'],
  },
};

export default function () {
  candidateJourney();
}
