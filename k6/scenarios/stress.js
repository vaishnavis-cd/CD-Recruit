// scenarios/stress.js
// Purpose: find the breakpoint - where does each layer (API, DB, redis,
// judge0 sandbox pool, MinIO) start failing or degrading as concurrency
// climbs toward 1000 candidates? Use an OPEN model (arrival-rate) because
// real candidates don't hammer as fast as they can - they think, type,
// then submit. ramping-vus (closed model) understates real load because
// slow responses automatically throttle new iterations; arrival-rate does
// not, which is exactly what you want for finding the true breakpoint.
//
// RUN THIS ONLY AGAINST STAGING, NEVER LOCAL - see README.
//
//   k6 run k6/scenarios/stress.js --env API_BASE_URL=https://staging.example.com/api/v1 ...
//
// preAllocatedVUs / maxVUs are generous headroom for k6's own VU pool, not
// a promise that many VUs will be used - the arrival rate schedule below
// is what actually drives concurrency.

import { candidateJourney } from '../lib/journey.js';

export const options = {
  scenarios: {
    stress: {
      executor: 'ramping-arrival-rate',
      startRate: 5,
      timeUnit: '1s',
      preAllocatedVUs: 200,
      maxVUs: 1200,
      stages: [
        { target: 10, duration: '2m' },   // ~ warms up around 10 new journeys/sec
        { target: 30, duration: '5m' },
        { target: 60, duration: '5m' },   // rough proxy for several hundred concurrent
        { target: 100, duration: '5m' },  // rough proxy for ~1000 concurrent given multi-min journeys
        { target: 100, duration: '5m' },  // hold at peak to see sustained behavior
        { target: 0, duration: '2m' },
      ],
    },
  },
  thresholds: {
    // Intentionally looser than load.js - the POINT of this test is to find
    // where these start failing, not to assert they never do.
    'journey_errors': ['rate<0.15'],
    'http_req_failed': ['rate<0.15'],
  },
};

export default function () {
  candidateJourney();
}
