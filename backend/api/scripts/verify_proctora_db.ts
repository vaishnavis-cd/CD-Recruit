import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../../.env') });
dotenv.config({ path: path.join(__dirname, '../../.env') });
dotenv.config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();

const DEPT_REVERSE: Record<string, string> = {
  SOFTWARE_ENGINEERING: 'SDE',
  DATA_ENGINEERING: 'DATA_ENGINEERING',
  QA: 'QA',
  SRE: 'SRE',
  SYSOPS: 'SYSOPS',
  ITOPS: 'ITOPS',
  PMO: 'PMO',
  SECOPS: 'SECOPS',
};

async function main() {
  console.log('========================================');
  console.log('PHASE 20 — FINAL DATABASE VERIFICATION');
  console.log('========================================');

  const allQuestions = await prisma.question.findMany();
  console.log(`Total questions in database: ${allQuestions.length}`);

  const counts: Record<string, number> = {};

  let tier1Count = 0;
  let tier2Count = 0;
  let easyCount = 0;
  let mediumCount = 0;
  let hardCount = 0;
  let missingAnswerCount = 0;

  allQuestions.forEach((q) => {
    const dept = DEPT_REVERSE[q.role || ''] || q.role || 'UNKNOWN';
    const mod = q.moduleType;
    const key = `${dept} | ${mod}`;
    counts[key] = (counts[key] || 0) + 1;

    const tags = q.tags || [];
    if (tags.includes('tier_1') || tags.includes('tier1')) tier1Count++;
    if (tags.includes('tier_2') || tags.includes('tier2')) tier2Count++;

    const diff = (q.difficulty || '').toLowerCase();
    if (diff === 'easy') easyCount++;
    else if (diff === 'medium') mediumCount++;
    else if (diff === 'hard') hardCount++;

    const content = q.content as any;
    if (mod === 'MCQ') {
      if (!content.correctAnswer) missingAnswerCount++;
    } else {
      if (!content.expectedAnswer) missingAnswerCount++;
    }
  });

  console.log('\nDepartment | Module | Count Breakdown:');
  const tableData = Object.entries(counts).map(([key, count]) => {
    const [dept, mod] = key.split(' | ');
    return { Department: dept, Module: mod, Count: count };
  });
  console.table(tableData);

  console.log('\nVerification Summary Metrics:');
  console.log(`Tier 1 Count: ${tier1Count}`);
  console.log(`Tier 2 Count: ${tier2Count}`);
  console.log(`Easy Count: ${easyCount}`);
  console.log(`Medium Count: ${mediumCount}`);
  console.log(`Hard Count: ${hardCount}`);
  console.log(`Missing Answer Count: ${missingAnswerCount}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
