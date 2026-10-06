# Artifact 03 (Half 1): Database Persistence Model & Schema Specification

**Document:** `docs/super-admin/design/03-half1-database-schema.md`  
**Classification:** Database Architecture & Persistence Contract  
**System:** Proctora / CD-Recruit Platform Operations & Tenant Lifecycle  
**Prisma Version:** `@prisma/client` ^5.22.0, `prisma` ^5.22.0  
**Target Engine:** PostgreSQL 15+  
**Authoritative Precedence:** `super-admin-intent.md` > `CD-Recruit_Super_Admin_Scope_and_Split.md`  
**Ownership:** Dev 1 (Half 1 Lead)

---

## 1. Schema Architecture & Multi-Schema Configuration

The application database uses PostgreSQL multi-schema partitioning. The `platform` schema stores administrative identity, platform audit logs, operational overrides, and tenant profile extensions.

```prisma
// Multi-schema Datasource Configuration
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  schemas  = ["public", "billing", "platform"]
}

generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["multiSchema"]
}
```

---

## 2. Table Specifications (`platform` Schema)

### 2.1 Table: `platform.platform_staff`
Stores credentials, roles, and MFA secrets for Proctora internal staff. Completely isolated from tenant user tables.

```prisma
enum PlatformStaffRole {
  SUPPORT
  FINANCE
  OWNER

  @@schema("platform")
}

enum PlatformStaffStatus {
  ACTIVE
  DISABLED

  @@schema("platform")
}

model PlatformStaff {
  id           String              @id @default(uuid()) @db.Uuid
  email        String              @unique @db.VarChar(255)
  fullName     String              @map("full_name") @db.VarChar(255)
  passwordHash String              @map("password_hash") @db.VarChar(255)
  role         PlatformStaffRole   @default(SUPPORT)
  status       PlatformStaffStatus @default(ACTIVE)
  
  totpSecret   String?             @map("totp_secret") @db.VarChar(255)
  mfaEnabled   Boolean             @default(false) @map("mfa_enabled")
  
  lastLoginAt  DateTime?           @map("last_login_at") @db.Timestamptz(6)
  createdAt    DateTime            @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt    DateTime            @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  auditEventsTriggered PlatformAuditEvent[] @relation("ActorAuditEvents")
  overridesRequested   OverrideAction[]     @relation("RequestedOverrides")
  overridesApproved    OverrideAction[]     @relation("ApprovedOverrides")
  impersonations       ImpersonationSession[]
  draftsCreated        OnboardingDraft[]
  incidentsDeclared    IncidentWindow[]

  @@map("platform_staff")
  @@schema("platform")
}
```

---

### 2.2 Table: `platform.tenant_profile`
Maintains operational metadata, lifecycle tracking, licensing entitlements, and compliance settings for an `Organization`.

```prisma
enum TenantLifecycleStage {
  ONBOARDING
  TRIAL
  ACTIVE
  DORMANT
  SUSPENDED
  CHURNED

  @@schema("platform")
}

enum LicenseTier {
  STARTER
  GROWTH
  ENTERPRISE

  @@schema("platform")
}

model TenantProfile {
  id                        String               @id @default(uuid()) @db.Uuid
  organizationId            String               @unique @map("organization_id") @db.Uuid
  
  lifecycleStage            TenantLifecycleStage @default(ONBOARDING) @map("lifecycle_stage")
  domainVerifiedAt          DateTime?            @map("domain_verified_at") @db.Timestamptz(6)
  walkthroughCompletedAt    DateTime?            @map("walkthrough_completed_at") @db.Timestamptz(6)
  internalOwnerId           String?              @map("internal_owner_id") @db.Uuid
  
  licenseTier               LicenseTier          @default(STARTER) @map("license_tier")
  entitlements              Json                 @default("{}") @db.JsonB
  
  appealWindowDaysOverride  Int?                 @map("appeal_window_days_override")
  trialNudgeLog             Json                 @default("[]") @map("trial_nudge_log") @db.JsonB
  
  isManuallySuspended       Boolean              @default(false) @map("is_manually_suspended")
  isManuallyChurned         Boolean              @default(false) @map("is_manually_churned")
  suspensionReason          String?              @map("suspension_reason") @db.Text
  
  createdAt                 DateTime             @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt                 DateTime             @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Restrict)

  @@map("tenant_profile")
  @@schema("platform")
}
```

