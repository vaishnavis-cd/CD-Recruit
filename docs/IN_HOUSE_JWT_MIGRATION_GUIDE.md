# CD-Recruit — In-House JWT Authentication Guide & Setup

This document serves as the comprehensive guide for the **in-house Staff JWT Authentication system** that replaced Keycloak in CD-Recruit. It covers the architectural rationale, what was built and added, the step-by-step conversion process, how to set up the system on your local PC, and verification/troubleshooting steps.

---

## 1. Overview & Architecture Rationale

### Why In-House JWT Replaced Keycloak
Previously, CD-Recruit relied on Keycloak (OIDC/OAuth2 server on port `8080`) for Staff authentication and user management. While functional, this introduced several drawbacks for local development and deployment:
- **Heavy Infrastructure Footprint**: Keycloak container required Java runtime and consumed ~1GB of RAM.
- **Complex Two-Way Synchronization**: Creating, updating, or resetting staff passwords required brittle dual-writes across PostgreSQL and Keycloak Admin REST APIs.
- **Slow Startup & Cold Boots**: Starting the development environment required waiting for Keycloak realm initialization and JWKS endpoint readiness.

### The In-House JWT Architecture
CD-Recruit now uses a **high-performance, zero-dependency, native JWT authentication system**:
- **Single Source of Truth**: The `Staff` table in PostgreSQL is the sole authority for staff accounts, roles, credentials, and session tokens.
- **Algorithm**: Symmetric **HS256** signed with a cryptographically strong `JWT_SECRET`.
- **Password Security**: Password hashing powered by Node.js native **`crypto.scrypt`** (memory-hard, GPU-resistant) with random salts and timing-safe verification.
- **Refresh Token Rotation & Storage**: Opaque, cryptographically random 80-character refresh tokens, stored as **SHA-256 hashes** in the database with strict expiration dates and single-use rotation (replay protection).
- **Candidate Isolation**: Candidate assessment sessions remain completely separate and utilize their own tamper-proof session tokens (`SessionOwnerGuard`), untouched by the Staff auth changes.

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Staff / Recruiter
    participant Frontend as admin-web (React)
    participant Backend as NestJS API (/api/v1/auth)
    participant DB as PostgreSQL (Staff Table)

    %% Login Flow
    Admin->>Frontend: Enter Email/Username & Password
    Frontend->>Backend: POST /auth/login { identifier, password }
    Backend->>DB: Query Staff by email/username (isActive = true)
    Backend->>Backend: verifyPassword(password, staff.passwordHash) via scrypt
    Backend->>Backend: Generate HS256 Access Token + 80-char Refresh Token
    Backend->>DB: Save SHA-256(refreshToken) & expiresAt
    Backend-->>Frontend: 200 OK { accessToken, refreshToken, staff }
    Frontend->>Frontend: Persist tokens in localStorage

    %% Protected API Flow
    Frontend->>Backend: GET /api/v1/staff (Bearer Access Token)
    Backend->>Backend: JwtStrategy validates HS256 signature & extracts sub
    Backend->>DB: Lookup Staff by ID (check isActive)
    Backend-->>Frontend: 200 OK (Staff Payload)

    %% Refresh Token Flow
    Note over Frontend,Backend: Access Token Expires (e.g. after 15m)
    Frontend->>Backend: POST /auth/refresh { refreshToken }
    Backend->>Backend: Hash incoming refreshToken with SHA-256
    Backend->>DB: Find Staff by refreshTokenHash & check expiresAt > NOW()
    Backend->>Backend: Rotate: Generate new Access Token + new Refresh Token
    Backend->>DB: Update refreshTokenHash = SHA-256(newRefreshToken)
    Backend-->>Frontend: 200 OK { accessToken, refreshToken, staff }
