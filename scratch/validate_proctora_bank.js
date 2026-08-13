const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const filePath = path.join(__dirname, '../backend/prisma/data/proctora_question_bank.json');

if (!fs.existsSync(filePath)) {
  console.error('File not found:', filePath);
  process.exit(1);
}

const fileContent = fs.readFileSync(filePath, 'utf8');
const data = JSON.parse(fileContent);
const questions = data.questions || [];

console.log('========================================');
console.log('PHASE 2 — QUESTION BANK INSPECTION REPORT');
console.log('========================================');
console.log(`Total questions in JSON: ${questions.length}`);

// 1. Departments present
const deptCounts = {};
const modCounts = {};
const deptModCounts = {};
const diffCounts = {};
const tierCounts = {};
const modTypeCounts = {};

const missingFields = [];
const nullFields = [];
const duplicates = [];
const suspiciousRecords = [];
const mcqAnswerIssues = [];
const sqlStructureIssues = [];

const expectedModules = {
  SDE: ['MCQ', 'SQL', 'CODING', 'DEBUGGING', 'AI_PROMPTING', 'CONTEXT_SIMULATION', 'TEST_SCENARIOS'],
  DATA_ENGINEERING: ['MCQ', 'SQL', 'CODING'],
  QA: ['MCQ', 'SQL', 'CODING', 'DEBUGGING', 'TEST_SCENARIOS'],
  SRE: ['MCQ', 'TEST_SCENARIOS'],
  SYSOPS: ['MCQ', 'TEST_SCENARIOS'],
  ITOPS: ['MCQ', 'TEST_SCENARIOS'],
  PMO: ['MCQ', 'TEST_SCENARIOS'],
  SECOPS: ['MCQ', 'TEST_SCENARIOS'],
};

const seenQuestions = new Map();

questions.forEach((q, index) => {
  const qId = `Q#${index + 1}`;

  // Department
  const dept = q.department;
  deptCounts[dept] = (deptCounts[dept] || 0) + 1;

  // Module
  const mod = q.module;
  modCounts[mod] = (modCounts[mod] || 0) + 1;

  // Dept/Mod
  const key = `${dept}:${mod}`;
  deptModCounts[key] = (deptModCounts[key] || 0) + 1;

  // Difficulty
  const diff = q.difficulty;
  diffCounts[diff] = (diffCounts[diff] || 0) + 1;

  // Tier
  const tier = q.tier;
  tierCounts[tier] = (tierCounts[tier] || 0) + 1;

  // Question Text
  const qText = q.question;

  // Check required fields
  const reqFields = ['department', 'module', 'category', 'difficulty', 'tier', 'estimatedTimeMinutes', 'question'];
  reqFields.forEach((f) => {
    if (q[f] === undefined) missingFields.push({ id: qId, field: f });
    if (q[f] === null) nullFields.push({ id: qId, field: f });
  });

  // Duplicate Check
  const normText = (qText || '').trim().toLowerCase();
  if (normText) {
    if (seenQuestions.has(normText)) {
      duplicates.push({ id: qId, originalId: seenQuestions.get(normText), question: qText });
    } else {
      seenQuestions.set(normText, qId);
    }
  }

  // Module Specific Validation
  if (mod === 'MCQ') {
    if (!Array.isArray(q.options)) {
      suspiciousRecords.push({ id: qId, issue: 'MCQ options is not an array' });
    } else if (q.options.length !== 4) {
      suspiciousRecords.push({ id: qId, issue: `MCQ options length is ${q.options.length} (expected 4)` });
    }

    if (q.correctAnswer === null || q.correctAnswer === undefined) {
      mcqAnswerIssues.push({ id: qId, issue: 'MCQ correctAnswer is null or missing' });
    } else if (Array.isArray(q.options) && !q.options.includes(q.correctAnswer)) {
      mcqAnswerIssues.push({ id: qId, issue: `MCQ correctAnswer "${q.correctAnswer}" not in options [${q.options.join(', ')}]` });
    }
  } else if (mod === 'SQL') {
    if (q.options) {
      sqlStructureIssues.push({ id: qId, issue: 'SQL question contains options field' });
    }
    if (!q.expectedAnswer) {
      sqlStructureIssues.push({ id: qId, issue: 'SQL question missing expectedAnswer' });
    }
  } else {
    // Non-MCQ / Non-SQL
    if (!q.expectedAnswer) {
      suspiciousRecords.push({ id: qId, issue: `${mod} missing expectedAnswer` });
    }
  }
});

console.log('\nDepartments Breakdown:');
console.table(deptCounts);

console.log('\nModules Breakdown:');
console.table(modCounts);

console.log('\nDifficulty Distribution:');
console.table(diffCounts);

console.log('\nTier Distribution:');
console.table(tierCounts);

console.log('========================================');
console.log('PHASE 3 — DEPARTMENT/MODULE COVERAGE CHECK');
console.log('========================================');
let coveragePassed = true;
let totalExpectedComboCount = 0;
for (const [dept, mods] of Object.entries(expectedModules)) {
  mods.forEach((m) => {
    totalExpectedComboCount++;
    const key = `${dept}:${m}`;
    const count = deptModCounts[key] || 0;
    if (count !== 20) {
      console.error(`❌ DISCREPANCY: ${key} has ${count} questions (expected 20)`);
      coveragePassed = false;
    }
  });
}
if (coveragePassed) {
  console.log(`✅ All ${totalExpectedComboCount} department/module combinations have EXACTLY 20 questions!`);
}

console.log('========================================');
console.log('PHASE 4 — QUESTION STRUCTURE VALIDATION');
console.log('========================================');
console.log(`Missing fields count: ${missingFields.length}`);
console.log(`Null fields count: ${nullFields.length}`);
console.log(`MCQ answer issues count: ${mcqAnswerIssues.length}`);
console.log(`SQL structure issues count: ${sqlStructureIssues.length}`);
console.log(`Suspicious records count: ${suspiciousRecords.length}`);

if (mcqAnswerIssues.length > 0) {
  console.log('MCQ Answer Issues:', mcqAnswerIssues);
}
if (sqlStructureIssues.length > 0) {
  console.log('SQL Structure Issues:', sqlStructureIssues);
}
if (suspiciousRecords.length > 0) {
  console.log('Suspicious Records:', suspiciousRecords);
}

console.log('========================================');
console.log('PHASE 8 — DUPLICATE VALIDATION');
console.log('========================================');
console.log(`Duplicate count: ${duplicates.length}`);
if (duplicates.length > 0) {
  console.log('Duplicates:', duplicates);
}

// Phase 10: Check existing DB
async function checkDB() {
  console.log('========================================');
  console.log('PHASE 10 — DATABASE INSPECTION BEFORE INSERT');
  console.log('========================================');
  const prisma = new PrismaClient();
  try {
    const existingCount = await prisma.question.count();
    console.log(`Existing questions in Postgres database: ${existingCount}`);

    const existingQuestions = await prisma.question.findMany({
      select: { id: true, content: true, role: true, moduleType: true },
    });

    let dbDuplicateCount = 0;
    for (const q of questions) {
      const qText = (q.question || '').trim();
      const match = existingQuestions.find((eq) => {
        const c = eq.content;
        const prompt = (c && (c.prompt || c.title || c.question)) || '';
        return prompt.trim() === qText;
      });
      if (match) dbDuplicateCount++;
    }
    console.log(`JSON questions already matching existing DB questions: ${dbDuplicateCount}`);
  } catch (err) {
    console.error('Error connecting to DB:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkDB();
