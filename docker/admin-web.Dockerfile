# ─────────────────────────────────────────────────────────────────────────────
# Admin Web Dashboard — Production Multi-Stage Dockerfile (TanStack Start / Nitro SSR)
# ─────────────────────────────────────────────────────────────────────────────

# Stage 1: Build SSR Application
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Copy root and workspace package manifests
COPY package.json ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/design-tokens/package.json ./packages/design-tokens/
COPY frontend/admin-web/package.json ./frontend/admin-web/

# Install dependencies for Linux platform
RUN rm -f package-lock.json && \
    npm install --workspace=packages/shared-types --workspace=packages/design-tokens --workspace=frontend/admin-web --ignore-scripts --include=dev --legacy-peer-deps

# Copy shared packages and admin source
COPY packages/shared-types/ ./packages/shared-types/
COPY packages/design-tokens/ ./packages/design-tokens/
COPY frontend/admin-web/ ./frontend/admin-web/

# Build shared types and design tokens first
RUN npm --workspace=packages/shared-types run build && \
    npm --workspace=packages/design-tokens run build

# Build admin-web
RUN npm --workspace=frontend/admin-web run build

# Stage 2: Production Node Server Runner
FROM node:22-bookworm-slim AS runner

WORKDIR /app

# Install curl for container healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

COPY --chown=node:node --from=builder /app/package.json ./package.json
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/packages/shared-types ./packages/shared-types
COPY --chown=node:node --from=builder /app/packages/design-tokens ./packages/design-tokens
COPY --chown=node:node --from=builder /app/frontend/admin-web ./frontend/admin-web

RUN ln -sf /app/node_modules /app/frontend/admin-web/node_modules

ENV NODE_ENV=production
ENV PORT=5173
ENV HOST=0.0.0.0
ENV NODE_PATH=/app/node_modules

WORKDIR /app/frontend/admin-web

EXPOSE 5173

USER node

HEALTHCHECK --interval=20s --timeout=5s --retries=3 \
  CMD curl -fs http://localhost:5173/ || exit 1

CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "5173"]
