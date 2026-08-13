import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../../.env') });
dotenv.config({ path: path.join(__dirname, '../../.env') });
dotenv.config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();

async function inspectTierAndModules() {
  console.log('============================================================');
  console.log('QUESTION BANK TIER & MODULE DATA INSPECTION');
  console.log('============================================================\n');

  const questions = await prisma.question.findMany();
  console.log(`Total questions in database: ${questions.length}`);

  let tier1Count = 0;
  let tier2Count = 0;
  let missingTierCount = 0;

  const moduleCounts: Record<string, number> = {};
  const deptCounts: Record<string, number> = {};

  for (const q of questions) {
    const tags = (q.tags || []).map((t: string) => t.toLowerCase());
    const contentTier = (q.content as any)?.tier || (q.content as any)?.tierLevel;

    const isTier1 = tags.includes('tier_1') || tags.includes('tier1') || contentTier === 'tier_1' || contentTier === 'TIER_1' || contentTier === 1;
    const isTier2 = tags.includes('tier_2') || tags.includes('tier2') || contentTier === 'tier_2' || contentTier === 'TIER_2' || contentTier === 2;

    if (isTier1) tier1Count++;
    else if (isTier2) tier2Count++;
    else missingTierCount++;

    const mod = q.moduleType || 'UNKNOWN';
    moduleCounts[mod] = (moduleCounts[mod] || 0) + 1;

    const dept = q.role || (q.content as any)?.department || 'UNASSIGNED';
    deptCounts[dept] = (deptCounts[dept] || 0) + 1;
  }

  console.log('\n--- TIER BREAKDOWN ---');
  console.log(`  Tier 1 Questions: ${tier1Count}`);
  console.log(`  Tier 2 Questions: ${tier2Count}`);
  console.log(`  Missing Tier Tags: ${missingTierCount}`);

  console.log('\n--- MODULE TYPE BREAKDOWN ---');
  console.table(moduleCounts);

  console.log('\n--- DEPARTMENT BREAKDOWN ---');
  console.table(deptCounts);

  await prisma.$disconnect();
}

inspectTierAndModules().catch((err) => {
  console.error(err);
  process.exit(1);
});
