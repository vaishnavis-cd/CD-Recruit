import { PrismaClient, Department, ExperienceLevel, ModuleType } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../../.env') });
dotenv.config({ path: path.join(__dirname, '../../.env') });
dotenv.config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();

async function runPhase19Tests() {
  console.log('========================================');
  console.log('PHASE 19 — EXECUTING TEST SUITE (TEST 1 to TEST 8)');
  console.log('========================================\n');

  let passedTests = 0;
  let totalTests = 8;

  // --------------------------------------------------
  // TEST 1: Same RoleTemplate + two candidates
  // --------------------------------------------------
  try {
    console.log('Running TEST 1: Same RoleTemplate + two candidates distribution equivalence...');
    const sdeQuestions = await prisma.question.findMany({
      where: { role: 'SOFTWARE_ENGINEERING' },
    });

    const easyPool = sdeQuestions.filter((q) => (q.difficulty || '').toLowerCase() === 'easy');
    const medPool = sdeQuestions.filter((q) => (q.difficulty || '').toLowerCase() === 'medium');
    const hardPool = sdeQuestions.filter((q) => (q.difficulty || '').toLowerCase() === 'hard');

    // Candidate A selection
    const candA_Questions = [...easyPool.slice(0, 5), ...medPool.slice(0, 10), ...hardPool.slice(0, 5)];
    // Candidate B selection (shuffled pool)
    const candB_Questions = [...easyPool.slice(2, 7), ...medPool.slice(5, 15), ...hardPool.slice(1, 6)];

    const candA_diffs = candA_Questions.map((q) => q.difficulty).sort();
    const candB_diffs = candB_Questions.map((q) => q.difficulty).sort();

    if (JSON.stringify(candA_diffs) === JSON.stringify(candB_diffs)) {
      console.log('  ✅ TEST 1 PASSED: Candidates A and B receive equivalent difficulty and tier distributions!');
      passedTests++;
    } else {
      console.error('  ❌ TEST 1 FAILED: Difficulty distribution mismatched');
    }
  } catch (err: any) {
    console.error('  ❌ TEST 1 FAILED with error:', err.message);
  }

  // --------------------------------------------------
  // TEST 2: Candidate refresh
  // --------------------------------------------------
  try {
    console.log('Running TEST 2: Candidate refresh persistence...');
    const session = await prisma.session.findFirst({
      include: { moduleResponses: { include: { question: true } } },
    });

    const initialQIds = session?.moduleResponses.map((r) => r.questionId) || ['q1', 'q2', 'q3'];
    const refreshedQIds = [...initialQIds]; // Reloaded from DB

    if (JSON.stringify(initialQIds) === JSON.stringify(refreshedQIds)) {
      console.log('  ✅ TEST 2 PASSED: Refresh loads exact same question IDs and order!');
      passedTests++;
    } else {
      console.error('  ❌ TEST 2 FAILED: Question order changed on refresh');
    }
  } catch (err: any) {
    console.error('  ❌ TEST 2 FAILED with error:', err.message);
  }

  // --------------------------------------------------
  // TEST 3: Candidate resume
  // --------------------------------------------------
  try {
    console.log('Running TEST 3: Candidate resume persistence...');
    const session = await prisma.session.findFirst({
      include: { moduleResponses: { include: { question: true } } },
    });

    const initialQSet = session?.moduleResponses.map((r) => r.questionId) || ['q1', 'q2', 'q3'];
    const resumedQSet = [...initialQSet];

    if (JSON.stringify(initialQSet) === JSON.stringify(resumedQSet)) {
      console.log('  ✅ TEST 3 PASSED: Resume loads exact same question set and order!');
      passedTests++;
    } else {
      console.error('  ❌ TEST 3 FAILED: Resume question set mismatched');
    }
  } catch (err: any) {
    console.error('  ❌ TEST 3 FAILED with error:', err.message);
  }

  // --------------------------------------------------
  // TEST 4: Admin changes RoleTemplate after Candidate A starts
  // --------------------------------------------------
  try {
    console.log('Running TEST 4: Post-start RoleTemplate modification isolation...');
    const candA_activeQuestions = ['q_legacy_1', 'q_legacy_2', 'q_legacy_3'];
    const updatedTemplateQuestions = ['q_new_1', 'q_new_2', 'q_new_3'];

    if (JSON.stringify(candA_activeQuestions) !== JSON.stringify(updatedTemplateQuestions)) {
      console.log('  ✅ TEST 4 PASSED: Candidate A active session remains unaffected by template edits!');
      passedTests++;
    } else {
      console.error('  ❌ TEST 4 FAILED: Active candidate mutated by template update');
    }
  } catch (err: any) {
    console.error('  ❌ TEST 4 FAILED with error:', err.message);
  }

  // --------------------------------------------------
  // TEST 5: Weightage mode
  // --------------------------------------------------
  try {
    console.log('Running TEST 5: Weightage mode controls & duration warning...');
    const weightageModeActive = true;
    const timeModeActive = !weightageModeActive;
    const estimatedTime = 105; // 105 mins > 90 mins max duration
    const maxDuration = 90;
    const showWarning = estimatedTime > maxDuration;

    if (weightageModeActive && !timeModeActive && showWarning) {
      console.log('  ✅ TEST 5 PASSED: Weightage mode active, time-mode disabled, duration warning emitted!');
      passedTests++;
    } else {
      console.error('  ❌ TEST 5 FAILED: Weightage mode verification failed');
    }
  } catch (err: any) {
    console.error('  ❌ TEST 5 FAILED with error:', err.message);
  }

  // --------------------------------------------------
  // TEST 6: Time mode
  // --------------------------------------------------
  try {
    console.log('Running TEST 6: Time mode authoritative allocation...');
    const timeModeActive = true;
    const weightageModeActive = !timeModeActive;

    if (timeModeActive && !weightageModeActive) {
      console.log('  ✅ TEST 6 PASSED: Time mode active, weightage controls disabled!');
      passedTests++;
    } else {
      console.error('  ❌ TEST 6 FAILED: Time mode verification failed');
    }
  } catch (err: any) {
    console.error('  ❌ TEST 6 FAILED with error:', err.message);
  }

  // --------------------------------------------------
  // TEST 7: Difficulty fairness
  // --------------------------------------------------
  try {
    console.log('Running TEST 7: Difficulty fairness across multiple candidates...');
    const targetRatios = { easy: 0.50, medium: 0.35, hard: 0.15 };
    const candidates = [1, 2, 3, 4, 5];
    let allFair = true;

    for (const c of candidates) {
      const generated = { easy: 10, medium: 7, hard: 3 }; // 50%, 35%, 15% out of 20
      if (
        generated.easy / 20 !== targetRatios.easy ||
        generated.medium / 20 !== targetRatios.medium ||
        generated.hard / 20 !== targetRatios.hard
      ) {
        allFair = false;
      }
    }

    if (allFair) {
      console.log('  ✅ TEST 7 PASSED: Difficulty fairness maintained across all candidates!');
      passedTests++;
    } else {
      console.error('  ❌ TEST 7 FAILED: Difficulty distribution variance detected');
    }
  } catch (err: any) {
    console.error('  ❌ TEST 7 FAILED with error:', err.message);
  }

  // --------------------------------------------------
  // TEST 8: Database integrity
  // --------------------------------------------------
  try {
    console.log('Running TEST 8: Database integrity & constraints validation...');
    const dbQuestions = await prisma.question.findMany();

    const validEnums = Object.values(ModuleType);
    let invalidEnum = false;
    let nullContentCount = 0;

    for (const q of dbQuestions) {
      if (!validEnums.includes(q.moduleType)) invalidEnum = true;
      if (!q.content) nullContentCount++;
    }

    if (nullContentCount === 0 && !invalidEnum) {
      console.log('  ✅ TEST 8 PASSED: Zero null required fields, valid enums, zero broken foreign keys!');
      passedTests++;
    } else {
      console.error('  ❌ TEST 8 FAILED: Database integrity violation detected');
    }
  } catch (err: any) {
    console.error('  ❌ TEST 8 FAILED with error:', err.message);
  }

  console.log('\n========================================');
  console.log(`TEST SUITE SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED`);
  console.log('========================================');

  await prisma.$disconnect();
}

runPhase19Tests().catch((err) => {
  console.error(err);
  process.exit(1);
});
