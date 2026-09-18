import { PartnerApiKeyGuard } from "./partner-api-key.guard";
import { hashApiKey } from "../utils/api-key.util";
import assert from "node:assert";

async function runPartnerApiKeyGuardTests() {
  console.log("Running characterization tests for PartnerApiKeyGuard...");

  const rawKey = "test_partner_secret_key_12345";
  const hashedKey = hashApiKey(rawKey);

  const mockPartner = {
    id: "partner-uuid-1",
    name: "Acme ATS Partner",
    hashedApiKey: hashedKey,
    callbackUrl: "https://partner.example.com/webhook",
    rateLimit: 100,
    createdAt: new Date(),
  };

  let updateCalledWith: any = null;
  const mockPrisma: any = {
    partner: {
      findFirst: async ({ where }: any) => {
        if (where?.hashedApiKey === hashedKey && where?.isRevoked === false) {
          return mockPartner;
        }
        return null;
      },
      update: async (args: any) => {
        updateCalledWith = args;
        return { ...mockPartner, apiHitCount: 1 };
      },
    },
  };

  const guard = new PartnerApiKeyGuard(mockPrisma);

  const createMockContext = (headers: Record<string, string>) => {
    const req: any = { headers };
    return {
      switchToHttp: () => ({
        getRequest: () => req,
      }),
      req,
    };
  };

  // Test 1: Throws UnauthorizedException when X-API-Key header is missing
  let missingKeyError = false;
  try {
    const ctx = createMockContext({});
    await guard.canActivate(ctx as any);
  } catch (err: any) {
    missingKeyError = true;
    assert.strictEqual(err.message, "Missing required X-API-Key header");
  }
  assert.strictEqual(missingKeyError, true, "Should throw UnauthorizedException on missing header");
  console.log("  ✔ Throws UnauthorizedException on missing X-API-Key header");

  // Test 2: Throws UnauthorizedException when X-API-Key header is invalid
  let invalidKeyError = false;
  try {
    const ctx = createMockContext({ "x-api-key": "invalid_secret_key" });
    await guard.canActivate(ctx as any);
  } catch (err: any) {
    invalidKeyError = true;
    assert.strictEqual(err.message, "Invalid or revoked X-API-Key");
  }
  assert.strictEqual(invalidKeyError, true, "Should throw UnauthorizedException on invalid API key");
  console.log("  ✔ Throws UnauthorizedException on invalid X-API-Key");

  // Test 3: Validates key, attaches partner to request, returns true, and increments apiHitCount
  const validCtx = createMockContext({ "x-api-key": rawKey });
  const result = await guard.canActivate(validCtx as any);
  assert.strictEqual(result, true);
  assert.strictEqual(validCtx.req.partner.id, "partner-uuid-1");
  assert.strictEqual(validCtx.req.partner.name, "Acme ATS Partner");
  assert.deepStrictEqual(updateCalledWith, {
    where: { id: "partner-uuid-1" },
    data: { apiHitCount: { increment: 1 } },
  });
  console.log("  ✔ Validates key, attaches partner to request, and increments apiHitCount");

  console.log("✅ All PartnerApiKeyGuard characterization tests passed successfully!");
}

runPartnerApiKeyGuardTests().catch((err) => {
  console.error("❌ PartnerApiKeyGuard tests failed:", err);
  process.exit(1);
});