```

---

## 2. What Was Added & Changed

### A. Database Schema (`backend/prisma/schema.prisma`)
The `Staff` model was updated with native credential and session fields, and the legacy `keycloakUserId` field was decommissioned:

```prisma
model Staff {
  id                    String    @id @default(uuid())
  email                 String    @unique
  username              String    @unique
  passwordHash          String?   // scrypt$<salt_hex>$<derived_key_hex>
  refreshTokenHash      String?   // SHA-256 hash of active refresh token
  refreshTokenExpiresAt DateTime? // Absolute expiration timestamp
  role                  StaffRole @default(RECRUITER)
  firstName             String?
  lastName              String?
  isActive              Boolean   @default(true)
  lastLoginAt           DateTime?
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt
  
  // Relations...
}
```

#### Applied Migrations:
1. `20260915120000_add_staff_local_auth`: Added `passwordHash`, `refreshTokenHash`, `isActive`, and `lastLoginAt`.
2. `20260915143000_add_staff_refresh_token_expires_at`: Added `refreshTokenExpiresAt` for explicit refresh token TTL enforcement.
3. `20260915153000_remove_staff_keycloak_user_id`: Safely dropped the legacy `keycloakUserId` column.

---

### B. Cryptographic Utilities (`backend/api/src/common/utils/password.util.ts`)
A dedicated, zero-external-dependency cryptographic utility module:
- `hashPassword(password: string): Promise<string>`: Uses `crypto.scrypt` with 16-byte random salt and 64-byte key length. Output format: `scrypt$<salt_hex>$<derived_key_hex>`.
- `verifyPassword(password: string, storedHash: string): Promise<boolean>`: Computes scrypt derivation on the input password with the stored salt and validates in constant time using `crypto.timingSafeEqual`.
- `hashToken(rawToken: string): string`: Computes deterministic SHA-256 digest of raw tokens before persisting to PostgreSQL.
- `generateRefreshToken(): string`: Generates an 80-character cryptographically secure random hex string (40 bytes from `crypto.randomBytes`).

---

### C. Backend Authentication Service & Controller
- **`AuthService` (`backend/api/src/auth/auth.service.ts`)**:
  - `loginStaff(loginDto)`: Validates credentials, updates `lastLoginAt`, issues JWT access token and refresh token, stores hashed refresh token in database.
  - `refreshStaffToken(refreshTokenDto)`: Validates incoming refresh token against DB hash, checks expiration, rotates refresh token (issues fresh token pair and updates DB), preventing token replay attacks.
  - `logoutStaff(staffId)`: Revokes the session by setting `refreshTokenHash = null` and `refreshTokenExpiresAt = null`.
- **`AuthController` (`backend/api/src/auth/auth.controller.ts`)**:
  - `POST /api/v1/auth/login` (Public, rate-limited with `@Throttle`)
  - `POST /api/v1/auth/refresh` (Public, rate-limited with `@Throttle`)
  - `POST /api/v1/auth/logout` (Protected, requires `@UseGuards(JwtAuthGuard)`)
  - `GET /api/v1/auth/me` (Protected, returns authenticated staff profile)
- **`JwtStrategy` (`backend/api/src/auth/jwt.strategy.ts`)**:
  - Validates HS256 tokens using `JWT_SECRET`.
  - Injects `Staff` entity into `req.user` with standard RBAC fields (`id`, `email`, `role`, `staffId`).
- **`SettingsService` (`backend/api/src/settings/settings.service.ts`)**:
  - Completely removed Keycloak Admin API calls.
  - Pure database CRUD operations for staff creation (`createStaff`), password reset (`resetStaffPassword`), role updates, and deletions.

---

### D. Frontend Integration (`frontend/apps/admin-web`)
- **`auth.service.ts`**:
  - Provides `login(identifier, password)`, `refreshTokens()`, `logout()`, and `getUserProfile()`.
  - Stores `accessToken`, `refreshToken`, and cached `userProfile` in `localStorage`.
- **Axios HTTP Client (`api-client.ts`)**:
  - Request Interceptor: Automatically injects `Authorization: Bearer <accessToken>`.
  - Response Interceptor: Listens for `401 Unauthorized`. If an access token expires mid-session, it automatically queues pending requests, invokes `/api/v1/auth/refresh`, updates the stored tokens, and transparently retries the failed requests without logging the user out.

---

### E. Container & Infrastructure Cleanup
- Removed the `cdrecruit_keycloak_dev` container from `docker/docker-compose.dev.yml`.
- Removed Keycloak configuration variables (`KEYCLOAK_URL`, `KEYCLOAK_REALM`, `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_CLIENT_SECRET`, `KEYCLOAK_ADMIN_USER`, `KEYCLOAK_ADMIN_PASSWORD`).
- Total infrastructure containers reduced to 5: `postgres`, `redis`, `minio`, `judge0_server`, `judge0_worker`.

---

## 3. Step-by-Step Setup on Your PC

Follow these steps to set up or verify the in-house JWT authentication on your local machine:

### Step 1: Configure Environment Variables

Ensure your root `.env` and `backend/api/.env` contain the in-house JWT configuration:

```env
# Database
DATABASE_URL=postgresql://cdrecruit:cdrecruit123@localhost:5434/cdrecruit

# Local JWT Configuration
JWT_SECRET=super-secret-jwt-key-for-staff-dev-2026-min32chars!
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN_DAYS=7