---

### 2.3 Table: `platform.override_action`
Logs and enforces all operational overrides (proctoring relaxation, question version updates, schedule extensions, invite ratios).

```prisma
enum OverrideType {
  PROCTORING_SENSITIVITY
  SCHEDULE_EXTENSION
  QUESTION_FIX
  INVITE_RATIO
  INCIDENT_WINDOW

  @@schema("platform")
}

enum OverrideStatus {
  ACTIVE
  EXPIRED
  REVOKED

  @@schema("platform")
}

model OverrideAction {
  id             String         @id @default(uuid()) @db.Uuid
  organizationId String         @map("organization_id") @db.Uuid
  driveId        String?        @map("drive_id") @db.Uuid
  
  overrideType   OverrideType   @map("override_type")
  beforeState    Json           @map("before_state") @db.JsonB
  afterState     Json           @map("after_state") @db.JsonB
  
  reason         String         @db.Text
  ticketRef      String         @map("ticket_ref") @db.VarChar(100)
  
  requestedById  String         @map("requested_by_id") @db.Uuid
  approvedById   String?        @map("approved_by_id") @db.Uuid
  
  activeFrom     DateTime       @default(now()) @map("active_from") @db.Timestamptz(6)
  expiresAt      DateTime?      @map("expires_at") @db.Timestamptz(6)
  status         OverrideStatus @default(ACTIVE)
  
  createdAt      DateTime       @default(now()) @map("created_at") @db.Timestamptz(6)

  // Relations
  requestedBy  PlatformStaff @relation("RequestedOverrides", fields: [requestedById], references: [id])
  approvedBy   PlatformStaff? @relation("ApprovedOverrides", fields: [approvedById], references: [id])

  @@index([organizationId, status])
  @@index([driveId, status])
  @@map("override_action")
  @@schema("platform")
}
```

---

### 2.4 Table: `platform.impersonation_session`
Tracks time-boxed operator impersonation sessions into tenant admin accounts.

```prisma
model ImpersonationSession {
  id                String    @id @default(uuid()) @db.Uuid
  staffId           String    @map("staff_id") @db.Uuid
  organizationId    String    @map("organization_id") @db.Uuid
  impersonatedUserId String    @map("impersonated_user_id") @db.Uuid
  
  ticketRef         String    @map("ticket_ref") @db.VarChar(100)
  sessionTokenHash  String    @map("session_token_hash") @db.VarChar(255)
  
  startedAt         DateTime  @default(now()) @map("started_at") @db.Timestamptz(6)
  expiresAt         DateTime  @map("expires_at") @db.Timestamptz(6)
  terminatedAt      DateTime? @map("terminated_at") @db.Timestamptz(6)
  terminationReason String?   @map("termination_reason") @db.VarChar(100)
  
  clientIp          String    @map("client_ip") @db.VarChar(45)
  userAgent         String?   @map("user_agent") @db.Text
  
  createdAt         DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)

  // Relations
  staff PlatformStaff @relation(fields: [staffId], references: [id])

  @@index([staffId, expiresAt])
  @@index([organizationId, startedAt])
  @@map("impersonation_session")
  @@schema("platform")
}
```

---

### 2.5 Table: `platform.platform_audit_event`
Immutable, append-only operational audit log for all actions executed in the Super Admin console.

```prisma
model PlatformAuditEvent {
  id          String   @id @default(uuid()) @db.Uuid
  actorId     String   @map("actor_id") @db.Uuid
  actorRole   String   @map("actor_role") @db.VarChar(50)
  
  subjectType String   @map("subject_type") @db.VarChar(50) // TENANT, STAFF, OVERRIDE, RETENTION, LICENSING
  subjectId   String   @map("subject_id") @db.VarChar(255)
  action      String   @db.VarChar(100)
  
  beforeState Json?    @map("before_state") @db.JsonB
  afterState  Json?    @map("after_state") @db.JsonB
  
  reason      String?  @db.Text
  ticketRef   String?  @map("ticket_ref") @db.VarChar(100)
  requestId   String?  @map("request_id") @db.VarChar(100)
  
  ipAddress   String?  @map("ip_address") @db.VarChar(45)
  userAgent   String?  @map("user_agent") @db.Text
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  // Relations
  actor PlatformStaff @relation("ActorAuditEvents", fields: [actorId], references: [id])

  @@index([subjectType, subjectId])
  @@index([actorId, createdAt])
  @@index([createdAt])
  @@map("platform_audit_event")
  @@schema("platform")
}
```

