import { PrismaClient, PoolType, GrantSource, PoolStatus } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding Billing Accounts, Pools, and Organization...");

  // 1. Create or Find Billing Account
  let billingAccount = await prisma.billingAccount.findFirst({
    where: { name: "Default Enterprise Billing" },
  });

  if (!billingAccount) {
    billingAccount = await prisma.billingAccount.create({
      data: {
        name: "Default Enterprise Billing",
        legalEntityName: "CD-Recruit Global Labs Pvt Ltd",
        billingCountry: "IND",
        currency: "INR",
        taxId: "29AAAAA0000A1Z5",
        status: "ACTIVE",
        overdraftLimit: 0,
        overdraftUsed: 0,
        hasPaidPurchase: true,
      },
    });
    console.log(`✔ Created Billing Account: ${billingAccount.id}`);
  }

  // 2. Create or Find Organization
  let org = await prisma.organization.findFirst({
    where: { slug: "cd-recruit-corp" },
  });

  if (!org) {
    org = await prisma.organization.create({
      data: {
        name: "CD-Recruit Enterprise",
        slug: "cd-recruit-corp",
        billingAccountId: billingAccount.id,
      },
    });
    console.log(`✔ Created Organization: ${org.id}`);
  } else {
    await prisma.organization.update({
      where: { id: org.id },
      data: { billingAccountId: billingAccount.id },
    });
  }

  // 3. Link all staff without organization to this organization
  const updatedStaff = await prisma.staff.updateMany({
    where: { organizationId: null },
    data: { organizationId: org.id },
  });
  console.log(`✔ Linked ${updatedStaff.count} staff members to Organization ${org.id}`);

  // 4. Ensure Credit Pools exist for this Billing Account
  const existingPools = await prisma.creditPool.findMany({
    where: { billingAccountId: billingAccount.id },
  });

  if (existingPools.length === 0) {
    const now = new Date();
    const ninetyDays = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

    // Active Talent Reserve Pool
    await prisma.creditPool.create({
      data: {
        billingAccountId: billingAccount.id,
        poolType: PoolType.TALENT_RESERVE,
        name: "FY26 Q3 Enterprise Talent Pack",
        source: GrantSource.PURCHASE,
        totalCredits: 500,
        cachedRemaining: 342,
        validityDays: 90,
        status: PoolStatus.ACTIVE,
        activatedAt: now,
        clockStartedAt: now,
        expiresAt: ninetyDays,
      },
    });

    // Active Drive Pass Pool
    await prisma.creditPool.create({
      data: {
        billingAccountId: billingAccount.id,
        poolType: PoolType.DRIVE_PASS,
        name: "Campus Drive 2026 Batch A Pass",
        source: GrantSource.PURCHASE,
        totalCredits: 100,
        cachedRemaining: 78,
        validityDays: 30,
        status: PoolStatus.ACTIVE,
        activatedAt: now,
        clockStartedAt: now,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    // Queued Auto-Promotion Pool (Jio Model)
    await prisma.creditPool.create({
      data: {
        billingAccountId: billingAccount.id,
        poolType: PoolType.TALENT_RESERVE,
        name: "FY26 Q4 Reserved Buffer Pack",
        source: GrantSource.CONTRACT,
        totalCredits: 250,
        cachedRemaining: 250,
        validityDays: 90,
        maxWaitDays: 365,
        queueOrder: 1,
        status: PoolStatus.QUEUED,
      },
    });

    console.log("✔ Created 3 demonstration credit pools (2 Active, 1 Queued)");
  }

  console.log("✨ Billing seeding completed successfully!");
}

main()
  .catch((e) => {
    console.error("Error seeding billing:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
