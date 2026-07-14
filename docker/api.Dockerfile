# ─────────────────────────────────────────────────────────────────────────────
# NestJS API — Development Dockerfile
#
# Uses node:20-alpine for a small image footprint.
# Hot-reload via `nest start --watch` (watches backend/api/src/).
#
# When running inside Docker Compose, the source tree is bind-mounted so that
# file changes on the host are reflected inside the container without rebuild:
#
#   volumes:
#     - .:/app
#     - /app/node_modules   # anonymous volume to prevent host node_modules clash
#
# DATABASE_URL inside the container must use the Docker service name, not localhost:
#   DATABASE_URL=postgresql://cdrecruit:cdrecruit123@postgres:5432/cdrecruit
# ─────────────────────────────────────────────────────────────────────────────

FROM node:20-alpine AS dev

# Build tools needed by native addons (bcrypt, sharp, etc.)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Install dependencies first (cached unless package-lock.json changes)
COPY package*.json ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY backend/api/package.json ./backend/api/

RUN npm ci --workspace=backend/api --workspace=packages/shared-types

# Copy Prisma schema so prisma generate runs at startup
COPY backend/prisma/ ./backend/prisma/

# Copy application source
COPY packages/shared-types/src/ ./packages/shared-types/src/
COPY packages/shared-types/tsconfig.json ./packages/shared-types/
COPY backend/api/src/ ./backend/api/src/
COPY backend/api/tsconfig.json ./backend/api/

# Generate Prisma client targeting the container's node_modules
RUN npx --prefix backend/api prisma generate --schema=backend/prisma/schema.prisma

WORKDIR /app/backend/api

EXPOSE 3001

CMD ["npm", "run", "start:dev"]
