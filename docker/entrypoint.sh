#!/bin/sh
set -e

echo "========================================================"
echo "    PROCTORA — Unified Monolith Container Booting (v1)   "
echo "========================================================"

POSTGRES_HOST="${POSTGRES_HOST:-postgres}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_USER="${POSTGRES_USER:-cdrecruit}"

echo "Waiting for PostgreSQL database at ${POSTGRES_HOST}:${POSTGRES_PORT}..."
until nc -z "${POSTGRES_HOST}" "${POSTGRES_PORT}" > /dev/null 2>&1 || pg_isready -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" -U "${POSTGRES_USER}" > /dev/null 2>&1; do
  echo "Database is unavailable - waiting 2s..."
  sleep 2
done
echo "✓ PostgreSQL is ready and reachable."

echo "Syncing Prisma schema with database..."
prisma db push --schema=/app/backend/prisma/schema.prisma --skip-generate || true

# Seed database if requested or if flag is present
if [ "$SEED_DATABASE" = "true" ]; then
  echo "Seeding initial dataset into database..."
  prisma db seed || true
fi

echo "✓ Infrastructure checks complete."
echo "Starting Supervisord process supervisor (Nginx + NestJS API)..."
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
