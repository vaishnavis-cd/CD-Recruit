# ─────────────────────────────────────────────────────────────────────────────
# NestJS Backend API — Production Multi-Stage Dockerfile (Debian-slim Runner)
# ─────────────────────────────────────────────────────────────────────────────

# Stage 1: Build NestJS Application & Prisma Client
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy root manifest and workspace package files
COPY package.json ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/design-tokens/package.json ./packages/design-tokens/
COPY backend/api/package.json ./backend/api/package.json
COPY frontend/candidate-web/package.json ./frontend/candidate-web/
COPY frontend/admin-web/package.json ./frontend/admin-web/

# Install dependencies for workspace graph
RUN rm -f package-lock.json && \
    npm install --legacy-peer-deps --ignore-scripts --include=dev

ENV NODE_PATH=/app/node_modules

# Copy source trees and Prisma schema
COPY packages/shared-types/ ./packages/shared-types/
COPY packages/design-tokens/ ./packages/design-tokens/
COPY backend/prisma/ ./backend/prisma/
COPY backend/api/ ./backend/api/

# Build shared packages, generate Linux Prisma engine, and build NestJS API
RUN npm --workspace=packages/shared-types run build && \
    npm --workspace=packages/design-tokens run build && \
    npx prisma generate --schema=backend/prisma/schema.prisma && \
    ln -sf /app/node_modules /app/backend/api/node_modules && \
    cd backend/api && npx nest build

# Stage 2: Production Runner
FROM node:20-bookworm-slim AS runner

WORKDIR /app

# Install runtime libraries for Prisma engines and container healthchecks
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /app/temp_workspaces \
    && chown -R node:node /app

ENV NODE_ENV=production
ENV PORT=3001
ENV API_PORT=3001
ENV NODE_PATH=/app/node_modules

# Copy built artifacts and production dependencies
COPY --chown=node:node --from=builder /app/package.json ./
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/packages ./packages
COPY --chown=node:node --from=builder /app/backend/prisma ./backend/prisma
COPY --chown=node:node --from=builder /app/backend/api/package.json ./backend/api/package.json
COPY --chown=node:node --from=builder /app/backend/api/dist ./backend/api/dist
COPY --chown=node:node --from=builder /app/backend/api/models ./backend/api/models

RUN ln -sf /app/node_modules /app/backend/api/node_modules

USER node

EXPOSE 3001

HEALTHCHECK --interval=20s --timeout=5s --retries=3 \
  CMD curl -fs http://localhost:3001/api/v1/health || exit 1

CMD ["node", "backend/api/dist/main"]
