# Developer CLI & Verification Scripts (`backend/api/scripts/`)

This directory contains standalone utility and verification scripts used during local development and testing of the CD-Recruit NestJS API.

## Running Scripts

Run scripts from the `backend/api` directory using `npx tsx` or `npx ts-node`:

```bash
cd backend/api
npx tsx scripts/<script-name>.ts
```

---

## Script Catalog

### 1. Candidate Links & Seeding
* **`seed-candidate-dev.ts`**: Seeds dev candidate invites, recruitment drive, and role templates.
  * *Shortcut*: `npm run seed:candidate` (from `backend/api`)
* **`create-fresh-candidate-link.ts`**: Generates a fresh candidate invite token and outputs a direct login URL (`http://localhost:3000/login?token=...`).
* **`get-token.ts`**: Fetches or signs a valid JWT token for candidate/admin API authorization headers.
* **`get-valid-session.ts`**: Queries PostgreSQL for an active candidate session ID.

### 2. Session Reset & Diagnostics
* **`reset-sessions.ts`**: Resets test candidate sessions to clean initial states for re-testing.
* **`find-pass.ts`**: Helper utility to check test candidate credentials.

### 3. API Module Verifications
* **`verify-simulation-api.ts`**: Tests the Contextual Simulation submission workflow and 4-part scoring evaluator.
* **`verify-events-api.ts`**: Verifies workspace telemetry event ingestion (`POST /simulation/events`).
* **`verify-consent-api.ts`**: Verifies candidate privacy and proctoring consent recording.
* **`verify-upload-api.ts`**: Tests proctoring clip and artifact upload endpoints.
* **`verify-close.ts`**: Tests automated session closing and timeout mechanics.
* **`verify-negative-testing.ts`**: Tests API error handling against invalid payloads and expired sessions.
* **`verify-retrieval-summary.ts`**: Validates summary reports and score breakdowns.
