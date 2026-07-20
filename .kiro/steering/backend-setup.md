# Backend Setup & Common Fix Guide

## After a fresh clone or pull — always run these

If you see TypeScript errors about missing Prisma types (`Candidate`, `Session`,
`SessionStatus`, `InviteStatus`, `CvMode`, `Prisma.InputJsonValue`) or missing
shared-types exports (`SubmissionType`, `ExecutionStatus`, `SqlExecutionStatus`),
the fix is always these three commands in order:

```bash
# 1. Install backend/api dependencies
#    --force is required on Windows/Linux because one transitive dep
#    (@tabby_ai/hijri-converter) incorrectly declares macOS-only support
cd backend/api
npm install --force

# 2. Generate the Prisma client from the schema
npx prisma generate --schema="../prisma/schema.prisma"

# 3. Rebuild shared-types so dist/ is in sync with src/
cd ../../packages/shared-types
npm run build
```

## Why this happens

- `packages/shared-types/dist/` is a build artifact — it is NOT committed to git.
  The source is in `src/`, but the backend imports from `dist/`. If dist is stale
  or missing, enums like `SubmissionType`, `ExecutionStatus`, and `SqlExecutionStatus`
  will be missing at compile time.

- `backend/node_modules/.prisma/client/` is also a generated artifact — it is NOT
  committed. Without running `prisma generate`, `@prisma/client` only has stub `any`
  types and none of the real model or enum exports exist.

- `backend/api/node_modules/` may be empty or partial if `npm install` was never
  run inside `backend/api/` specifically (it has its own `package.json` separate
  from the workspace root).

## Error signatures and their causes

| Error message | Cause |
|---|---|
| `Module '@prisma/client' has no exported member 'SessionStatus'` | Prisma client not generated — run step 2 |
| `Module '@prisma/client' has no exported member 'Candidate'` | Prisma client not generated — run step 2 |
| `Namespace 'Prisma' has no exported member 'InputJsonValue'` | Prisma client not generated — run step 2 |
| `Module '@cd-recruit/shared-types' has no exported member 'SubmissionType'` | shared-types not built — run step 3 |
| `Module '@cd-recruit/shared-types' has no exported member 'SqlExecutionStatus'` | shared-types not built — run step 3 |
| `Property 'COMPLETED' does not exist on type 'typeof ExecutionStatus'` | shared-types dist is stale — run step 3 |
| `Cannot find module 'pg'` | backend/api deps not installed — run step 1 |

## Schema location

The Prisma schema lives at `backend/prisma/schema.prisma` — NOT inside `backend/api/`.
The `backend/api/package.json` points to it via:
```json
"prisma": { "schema": "../prisma/schema.prisma" }
```
Always pass `--schema="../prisma/schema.prisma"` when running prisma commands from
inside `backend/api/`.
