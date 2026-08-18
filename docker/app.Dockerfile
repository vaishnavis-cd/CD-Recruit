# ─────────────────────────────────────────────────────────────────────────────
# Proctora — Unified Monolith Application Container (Phase 1)
#
# Multi-stage build combining:
#   - @cd-recruit/shared-types (Shared Library)
#   - @cd-recruit/candidate-web (Candidate Assessment SPA)
#   - @cd-recruit/admin-web (Recruiter / Admin Web Console)
#   - @cd-recruit/api (NestJS Core API)
#
# Processes Supervised by Supervisord:
#   - Nginx (Gateway Reverse Proxy on Port 80)
#   - Admin Web (SSR/Static Node server on Port 3002)
#   - NestJS API (REST & Realtime Server on Port 3001)
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Build Workspace ──────────────────────────────────────────────────
FROM node:20-bookworm-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy root & workspace package declarations for optimal layer caching
COPY package*.json ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY frontend/candidate-web/package.json ./frontend/candidate-web/
COPY frontend/admin-web/package.json ./frontend/admin-web/
COPY backend/api/package.json ./backend/api/

RUN npm ci --ignore-scripts --no-audit --no-fund
RUN npm install @rolldown/binding-linux-x64-gnu @rollup/rollup-linux-x64-gnu @esbuild/linux-x64 lightningcss-linux-x64-gnu @tailwindcss/oxide-linux-x64-gnu --no-save

# Copy entire source monorepo
COPY packages/shared-types/ ./packages/shared-types/
COPY frontend/candidate-web/ ./frontend/candidate-web/
COPY frontend/admin-web/ ./frontend/admin-web/
COPY backend/api/ ./backend/api/
COPY backend/prisma/ ./backend/prisma/

# Step 1: Build Shared Types
RUN npm run build:shared

# Step 2: Build Candidate Web SPA
RUN npm --workspace=frontend/candidate-web run build

# Step 3: Build Admin Web App
RUN npm --workspace=frontend/admin-web run build

# Step 4: Generate Prisma Client & Build NestJS API
RUN npx --prefix backend/api prisma generate --schema=backend/prisma/schema.prisma
RUN npm --workspace=backend/api run build

# ── Stage 2: Production Monolith Runtime ──────────────────────────────────────
FROM node:20-bookworm-slim AS runner

# Install Nginx, Supervisord, PostgreSQL client (for pg_isready), netcat
RUN apt-get update && apt-get install -y --no-install-recommends \
    nginx \
    supervisor \
    postgresql-client \
    netcat-openbsd \
    curl \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g prisma@5.22.0

WORKDIR /app

# Prepare directories
RUN mkdir -p /usr/share/nginx/html/candidate \
             /usr/share/nginx/html/admin \
             /var/log/nginx \
             /var/log/supervisor \
             /etc/supervisor/conf.d \
             /app/backend/api \
             /app/backend/prisma \
             /app/frontend/admin-web \
             /app/packages/shared-types

# Copy built Candidate Web assets to Nginx webroot
COPY --from=builder /app/frontend/candidate-web/dist /usr/share/nginx/html/candidate

# Copy built Admin Web assets and runner script
COPY --from=builder /app/frontend/admin-web/dist /app/frontend/admin-web/dist
COPY --from=builder /app/frontend/admin-web/package.json /app/frontend/admin-web/package.json
COPY frontend/admin-web/serve.mjs /app/frontend/admin-web/serve.mjs

# Copy backend build, prisma, shared-types, node_modules
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/packages/shared-types /app/packages/shared-types
COPY --from=builder /app/backend/prisma /app/backend/prisma
COPY --from=builder /app/backend/api/dist /app/backend/api/dist
COPY --from=builder /app/backend/api/package.json /app/backend/api/package.json
COPY --from=builder /app/backend/node_modules /app/backend/node_modules

# Copy container configurations
COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY docker/supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY docker/entrypoint.sh /entrypoint.sh
RUN sed -i 's/\r$//' /entrypoint.sh && chmod +x /entrypoint.sh

EXPOSE 80

ENV NODE_ENV=production
ENV PORT=3001
ENV ADMIN_PORT=3002

ENTRYPOINT ["/entrypoint.sh"]