---

### 2.6 Table: `platform.onboarding_draft`
Stores partially completed onboarding wizard steps, enabling draft saving and idempotent resumption.

```prisma
model OnboardingDraft {
  id                 String        @id @default(uuid()) @db.Uuid
  corporateDomain    String        @unique @map("corporate_domain") @db.VarChar(255)
  currentStep        Int           @default(1) @map("current_step")
  draftData          Json          @default("{}") @map("draft_data") @db.JsonB
  createdByStaffId   String        @map("created_by_staff_id") @db.Uuid
  expiresAt          DateTime      @map("expires_at") @db.Timestamptz(6)
  
  createdAt          DateTime      @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt          DateTime      @updatedAt @map("updated_at") @db.Timestamptz(6)

  // Relations
  createdBy PlatformStaff @relation(fields: [createdByStaffId], references: [id])

  @@map("onboarding_draft")
  @@schema("platform")
}
```

---

### 2.7 Table: `platform.incident_window`
Declares platform or tenant-specific incident windows for proctoring failure tracking and Half 2 T3 auto-reversals.

```prisma
enum IncidentScopeType {
  PLATFORM_WIDE
  TENANT_SPECIFIC

  @@schema("platform")
}

enum IncidentStatus {
  ACTIVE
  RESOLVED

  @@schema("platform")
}

model IncidentWindow {
  id                   String            @id @default(uuid()) @db.Uuid
  title                String            @db.VarChar(255)
  description          String            @db.Text
  scopeType            IncidentScopeType @map("scope_type")
  targetOrganizationId String?           @map("target_organization_id") @db.Uuid
  
  startedAt            DateTime          @map("started_at") @db.Timestamptz(6)
  endedAt              DateTime?         @map("ended_at") @db.Timestamptz(6)
  declaredByStaffId    String            @map("declared_by_staff_id") @db.Uuid
  ticketRef            String            @map("ticket_ref") @db.VarChar(100)
  status               IncidentStatus    @default(ACTIVE)
  
  createdAt            DateTime          @default(now()) @map("created_at") @db.Timestamptz(6)

  // Relations
  declaredBy PlatformStaff @relation(fields: [declaredByStaffId], references: [id])

  @@index([status, startedAt])
  @@map("incident_window")
  @@schema("platform")
}
```

---

## 3. PostgreSQL Raw SQL DDL, Triggers & Invariants

```sql
-- 1. Create Schema
CREATE SCHEMA IF NOT EXISTS platform;

-- 2. Enforce Immutable Append-Only Audit Log
CREATE OR REPLACE FUNCTION platform.fn_forbid_platform_audit_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'MUTATION_FORBIDDEN: platform_audit_event records are strictly immutable and append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_forbid_platform_audit_mutation ON platform.platform_audit_event;
CREATE TRIGGER trg_forbid_platform_audit_mutation
BEFORE UPDATE OR DELETE OR TRUNCATE ON platform.platform_audit_event
FOR EACH STATEMENT EXECUTE FUNCTION platform.fn_forbid_platform_audit_mutation();

-- 3. Check Constraint on Appeal Window Override (14 to 365 days)
ALTER TABLE platform.tenant_profile
  ADD CONSTRAINT chk_appeal_window_bounds
  CHECK (appeal_window_days_override IS NULL OR (appeal_window_days_override >= 14 AND appeal_window_days_override <= 365));

-- 4. Check Constraint on Override Duration (Expiry <= 72h from active_from for Sensitivity)
ALTER TABLE platform.override_action
  ADD CONSTRAINT chk_override_sensitivity_duration
  CHECK (
    override_type != 'PROCTORING_SENSITIVITY' 
    OR (expires_at IS NOT NULL AND expires_at <= active_from + INTERVAL '72 hours')
  );

-- 5. Role Grants
GRANT USAGE ON SCHEMA platform TO proctora_platform;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA platform TO proctora_platform;
REVOKE UPDATE, DELETE, TRUNCATE ON platform.platform_audit_event FROM proctora_platform;

-- Runtime app role has NO access to platform schema
REVOKE ALL ON SCHEMA platform FROM proctora_app;
```
