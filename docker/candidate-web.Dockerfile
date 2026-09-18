# ─────────────────────────────────────────────────────────────────────────────
# Candidate Web SPA — Production Multi-Stage Dockerfile
# ─────────────────────────────────────────────────────────────────────────────

# Stage 1: Build static assets
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Copy root workspace manifests
COPY package.json ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/design-tokens/package.json ./packages/design-tokens/
COPY frontend/candidate-web/package.json ./frontend/candidate-web/

# Install dependencies exclusively for candidate-web and shared packages
RUN rm -f package-lock.json && \
    npm install --workspace=packages/shared-types --workspace=packages/design-tokens --workspace=frontend/candidate-web --ignore-scripts

# Copy shared packages and frontend source
COPY packages/shared-types/ ./packages/shared-types/
COPY packages/design-tokens/ ./packages/design-tokens/
COPY frontend/candidate-web/ ./frontend/candidate-web/

# Build shared types and design tokens first
RUN npm --workspace=packages/shared-types run build && \
    npm --workspace=packages/design-tokens run build

# Build arguments for frontend API configuration
ARG VITE_API_BASE_URL=http://localhost:3001/api/v1
ARG VITE_WS_URL=ws://localhost:3001
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_WS_URL=$VITE_WS_URL

# Build candidate-web SPA
RUN npm --workspace=frontend/candidate-web run build

# Stage 2: Serve via Nginx
FROM nginx:alpine AS runner

# Install curl for healthcheck
RUN apk add --no-cache curl

# Remove default Nginx website
RUN rm -rf /usr/share/nginx/html/* /etc/nginx/conf.d/default.conf

# Copy custom Nginx configuration
COPY docker/nginx/candidate.conf /etc/nginx/conf.d/default.conf

# Copy compiled static assets from builder stage
COPY --from=builder /app/frontend/candidate-web/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD curl -fs http://localhost/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
