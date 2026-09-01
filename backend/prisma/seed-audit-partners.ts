import { PrismaClient } from "@prisma/client";
import * as crypto from "crypto";

const prisma = new PrismaClient();

async function main() {
  const staff = await prisma.staff.findFirst();
  if (!staff) {
    console.error("No staff found in DB.");
    return;
  }

  console.log(`Seeding audit logs & partners for staff: ${staff.name} (${staff.id})...`);

  // Seed sample audit logs
  const auditCount = await prisma.auditLog.count();
  if (auditCount === 0) {
    const auditEntries = [
      {
        staffId: staff.id,
        action: "UPDATE_ROLE",
        entityType: "STAFF",
        entityId: staff.id,
        metadata: { target: "evaluator@proctora.com", oldRole: "RECRUITER", newRole: "ADMIN" },
        occurredAt: new Date(Date.now() - 10 * 60 * 1000),
      },
      {
        staffId: staff.id,
        action: "UPDATE_RETENTION_SCHEDULE",
        entityType: "SYSTEM_SETTINGS",
        entityId: "retention-config",
        metadata: { biometricRetentionDays: 90 },
        occurredAt: new Date(Date.now() - 45 * 60 * 1000),
      },
      {
        staffId: staff.id,
        action: "UPDATE_SYSTEM_TIMING",
        entityType: "SYSTEM_SETTINGS",
        entityId: "system-timing-config",
        metadata: { heartbeatStaleThresholdSeconds: 45, graceWindowSeconds: 300, maxDisconnectCount: 3 },
        occurredAt: new Date(Date.now() - 2 * 3600 * 1000),
      },
      {
        staffId: staff.id,
        action: "UPDATE_SCORING_CONFIG",
        entityType: "SYSTEM_SETTINGS",
        entityId: "scoring-config",
        metadata: { aiConfidenceThreshold: 0.8, passRateThreshold: 0.7, aiIntensity: "HIGH" },
        occurredAt: new Date(Date.now() - 5 * 3600 * 1000),
      },
      {
        staffId: staff.id,
        action: "CREATE_DRIVE",
        entityType: "DRIVE",
        entityId: "drive-q3-2026",
        metadata: { name: "Software Developer Drive - July 2026", category: "COLLEGE" },
        occurredAt: new Date(Date.now() - 24 * 3600 * 1000),
      },
      {
        staffId: staff.id,
        action: "SEND_INVITE",
        entityType: "INVITE",
        entityId: "invite-alice",
        metadata: { candidateEmail: "alice.johnson@example.com" },
        occurredAt: new Date(Date.now() - 26 * 3600 * 1000),
      },
    ];

    for (const a of auditEntries) {
      await prisma.auditLog.create({ data: a });
    }
    console.log(`✔ Seeded ${auditEntries.length} audit log entries.`);
  }

  // Seed sample partner integrations
  const partnerCount = await prisma.partner.count();
  if (partnerCount === 0) {
    const partners = [
      {
        name: "Greenhouse ATS Integration",
        hashedApiKey: crypto.createHash("sha256").update("gh_live_sample_key_12345").digest("hex"),
        callbackUrl: "https://api.greenhouse.io/v1/proctora-webhook",
        rateLimit: 250,
        isRevoked: false,
        apiHitCount: 1420,
      },
      {
        name: "Lever Candidate Sync",
        hashedApiKey: crypto.createHash("sha256").update("lever_live_sample_key_67890").digest("hex"),
        callbackUrl: "https://api.lever.co/v1/hooks/assessment-results",
        rateLimit: 100,
        isRevoked: false,
        apiHitCount: 890,
      },
      {
        name: "Workday HR Core API",
        hashedApiKey: crypto.createHash("sha256").update("wd_live_sample_key_abcdef").digest("hex"),
        callbackUrl: "https://wd5-services1.myworkday.com/ccx/service/customreport2",
        rateLimit: 500,
        isRevoked: false,
        apiHitCount: 3200,
      },
    ];

    for (const p of partners) {
      await prisma.partner.create({ data: p });
    }
    console.log(`✔ Seeded ${partners.length} partner integration records.`);
  }
}

main()
  .catch((err) => {
    console.error("Failed to seed audit logs & partners:", err);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