# Candidate Assessment Secret (Separated)
CANDIDATE_JWT_SECRET=candidate-session-secret-key-32chars-min!
```

> **Note**: Copy `.env` to `backend/api/.env`:
> ```bash
> cp .env backend/api/.env
> ```

---

### Step 2: Start Backing Services (No Keycloak Required)

Start the lightweight development containers (PostgreSQL, Redis, MinIO, Judge0):

```bash
npm run infra:up
```

Verify that all running containers are healthy:
```bash
docker ps
```
You should see:
- `cdrecruit_postgres_dev` (Port `5434`)
- `cdrecruit_redis_dev` (Port `6379`)
- `cdrecruit_minio_dev` (Ports `9000`, `9001`)
- `cdrecruit_judge0_server` (Port `2358`)
- `cdrecruit_judge0_worker`

---

### Step 3: Install Dependencies & Build Workspace Packages

```bash
npm install
npm run build:shared
```

---

### Step 4: Run Prisma Migrations & Seed Default Staff

Apply the database migrations and seed the default administrator and recruiter accounts:

```bash
npm run db:migrate
npm run db:seed
```

The database seed (`backend/prisma/seed.ts`) will hash the default passwords using `scrypt` and create the default staff members:

| Email / Identifier | Username | Default Password | Role |
| :--- | :--- | :--- | :--- |
| `admin@cdrecruit.local` | `demo-admin` | `password` | `SUPER_ADMIN` |
| `recruiter@cdrecruit.local` | `demo-recruiter` | `password` | `RECRUITER` |

---

### Step 5: Start Application Services

Start the backend API and frontend admin dashboard in separate terminal tabs:

```bash
# Terminal 1: NestJS API Backend (Port 3001)
npm run dev:api

# Terminal 2: Admin Web Dashboard (Port 3000)
npm run dev:admin

# Terminal 3: Candidate Web Shell (Port 5173 - if testing assessments)
npm run dev:candidate
```

---

## 4. Default Credentials & API Endpoints

### URLs
- **Admin Web Dashboard**: [http://localhost:3000](http://localhost:3000)
- **Backend API Base**: [http://localhost:3001/api/v1](http://localhost:3001/api/v1)
- **Swagger Documentation**: [http://localhost:3001/docs](http://localhost:3001/docs)

### Testing Auth via cURL

#### 1. Staff Login
```bash
curl -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier": "admin@cdrecruit.local", "password": "password"}'
```
**Response:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "893c5c64c8d0bebc1184a51dfa140f28e...",
  "staff": {
    "id": "uuid-here",
    "email": "admin@cdrecruit.local",
    "username": "demo-admin",
    "role": "SUPER_ADMIN",
    "firstName": "System",
    "lastName": "Administrator"
  }
}
```

#### 2. Accessing Protected Route with Bearer Token
```bash
curl -X GET http://localhost:3001/api/v1/auth/me \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

#### 3. Refreshing Tokens (Rotation)
```bash
curl -X POST http://localhost:3001/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken": "<REFRESH_TOKEN>"}'
```

#### 4. Staff Logout
```bash
curl -X POST http://localhost:3001/api/v1/auth/logout \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

---

## 5. Automated Tests & Verification

You can run the comprehensive backend test suites to verify that JWT authentication, password hashing, token rotation, and RBAC strategies pass 100%:

```bash
# Run all backend unit and strategy tests
node node_modules/jest/bin/jest.js --config backend/api/jest.config.js

# Run password utility tests specifically
node node_modules/jest/bin/jest.js --config backend/api/jest.config.js backend/api/src/common/utils/password.util.spec.ts

# Run AuthService unit tests
node node_modules/jest/bin/jest.js --config backend/api/jest.config.js backend/api/src/auth/auth.service.spec.ts

# Run JwtStrategy tests
node node_modules/jest/bin/jest.js --config backend/api/jest.config.js backend/api/src/auth/jwt.strategy.spec.ts
```

---

## 6. Troubleshooting & Common Questions

### Q1: Why do I get a 401 Unauthorized when logging in with seed accounts?
- Ensure you ran `npm run db:seed` after applying migrations.
- If passwords were changed or hashes were corrupted during manual testing, re-seed the database:
  ```bash
  npm run db:seed
  ```

### Q2: Why does `npm run db:migrate` fail with missing `DATABASE_URL`?
- Prisma looks for `.env` in `backend/api/.env`.
- Ensure you ran `cp .env backend/api/.env`.

### Q3: How do I change a staff member's password?
- Via Admin UI: Navigate to **Settings > Team Management**, edit the user, and select **Reset Password**.
- The backend will hash the new password with `hashPassword()` and immediately invalidate existing refresh tokens.

### Q4: Are Candidate tokens affected by the Staff JWT secret?
- **No.** Candidate tokens are separate and handled through `candidate.service.ts` and `SessionOwnerGuard`. Staff authentication and Candidate assessment authentication remain strictly isolated.
