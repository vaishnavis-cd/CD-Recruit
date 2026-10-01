import assert from "node:assert";
import { UnauthorizedException, ForbiddenException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { PlatformStaffRole, StaffRole } from "@cd-recruit/shared-types";
import { PlatformAuthService } from "./platform-auth.service";
import { PlatformJwtStrategy } from "./strategies/platform-jwt.strategy";
import { PlatformRolesGuard } from "./guards/platform-roles.guard";
import { JwtStrategy as RecruiterJwtStrategy } from "../../auth/strategies/jwt.strategy";
import { AuthService as RecruiterAuthService } from "../../auth/auth.service";
import { hashPassword } from "../../common/utils/password.util";

async function runPlatformAuthTests() {
  console.log("================================================================================");
  console.log("Running Characterization & Security Boundary Tests for Platform Authentication");
  console.log("================================================================================");

  let testPassed = 0;
  let testTotal = 0;

  function pass(msg: string) {
    testTotal++;
    testPassed++;
    console.log(`✅ PASS [${testTotal}]: ${msg}`);
  }

  const testPlatformSecret = "test-platform-jwt-secret-xyz";
  const testRecruiterSecret = "test-recruiter-jwt-secret-abc";

  const configService: any = {
    get: (key: string) => {
      if (key === "app.platformJwtSecret") return testPlatformSecret;
      if (key === "app.jwtSecret") return testRecruiterSecret;
      return null;
    },
  };

  const platformJwtService = new JwtService({
    secret: testPlatformSecret,
    signOptions: { expiresIn: "15m", issuer: "proctora-platform" },
  });

  const recruiterJwtService = new JwtService({
    secret: testRecruiterSecret,
    signOptions: { expiresIn: "15m" },
  });

  // Mock in-memory database
  const passwordHash = await hashPassword("password");
  const platformStaffDb: any[] = [
    {
      id: "owner-uuid-1",
      email: "owner@cdrecruit.local",
      name: "Platform Owner",
      role: "OWNER",
      passwordHash,
      mfaEnabled: true,
      isActive: true,
      createdAt: new Date(),
    },
    {
      id: "finance-uuid-2",
      email: "finance@cdrecruit.local",
      name: "Platform Finance",
      role: "FINANCE",
      passwordHash,
      mfaEnabled: false,
      isActive: true,
      createdAt: new Date(),
    },
    {
      id: "support-uuid-3",
      email: "support@cdrecruit.local",
      name: "Platform Support",
      role: "SUPPORT",
      passwordHash,
      mfaEnabled: false,
      isActive: true,
      createdAt: new Date(),
    },
    {
      id: "inactive-uuid-4",
      email: "inactive@cdrecruit.local",
      name: "Inactive Staff",
      role: "SUPPORT",
      passwordHash,
      mfaEnabled: false,
      isActive: false,
      createdAt: new Date(),
    },
  ];

  const recruiterStaffDb: any[] = [
    {
      id: "recruiter-uuid-10",
      email: "recruiter@acme.corp",
      name: "Jane Recruiter",
      role: StaffRole.HR_LEAD,
      passwordHash,
      isActive: true,
      createdAt: new Date(),
    },
  ];

  const mockPrisma: any = {
    platformStaff: {
      findUnique: async ({ where }: any) => {
        if (where.email) {
          return platformStaffDb.find((s) => s.email.toLowerCase() === where.email.toLowerCase()) || null;
        }
        if (where.id) {
          return platformStaffDb.find((s) => s.id === where.id) || null;
        }
        return null;
      },
      findFirst: async ({ where }: any) => {
        if (where.refreshTokenHash) {
          return platformStaffDb.find((s) => s.refreshTokenHash === where.refreshTokenHash) || null;
        }
        return null;
      },
      update: async ({ where, data }: any) => {
        const staff = platformStaffDb.find((s) => s.id === where.id);
        if (staff) Object.assign(staff, data);
        return staff;
      },
    },
    staff: {
      findUnique: async ({ where }: any) => {
        if (where.email) {
          return recruiterStaffDb.find((s) => s.email.toLowerCase() === where.email.toLowerCase()) || null;
        }
        if (where.id) {
          return recruiterStaffDb.find((s) => s.id === where.id) || null;
        }
        return null;
      },
      findFirst: async ({ where }: any) => {
        if (where.refreshTokenHash) {
          return recruiterStaffDb.find((s) => s.refreshTokenHash === where.refreshTokenHash) || null;
        }
        return null;
      },
      update: async ({ where, data }: any) => {
        const staff = recruiterStaffDb.find((s) => s.id === where.id);
        if (staff) Object.assign(staff, data);
        return staff;
      },
    },
  };

  const mockAuditService: any = {
    record: jest.fn().mockResolvedValue({ id: 'mock-audit-id' }),
  };

  const platformAuthService = new PlatformAuthService(
    platformJwtService,
    configService,
    mockPrisma,
    mockAuditService,
  );

  const platformJwtStrategy = new PlatformJwtStrategy(
    configService,
    mockPrisma,
  );

  const recruiterAuthService = new RecruiterAuthService(
    recruiterJwtService,
    configService,
    mockPrisma,
  );

  const recruiterJwtStrategy = new RecruiterJwtStrategy(
    configService,
    mockPrisma,
  );

  // ---------------------------------------------------------------------------
  // TEST 1: Valid platform OWNER credentials (mfa_enabled = true)
  // ---------------------------------------------------------------------------
  console.log("\n[TEST 1] Testing valid platform OWNER credentials...");
  const ownerLoginRes = await platformAuthService.login({
    email: "owner@cdrecruit.local",
    password: "password",
  });
  assert.strictEqual(ownerLoginRes.mfaRequired, true, "Must require MFA for OWNER account");
  assert.ok("mfaChallengeToken" in ownerLoginRes, "Must issue mfaChallengeToken");
  assert.strictEqual((ownerLoginRes as any).accessToken, undefined, "Must NOT issue accessToken without MFA");
  assert.strictEqual(ownerLoginRes.staff.role, PlatformStaffRole.OWNER);
  pass("Valid platform OWNER credentials authenticate and enforce MFA challenge boundary");

  // Also verify staff with mfaEnabled = false receives restricted setupToken for enrollment
  const financeLoginRes = await platformAuthService.login({
    email: "finance@cdrecruit.local",
    password: "password",
  });
  assert.strictEqual(financeLoginRes.mfaRequired, false);
  assert.strictEqual(financeLoginRes.mfaSetupRequired, true);
  assert.ok(financeLoginRes.setupToken);
  pass("Valid platform staff with mfaEnabled = false receives restricted setupToken for mandatory enrollment");

  // ---------------------------------------------------------------------------
  // TEST 2: Invalid password
  // ---------------------------------------------------------------------------
  console.log("\n[TEST 2] Testing invalid password...");
  await assert.rejects(
    async () => {
      await platformAuthService.login({
        email: "owner@cdrecruit.local",
        password: "wrong-password",
      });
    },
    (err: any) => err instanceof UnauthorizedException && err.message === "Invalid email or password",
  );
  pass("Invalid password rejected safely with UnauthorizedException");

  // ---------------------------------------------------------------------------
  // TEST 3: Unknown platform email
  // ---------------------------------------------------------------------------
  console.log("\n[TEST 3] Testing unknown platform email...");
  await assert.rejects(
    async () => {
      await platformAuthService.login({
        email: "nonexistent@cdrecruit.local",
        password: "password",
      });
    },
    (err: any) => err instanceof UnauthorizedException && err.message === "Invalid email or password",
  );
  pass("Unknown platform email rejected safely with UnauthorizedException");

  // ---------------------------------------------------------------------------
  // TEST 4: Inactive platform staff rejected
  // ---------------------------------------------------------------------------
  console.log("\n[TEST 4] Testing inactive platform staff...");
  await assert.rejects(
    async () => {
      await platformAuthService.login({
        email: "inactive@cdrecruit.local",
        password: "password",
      });
    },
    (err: any) => err instanceof UnauthorizedException,
  );
  pass("Inactive platform staff rejected with UnauthorizedException");

  // ---------------------------------------------------------------------------
  // TEST 5: Valid platform JWT accepted by PlatformJwtAuthGuard / Strategy
  // ---------------------------------------------------------------------------
  console.log("\n[TEST 5] Testing valid platform JWT accepted...");
  const validOwnerPayload = {
    sub: "owner-uuid-1",
    email: "owner@cdrecruit.local",
    name: "Platform Owner",
    platformRole: PlatformStaffRole.OWNER,
    type: "platform_staff",
    iss: "proctora-platform",
  };
  const validatedUser = await platformJwtStrategy.validate(validOwnerPayload);
  assert.strictEqual(validatedUser.id, "owner-uuid-1");
  assert.strictEqual(validatedUser.platformRole, PlatformStaffRole.OWNER);
  assert.strictEqual(validatedUser.isPlatformStaff, true);
  pass("Valid platform JWT validated and yields PlatformStaff identity");

  // ---------------------------------------------------------------------------
  // TEST 6: Recruiter JWT rejected by PlatformJwtAuthGuard / Strategy
  // ---------------------------------------------------------------------------
  console.log("\n[TEST 6] Testing recruiter JWT rejected by Platform strategy...");
  const recruiterPayload: any = {
    sub: "recruiter-uuid-10",
    email: "recruiter@acme.corp",
    name: "Jane Recruiter",
    role: StaffRole.HR_LEAD,
    // recruiter tokens lack type: 'platform_staff' and iss: 'proctora-platform'
  };
  await assert.rejects(
    async () => {
      await platformJwtStrategy.validate(recruiterPayload);
    },
    (err: any) => err instanceof UnauthorizedException,
  );
  pass("Recruiter JWT rejected by PlatformJwtStrategy (invalid token type / missing platform claims)");

  // ---------------------------------------------------------------------------
  // TEST 7: Missing token rejected
  // ---------------------------------------------------------------------------
  console.log("\n[TEST 7] Testing missing token...");
  const secretCallback: any = (platformJwtStrategy as any)._secretOrKeyProvider;
  await new Promise<void>((resolve, reject) => {
    secretCallback({}, null, (err: any) => {
      if (err instanceof UnauthorizedException) {
        resolve();
      } else {
        reject(new Error("Expected UnauthorizedException on missing token"));
      }
    });
  });
  pass("Missing token rejected with UnauthorizedException");

  // ---------------------------------------------------------------------------
  // TEST 8: Malformed / invalid token rejected
  // ---------------------------------------------------------------------------
  console.log("\n[TEST 8] Testing malformed / invalid tokens...");
  await new Promise<void>((resolve, reject) => {
    secretCallback({}, "not.a.valid.jwt", (err: any) => {
      if (err instanceof UnauthorizedException && err.message === "MALFORMED_JWT") {
        resolve();
      } else {
        reject(new Error("Expected MALFORMED_JWT UnauthorizedException"));
      }
    });
  });

  // Verify MFA challenge token cannot be used as Bearer token on protected routes
  const mfaChallengePayload: any = {
    sub: "owner-uuid-1",
    email: "owner@cdrecruit.local",
    type: "platform_mfa_challenge", // Not platform_staff!
    iss: "proctora-platform",
    platformRole: PlatformStaffRole.OWNER,
  };
  await assert.rejects(
    async () => {
      await platformJwtStrategy.validate(mfaChallengePayload);
    },
    (err: any) => err instanceof UnauthorizedException && err.message === "INVALID_TOKEN_TYPE",
  );
  pass("Malformed tokens and MFA challenge tokens rejected on protected platform routes");

  // ---------------------------------------------------------------------------
  // TEST 9: SUPPORT role recognized correctly
  // ---------------------------------------------------------------------------
  console.log("\n[TEST 9] Testing SUPPORT role recognition...");
  const supportPayload = {
    sub: "support-uuid-3",
    email: "support@cdrecruit.local",
    name: "Platform Support",
    platformRole: PlatformStaffRole.SUPPORT,
    type: "platform_staff",
    iss: "proctora-platform",
  };
  const supportUser = await platformJwtStrategy.validate(supportPayload);
  assert.strictEqual(supportUser.platformRole, PlatformStaffRole.SUPPORT);

  const mockReflectorSupport: any = {
    getAllAndOverride: () => [PlatformStaffRole.SUPPORT],
  };
  const supportRoleGuard = new PlatformRolesGuard(mockReflectorSupport);
  const supportContext: any = {
    switchToHttp: () => ({
      getRequest: () => ({ user: supportUser }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  };
  assert.strictEqual(supportRoleGuard.canActivate(supportContext), true);
  pass("SUPPORT role recognized correctly and passes PlatformRolesGuard for SUPPORT routes");

  // ---------------------------------------------------------------------------
  // TEST 10: FINANCE role recognized correctly
  // ---------------------------------------------------------------------------
  console.log("\n[TEST 10] Testing FINANCE role recognition...");
  const financePayload = {
    sub: "finance-uuid-2",
    email: "finance@cdrecruit.local",
    name: "Platform Finance",
    platformRole: PlatformStaffRole.FINANCE,
    type: "platform_staff",
    iss: "proctora-platform",
  };
  const financeUser = await platformJwtStrategy.validate(financePayload);
  assert.strictEqual(financeUser.platformRole, PlatformStaffRole.FINANCE);

  const mockReflectorFinance: any = {
    getAllAndOverride: () => [PlatformStaffRole.FINANCE],
  };
  const financeRoleGuard = new PlatformRolesGuard(mockReflectorFinance);
  const financeContext: any = {
    switchToHttp: () => ({
      getRequest: () => ({ user: financeUser }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  };
  assert.strictEqual(financeRoleGuard.canActivate(financeContext), true);
  pass("FINANCE role recognized correctly and passes PlatformRolesGuard for FINANCE routes");

  // ---------------------------------------------------------------------------
  // TEST 11: OWNER role recognized correctly (platform-wide hierarchy)
  // ---------------------------------------------------------------------------
  console.log("\n[TEST 11] Testing OWNER role recognition...");
  const ownerUser = await platformJwtStrategy.validate(validOwnerPayload);
  assert.strictEqual(ownerUser.platformRole, PlatformStaffRole.OWNER);

  // OWNER must pass FINANCE-restricted routes per ADR-002 and Artifact 06
  const ownerInFinanceContext: any = {
    switchToHttp: () => ({
      getRequest: () => ({ user: ownerUser }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  };
  assert.strictEqual(financeRoleGuard.canActivate(ownerInFinanceContext), true);
  pass("OWNER role recognized correctly with platform-wide administrative access");

  // ---------------------------------------------------------------------------
  // TEST 12: Unauthorized role rejected where endpoint requires another role
  // ---------------------------------------------------------------------------
  console.log("\n[TEST 12] Testing unauthorized role rejection...");
  // SUPPORT staff trying to access FINANCE-restricted endpoint
  const supportInFinanceContext: any = {
    switchToHttp: () => ({
      getRequest: () => ({ user: supportUser }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  };
  assert.throws(
    () => {
      financeRoleGuard.canActivate(supportInFinanceContext);
    },
    (err: any) => err instanceof ForbiddenException && err.message === "INSUFFICIENT_PLATFORM_PERMISSIONS",
  );
  pass("SUPPORT role rejected on FINANCE-restricted endpoint with ForbiddenException");

  // ---------------------------------------------------------------------------
  // TEST 13: Existing recruiter authentication regression
  // ---------------------------------------------------------------------------
  console.log("\n[TEST 13] Testing existing recruiter authentication regression...");
  const recruiterLoginRes = await recruiterAuthService.loginStaff({
    email: "recruiter@acme.corp",
    password: "password",
  });
  assert.ok(recruiterLoginRes.accessToken);
  assert.strictEqual(recruiterLoginRes.staff.role, StaffRole.HR_LEAD);
  pass("Existing recruiter login functions identically without regression");

  // ---------------------------------------------------------------------------
  // TEST 14: Existing recruiter-protected route regression (Platform JWT rejected)
  // ---------------------------------------------------------------------------
  console.log("\n[TEST 14] Testing recruiter route rejects Platform token...");
  await assert.rejects(
    async () => {
      await recruiterJwtStrategy.validate(validOwnerPayload as any);
    },
    (err: any) => err instanceof UnauthorizedException && err.message === "PLATFORM_TOKEN_NOT_ALLOWED_ON_TENANT_ROUTE",
  );
  pass("Platform JWT rejected by recruiter JwtStrategy (cross-boundary isolation guaranteed)");

  // ---------------------------------------------------------------------------
  // TEST 15 & 16: Live PostgreSQL Database Integration (Seeded OWNER account)
  // ---------------------------------------------------------------------------
  console.log("\n[TEST 15 & 16] Testing live PostgreSQL database integration...");
  const { PrismaService } = require("../../prisma/prisma.service");
  const livePrisma = new PrismaService();
  try {
    // Seed live owner account in test DB if not present
    const existingOwner = await livePrisma.platformStaff.findUnique({
      where: { email: "owner@cdrecruit.local" },
    });
    if (!existingOwner) {
      const { hashPassword } = require("../../common/utils/password.util");
      await livePrisma.platformStaff.create({
        data: {
          email: "owner@cdrecruit.local",
          name: "Platform Owner",
          role: "OWNER",
          passwordHash: await hashPassword("password"),
          isActive: true,
          mfaEnabled: true,
        },
      });
    }

    const liveAuthService = new PlatformAuthService(platformJwtService, configService, livePrisma, mockAuditService);
    const liveLogin = await liveAuthService.login({
      email: "owner@cdrecruit.local",
      password: "password",
    });
    assert.strictEqual(liveLogin.mfaRequired, true, "Must require MFA on live OWNER");
    assert.ok(liveLogin.mfaChallengeToken, "Must issue challenge token on live OWNER");
    assert.strictEqual(liveLogin.staff.email, "owner@cdrecruit.local");
    assert.strictEqual(liveLogin.staff.role, PlatformStaffRole.OWNER);
    pass("Live PostgreSQL database seeded OWNER authenticates and enforces MFA boundary");

    // Also test dev-token with live DB
    const devTokenRes = await liveAuthService.getDevToken({ role: PlatformStaffRole.OWNER });
    assert.ok(devTokenRes.token);
    assert.strictEqual(devTokenRes.staff.email, "owner@cdrecruit.local");
    pass("Live dev-token generation returns valid signed Platform JWT for development");
  } finally {
    await livePrisma.$disconnect();
  }

  console.log("================================================================================");
  console.log(`Summary: All ${testPassed}/${testTotal} Platform Authentication Tests Passed!`);
  console.log("================================================================================");
}

describe('Platform Auth Security & MFA Tests', () => {
  it('runs all platform auth and security characterization tests', async () => {
    await runPlatformAuthTests();
  }, 60000);
});
