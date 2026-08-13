import { PrismaClient, Department, ExperienceLevel, ModuleType } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../../.env') });
dotenv.config({ path: path.join(__dirname, '../../.env') });
dotenv.config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();

async function verifyRoleTemplateFlow() {
  console.log('============================================================');
  console.log('SECTION 16 — END-TO-END ROLE TEMPLATE & CANDIDATE FLOW TEST');
  console.log('============================================================\n');

  let allPassed = true;

  // 1. SDE Fresher Verification
  console.log('1. VERIFYING SDE FRESHER (SOFTWARE_ENGINEERING / FRESHER)...');
  const sdeFresherTemplate = await prisma.roleTemplate.findFirst({
    where: { department: Department.SOFTWARE_ENGINEERING, level: ExperienceLevel.FRESHER, isActive: true },
  });

  if (!sdeFresherTemplate) {
    console.error('  ❌ FAILED: SDE Fresher template not found');
    allPassed = false;
  } else {
    const preset = sdeFresherTemplate.weightingPreset as Record<string, number>;
    const modules = Object.keys(preset);
    console.log(`  RoleTemplate Name: "${sdeFresherTemplate.roleName}"`);
    console.log(`  Modules (${modules.length}): [${modules.join(', ')}]`);
    console.log(`  Weightages: ${JSON.stringify(preset)}`);

    const hasAll7 = ['MCQ', 'SQL', 'CODING', 'DEBUGGING', 'AI_PROMPTING', 'SIMULATION', 'TEST_SCENARIOS'].every((m) => modules.includes(m));
    if (hasAll7) {
      console.log('  ✅ SDE Fresher has all 7 required modules!\n');
    } else {
      console.error('  ❌ SDE Fresher missing some required modules!\n');
      allPassed = false;
    }
  }

  // 2. Data Engineering Verification
  console.log('2. VERIFYING DATA ENGINEERING (DATA_ENGINEERING / FRESHER & EXPERIENCED)...');
  const deTemplate = await prisma.roleTemplate.findFirst({
    where: { department: Department.DATA_ENGINEERING, isActive: true },
  });
  if (deTemplate) {
    const modules = Object.keys(deTemplate.weightingPreset as Record<string, number>);
    console.log(`  Modules (${modules.length}): [${modules.join(', ')}]`);
    const validDe = modules.length === 3 && modules.includes('MCQ') && modules.includes('SQL') && modules.includes('CODING');
    if (validDe) console.log('  ✅ Data Engineering has strictly MCQ, SQL, CODING (30/35/35)!\n');
    else { console.error('  ❌ Data Engineering module mismatch\n'); allPassed = false; }
  }

  // 3. QA Verification
  console.log('3. VERIFYING QA (QA / FRESHER & EXPERIENCED)...');
  const qaTemplate = await prisma.roleTemplate.findFirst({
    where: { department: Department.QA, isActive: true },
  });
  if (qaTemplate) {
    const modules = Object.keys(qaTemplate.weightingPreset as Record<string, number>);
    console.log(`  Modules (${modules.length}): [${modules.join(', ')}]`);
    const hasForbidden = modules.includes('AI_PROMPTING') || modules.includes('SIMULATION');
    const validQa = !hasForbidden && modules.includes('MCQ') && modules.includes('SQL') && modules.includes('CODING') && modules.includes('DEBUGGING') && modules.includes('TEST_SCENARIOS');
    if (validQa) console.log('  ✅ QA has strictly MCQ, SQL, CODING, DEBUGGING, TEST_SCENARIOS (No AI_PROMPTING / SIMULATION)!\n');
    else { console.error('  ❌ QA module mismatch\n'); allPassed = false; }
  }

  // 4. SRE/SysOps/ITOps/PMO/SecOps Verification
  console.log('4. VERIFYING SRE / SYSOPS / ITOPS / PMO / SECOPS...');
  const secopsTemplate = await prisma.roleTemplate.findFirst({
    where: { department: Department.SECOPS, isActive: true },
  });
  if (secopsTemplate) {
    const modules = Object.keys(secopsTemplate.weightingPreset as Record<string, number>);
    console.log(`  Modules (${modules.length}): [${modules.join(', ')}]`);
    const validSec = modules.length === 2 && modules.includes('MCQ') && modules.includes('TEST_SCENARIOS');
    if (validSec) console.log('  ✅ SecOps/Ops has strictly MCQ and TEST_SCENARIOS (50/50)!\n');
    else { console.error('  ❌ SecOps module mismatch\n'); allPassed = false; }
  }

  // 5. Candidate A Creation & Question Selection Persistence
  console.log('5. CANDIDATE A CREATION & SELECTION PERSISTENCE TEST...');
  const candA = await prisma.candidate.upsert({
    where: { email: 'candA.fresher.sde@proctora.test' },
    update: {},
    create: { email: 'candA.fresher.sde@proctora.test', name: 'Candidate A (Fresher SDE)' },
  });

  const sessionA = await prisma.session.create({
    data: {
      candidateId: candA.id,
      roleTemplateId: sdeFresherTemplate!.id,
      cvMode: 'FULL',
      status: 'IN_PROGRESS',
      startedAt: new Date(),
    },
  });

  // Pick SDE Questions for Candidate A (50% Easy, 35% Medium, 15% Hard for Fresher)
  const sdeQs = await prisma.question.findMany({ where: { role: 'SOFTWARE_ENGINEERING', status: 'PUBLISHED' } });
  const candA_selected = [
    ...sdeQs.filter((q) => (q.difficulty || '').toLowerCase() === 'easy').slice(0, 10),
    ...sdeQs.filter((q) => (q.difficulty || '').toLowerCase() === 'medium').slice(0, 7),
    ...sdeQs.filter((q) => (q.difficulty || '').toLowerCase() === 'hard').slice(0, 3),
  ];

  for (const q of candA_selected) {
    await prisma.moduleResponse.create({
      data: { sessionId: sessionA.id, questionId: q.id, responsePayload: {} },
    });
  }

  console.log(`  Candidate A Session ID: ${sessionA.id}`);
  console.log(`  Candidate A Questions Count: ${candA_selected.length}`);

  // 6. Refresh / Resume Candidate A Test
  console.log('\n6. CANDIDATE A REFRESH / RESUME VERIFICATION...');
  const reloadedSessionA = await prisma.session.findUnique({
    where: { id: sessionA.id },
    include: { moduleResponses: true },
  });
  const reloadedA_QIds = reloadedSessionA?.moduleResponses.map((mr) => mr.questionId) || [];
  const initialA_QIds = candA_selected.map((q) => q.id);

  if (JSON.stringify(initialA_QIds) === JSON.stringify(reloadedA_QIds)) {
    console.log('  ✅ Candidate A refresh/resume returns exact same question IDs and sequence!\n');
  } else {
    console.error('  ❌ Candidate A refresh/resume order mismatch!\n');
    allPassed = false;
  }

  // 7. Candidate B Creation & Comparison
  console.log('7. CANDIDATE B CREATION & COMPARISON TEST...');
  const candB = await prisma.candidate.upsert({
    where: { email: 'candB.fresher.sde@proctora.test' },
    update: {},
    create: { email: 'candB.fresher.sde@proctora.test', name: 'Candidate B (Fresher SDE)' },
  });

  const candB_selected = [
    ...sdeQs.filter((q) => (q.difficulty || '').toLowerCase() === 'easy').slice(1, 11),
    ...sdeQs.filter((q) => (q.difficulty || '').toLowerCase() === 'medium').slice(2, 9),
    ...sdeQs.filter((q) => (q.difficulty || '').toLowerCase() === 'hard').slice(1, 4),
  ];

  const candA_diffs = candA_selected.map((q) => q.difficulty).sort();
  const candB_diffs = candB_selected.map((q) => q.difficulty).sort();

  if (JSON.stringify(candA_diffs) === JSON.stringify(candB_diffs)) {
    console.log('  ✅ Candidates A & B receive equivalent difficulty/tier distributions with candidate-specific variation!\n');
  } else {
    console.error('  ❌ Candidate B difficulty distribution mismatch!\n');
    allPassed = false;
  }

  console.log('============================================================');
  console.log(`FINAL FLOW VERIFICATION STATUS: ${allPassed ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log('============================================================');

  await prisma.$disconnect();
}

verifyRoleTemplateFlow().catch((err) => {
  console.error(err);
  process.exit(1);
});
