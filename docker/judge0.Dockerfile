# ─────────────────────────────────────────────────────────────────────────────
# Judge0 — PLACEHOLDER / NOT BUILT
#
# CD-Recruit uses the HOSTED Judge0 CE API (judge0-ce.p.rapidapi.com).
# A self-hosted Judge0 instance is intentionally deferred to a later upgrade
# trigger (Phase 5 scope or an explicit infrastructure decision).
#
# To self-host Judge0 in the future:
#   1. Replace this file with the official Judge0 CE docker-compose setup
#      from https://github.com/judge0/judge0
#   2. Update JUDGE0_API_URL in .env to point to the local instance
#   3. Remove JUDGE0_API_KEY (not required for self-hosted)
#
# This file is intentionally left as a stub so Phase 3 infra is complete
# without accidentally spinning up a Judge0 container that requires
# significant CPU/memory and additional queue workers (Redis, PostgreSQL).
# ─────────────────────────────────────────────────────────────────────────────

# FROM judge0/judge0:latest
# (see https://github.com/judge0/judge0 for full setup)
