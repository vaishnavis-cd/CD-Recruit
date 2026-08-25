import { PrismaClient, ModuleType, QuestionStatus } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../../.env') });
dotenv.config({ path: path.join(__dirname, '../../.env') });
dotenv.config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();

const DEPT_MAP: Record<string, string> = {
  SDE: 'SOFTWARE_ENGINEERING',
  DATA_ENGINEERING: 'DATA_ENGINEERING',
  QA: 'QA',
  SRE: 'SRE',
  SYSOPS: 'SYSOPS',
  ITOPS: 'ITOPS',
  PMO: 'PMO',
  SECOPS: 'SECOPS',
};

const MODULE_MAP: Record<string, ModuleType> = {
  MCQ: ModuleType.MCQ,
  SQL: ModuleType.SQL,
  CODING: ModuleType.CODING,
  DEBUGGING: ModuleType.DEBUGGING,
  AI_PROMPTING: ModuleType.AI_PROMPTING,
  CONTEXT_SIMULATION: ModuleType.SIMULATION,
  TEST_SCENARIOS: ModuleType.TEST_SCENARIOS,
};

async function main() {
  const jsonPath = path.join(__dirname, '../../prisma/data/proctora_question_bank.json');
  console.log(`Loading Proctora Question Bank from ${jsonPath}...`);

  const fileData = fs.readFileSync(jsonPath, 'utf8');
  const json = JSON.parse(fileData);
  const questionsData = json.questions || [];

  console.log(`Total input questions: ${questionsData.length}`);

  let totalInserted = 0;
  let totalSkipped = 0;
  let totalRejected = 0;

  const existingDbQuestions = await prisma.question.findMany({
    select: { id: true, role: true, moduleType: true, content: true },
  });

  const existingMap = new Set<string>();
  existingDbQuestions.forEach((q) => {
    const c = q.content as any;
    const prompt = (c?.prompt || c?.title || c?.question || '').trim().toLowerCase();
    if (prompt) {
      existingMap.add(`${q.role}:${q.moduleType}:${prompt}`);
    }
  });

  await prisma.$transaction(
    async (tx) => {
      for (const q of questionsData) {
        const role = DEPT_MAP[q.department] || q.department;
        const moduleType = MODULE_MAP[q.module] || (q.module as ModuleType);
        const prompt = (q.question || '').trim();
        const promptKey = `${role}:${moduleType}:${prompt.toLowerCase()}`;

        if (existingMap.has(promptKey)) {
          totalSkipped++;
          continue;
        }

        const difficulty = (q.difficulty || 'MEDIUM').toLowerCase();
        const categoryTag = (q.category || '').toLowerCase();
        const tags = [
          q.department.toLowerCase(),
          q.module.toLowerCase(),
          difficulty,
        ];
        if (categoryTag) tags.push(categoryTag);

        let contentObj: any = {
          prompt: q.question,
          question: q.question,
          category: q.category,
          estimatedTimeMinutes: q.estimatedTimeMinutes,
          difficulty: q.difficulty,
        };

        let scoringConfig: any = {};

        if (q.module === 'MCQ') {
          contentObj.options = q.options;
          contentObj.correctAnswer = q.correctAnswer;
          const correctIdx = Array.isArray(q.options) ? q.options.indexOf(q.correctAnswer) : -1;
          contentObj.correctIndex = correctIdx >= 0 ? correctIdx : 0;
          scoringConfig = { correctIndex: contentObj.correctIndex, points: 1 };
        } else if (q.module === 'SQL') {
          contentObj.expectedAnswer = q.expectedAnswer;
          contentObj.schema = `-- Schema for ${q.category}\n-- Target Department: ${q.department}`;
          contentObj.seedData = `-- Seed data for ${q.category}`;
          scoringConfig = { expectedAnswer: q.expectedAnswer, points: 1 };
        } else if (q.module === 'CODING') {
          contentObj.expectedAnswer = q.expectedAnswer;
          contentObj.language = q.language || 'Python';
          contentObj.starterCode = `# Starter code for ${q.category}\n# Problem: ${q.question}\n`;
          scoringConfig = { expectedAnswer: q.expectedAnswer, points: 1 };
        } else if (q.module === 'DEBUGGING') {
          contentObj.expectedAnswer = q.expectedAnswer;
          contentObj.language = q.language || 'General';
          contentObj.buggyCode = `# Buggy code scenario for ${q.category}\n`;
          scoringConfig = { expectedAnswer: q.expectedAnswer, points: 1 };
        } else if (q.module === 'AI_PROMPTING') {
          contentObj.expectedAnswer = q.expectedAnswer;
          contentObj.rubric = q.expectedAnswer;
          scoringConfig = { rubric: q.expectedAnswer, points: 1 };
        } else if (q.module === 'CONTEXT_SIMULATION') {
          contentObj.title = q.question;
          contentObj.expectedAnswer = q.expectedAnswer;
          contentObj.rubric = [{ criterion: 'Response Appropriateness', weight: 1.0 }];
          contentObj.triggers = [{ id: 'trigger_1', type: 'user_prompt', prompt: q.question }];
          scoringConfig = { expectedAnswer: q.expectedAnswer, points: 1 };
        } else if (q.module === 'TEST_SCENARIOS') {
          contentObj.expectedAnswer = q.expectedAnswer;
          scoringConfig = { expectedAnswer: q.expectedAnswer, points: 1 };
        }

        await tx.question.create({
          data: {
            moduleType,
            role,
            content: contentObj,
            scoringConfig,
            difficulty,
            tags,
            version: 1,
            status: QuestionStatus.PUBLISHED,
          },
        });

        totalInserted++;
        existingMap.add(promptKey);
      }
    },
    { timeout: 60000 },
  );

  console.log(`========================================`);
  console.log(`IMPORT COMPLETE`);
  console.log(`Total Inserted: ${totalInserted}`);
  console.log(`Total Skipped (already existed): ${totalSkipped}`);
  console.log(`Total Rejected: ${totalRejected}`);
  console.log(`========================================`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Import failed:', err);
  process.exit(1);
});
