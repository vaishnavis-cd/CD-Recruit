import { PartnerAdminService } from "./partner-admin.service";

async function runPartnerAdminServiceTests() {
  console.log("Running characterization tests for PartnerAdminService...");

  const createdPartners: any[] = [];
  const auditLogs: any[] = [];

  const mockPrisma: any = {
    partner: {
      findMany: async () => createdPartners,
      findUnique: async ({ where }: any) => createdPartners.find((p) => p.id === where.id) || null,
      create: async ({ data }: any) => {
        const record = {
          id: `partner-${createdPartners.length + 1}`,
          ...data,
          isRevoked: false,
          createdAt: new Date(),
        };
        createdPartners.push(record);
        return record;
      },
      update: async ({ where, data }: any) => {
        const p = createdPartners.find((item) => item.id === where.id);
        if (p) Object.assign(p, data);
        return p || data;
      },
    },
    auditLog: {
      create: async ({ data }: any) => {
        auditLogs.push(data);
        return { id: `audit-${auditLogs.length}`, ...data };
      },
    },
  };

  const service = new PartnerAdminService(mockPrisma);

  // 1. Create Partner
  const partner = await service.create(
    { name: "Greenhouse ATS", callbackUrl: "https://greenhouse.io/webhook", rateLimit: 120 },
    "staff-admin-1",
  );

  if (!partner.apiKey.startsWith("pk_live_")) {
    throw new Error(`Expected raw API key to start with pk_live_, got ${partner.apiKey}`);
  }
  if (partner.name !== "Greenhouse ATS") {
    throw new Error(`Expected partner name Greenhouse ATS, got ${partner.name}`);
  }
  if (auditLogs.length !== 1 || auditLogs[0].action !== "PARTNER_CREATED") {
    throw new Error(`Expected PARTNER_CREATED audit log entry, got ${JSON.stringify(auditLogs[0])}`);
  }
  console.log("  ✔ Partner creation issues raw pk_live_ key and writes PARTNER_CREATED AuditLog");

  // 2. List Partners
  const list = await service.list();
  if (list.length !== 1 || list[0].name !== "Greenhouse ATS") {
    throw new Error(`Expected list length 1 with Greenhouse ATS, got ${JSON.stringify(list)}`);
  }
  console.log("  ✔ Partner list returns registered partners");

  // 3. Rotate API Key
  const rotated = await service.rotateKey(partner.id, "staff-admin-1");
  if (!rotated.apiKey.startsWith("pk_live_") || rotated.apiKey === partner.apiKey) {
    throw new Error("Expected new raw API key upon rotation");
  }
  if (auditLogs.length !== 2 || auditLogs[1].action !== "PARTNER_API_KEY_ROTATED") {
    throw new Error(`Expected PARTNER_API_KEY_ROTATED audit log entry`);
  }
  console.log("  ✔ Partner API key rotation generates new key and writes AuditLog");

  // 4. Update Partner
  const updated = await service.update(partner.id, { rateLimit: 200 }, "staff-admin-1");
  if (updated.rateLimit !== 200) {
    throw new Error(`Expected rate limit 200, got ${updated.rateLimit}`);
  }
  if (auditLogs.length !== 3 || auditLogs[2].action !== "PARTNER_UPDATED") {
    throw new Error(`Expected PARTNER_UPDATED audit log entry`);
  }
  console.log("  ✔ Partner config update modifies record and writes AuditLog");

  // 5. Revoke Partner
  const revoked = await service.revoke(partner.id, "staff-admin-1");
  if (!revoked.isRevoked) {
    throw new Error(`Expected isRevoked true, got ${revoked.isRevoked}`);
  }
  if (auditLogs.length !== 4 || auditLogs[3].action !== "PARTNER_REVOKED") {
    throw new Error(`Expected PARTNER_REVOKED audit log entry`);
  }
  console.log("  ✔ Partner revocation sets isRevoked = true and writes AuditLog");

  console.log("✅ All PartnerAdminService characterization tests passed successfully!");
}

runPartnerAdminServiceTests().catch((err) => {
  console.error("❌ PartnerAdminService tests failed:", err);
  process.exit(1);
});
