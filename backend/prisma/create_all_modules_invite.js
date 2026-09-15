const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });
dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '../api/.env') });

const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const fs = require('fs');

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Preparing All-Modules Drive and Generating Invite Token...\n');

  // 1. Get or create Staff
  let staff = await prisma.staff.findFirst();
  if (!staff) {
    staff = await prisma.staff.create({
      data: {
        email: 'recruiter@protora.com',
        name: 'Lead Recruiter',
        role: 'RECRUITER',
        keycloakUserId: 'keycloak-recruiter-001',
      },
    });
  }

  // 2. Ensure Role Template
  let roleTemplate = await prisma.roleTemplate.findFirst({
    where: { isActive: true },
  });
  if (!roleTemplate) {
    roleTemplate = await prisma.roleTemplate.create({
      data: {
        roleName: 'Full Stack Engineer (All Modules)',
        durationMinutes: 120,
        weightingPreset: {},
        version: 1,
        isActive: true,
      },
    });
  }

  // 3. Ensure sample questions exist for all 8 modules
  // A. Check NOSQL
  const nosqlCount = await prisma.question.count({ where: { moduleType: 'NOSQL' } });
  if (nosqlCount === 0) {
    console.log('Adding sample NOSQL questions...');
    await prisma.question.createMany({
      data: [
        {
          moduleType: 'NOSQL',
          role: 'General',
          targetLevel: '0-1',
          difficulty: 'easy',
          tags: ['nosql', 'mongodb', 'query'],
          content: {
            title: 'Find Employees in Sales',
            prompt: "Write a MongoDB query to find all documents in the 'employees' collection where the department is 'Sales'. Project only the 'name' field, and exclude the '_id' field.",
            datasetRef: 'datasets/employees.json',
            collections: ['employees'],
            allowedOperations: ['find'],
            validatorType: 'OUTPUT_COMPARISON',
            expectedOperation: {
              collection: 'employees',
              operator: 'find',
              payload: {
                filter: { department: 'Sales' },
                projection: { _id: 0, name: 1 },
              },
            },
            hint: "Use db.employees.find({ department: 'Sales' }, { _id: 0, name: 1 })",
          },
          scoringConfig: { points: 10 },
        },
        {
          moduleType: 'NOSQL',
          role: 'General',
          targetLevel: '2-5',
          difficulty: 'medium',
          tags: ['nosql', 'mongodb', 'filter'],
          content: {
            title: 'Find High Earners in Engineering',
            prompt: "Write a MongoDB query to find all documents in the 'employees' collection where the department is 'Engineering' and the salary is strictly greater than 80000. Project only the fields 'name' and 'salary', and exclude '_id'.",
            datasetRef: 'datasets/employees.json',
            collections: ['employees'],
            allowedOperations: ['find'],
            validatorType: 'OUTPUT_COMPARISON',
            expectedOperation: {
              collection: 'employees',
              operator: 'find',
              payload: {
                filter: { department: 'Engineering', salary: { $gt: 80000 } },
                projection: { _id: 0, name: 1, salary: 1 },
              },
            },
            hint: "Use db.employees.find({ department: 'Engineering', salary: { $gt: 80000 } }, { _id: 0, name: 1, salary: 1 })",
          },
          scoringConfig: { points: 15 },
        },
      ],
    });
  }

  // B. Check TEST_SCENARIOS
  const testScenarioCount = await prisma.question.count({ where: { moduleType: 'TEST_SCENARIOS' } });
  if (testScenarioCount === 0) {
    console.log('Adding sample TEST_SCENARIOS questions...');
    const batchPath = path.join(__dirname, 'data/seniority_l2_l3_question_batch.json');
    if (fs.existsSync(batchPath)) {
      const batchData = JSON.parse(fs.readFileSync(batchPath, 'utf8'));
      const tsQuestions = batchData.filter(q => (q.moduleType || q.module) === 'TEST_SCENARIOS');
      for (const q of tsQuestions.slice(0, 5)) {
        await prisma.question.create({
          data: {
            moduleType: 'TEST_SCENARIOS',
            role: q.department || 'QA',
            difficulty: q.difficulty || 'medium',
            tags: q.tags || ['qa', 'test_scenarios'],
            content: q.content || {
              prompt: q.question || 'Design end-to-end integration test scenarios.',
              scenario: q.scenario || 'E-Commerce payment gateway failure handling',
              requirements: ['Positive test cases', 'Edge cases', 'Negative test cases', 'Latency simulation'],
            },
            scoringConfig: q.scoringConfig || { points: 15 },
          },
        });
      }
    } else {
      await prisma.question.create({
        data: {
          moduleType: 'TEST_SCENARIOS',
          role: 'QA',
          difficulty: 'medium',
          tags: ['qa', 'test_scenarios'],
          content: {
            title: 'Payment Checkout Test Suite',
            prompt: 'Formulate an exhaustive test scenario matrix for a distributed payment checkout flow experiencing occasional 504 gateway timeouts.',
            scenarios: [
              { id: 'tc-1', name: 'Idempotency under network retry' },
              { id: 'tc-2', name: 'Concurrent balance deduction' },
            ],
          },
          scoringConfig: { points: 15 },
        },
      });
    }
  }

  // 4. Select sample questions for EVERY module
  const allModules = [
    'MCQ',
    'SQL',
    'CODING',
    'DEBUGGING',
    'AI_PROMPTING',
    'SIMULATION',
    'TEST_SCENARIOS',
    'NOSQL',
  ];

  const selectedQuestions = [];
  for (const mod of allModules) {
    const qList = await prisma.question.findMany({
      where: { moduleType: mod },
      take: 2,
    });
    console.log(`Found ${qList.length} questions for module: ${mod}`);
    selectedQuestions.push(...qList);
  }

  // 5. Create Drive with all 8 modules enabled
  const moduleConfig = {
    MCQ: { enabled: true, weight: 15, durationMinutes: 15 },
    SQL: { enabled: true, weight: 15, durationMinutes: 15 },
    CODING: { enabled: true, weight: 20, durationMinutes: 30 },
    DEBUGGING: { enabled: true, weight: 10, durationMinutes: 15 },
    AI_PROMPTING: { enabled: true, weight: 10, durationMinutes: 15 },
    SIMULATION: { enabled: true, weight: 15, durationMinutes: 15 },
    TEST_SCENARIOS: { enabled: true, weight: 15, durationMinutes: 15 },
    NOSQL: { enabled: true, weight: 0, isBonus: true, maxBonusPoints: 10, durationMinutes: 15 },
  };

  const drive = await prisma.drive.create({
    data: {
      name: `All-Modules Comprehensive Assessment (${new Date().toLocaleDateString('en-US')})`,
      status: 'ACTIVE',
      roleTemplateId: roleTemplate.id,
      createdById: staff.id,
      moduleConfig: moduleConfig,
      scheduleStart: new Date(Date.now() - 60 * 60 * 1000), // active now
      scheduleEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      bufferMinutes: 30,
      graceMinutes: 240,
    },
  });

  // Link questions to Drive
  for (const q of selectedQuestions) {
    await prisma.driveQuestion.create({
      data: {
        driveId: drive.id,
        questionId: q.id,
        moduleType: q.moduleType,
        questionVersionSnapshot: q.version || 1,
      },
    });
  }
  console.log(`\nLinked ${selectedQuestions.length} total questions across 8 modules to Drive ${drive.id}`);

  // 6. Generate Invite Token for 10:30 AM testing window
  const token = `inv_${crypto.randomBytes(12).toString('hex')}`;
  
  // Set scheduledTime to 10:30 AM today or active ready
  const today1030 = new Date();
  today1030.setHours(10, 30, 0, 0);

  const invite = await prisma.invite.create({
    data: {
      token: token,
      driveId: drive.id,
      roleTemplateId: roleTemplate.id,
      createdById: staff.id,
      candidateEmail: `candidate.${Date.now()}@example.com`,
      candidateName: 'Candidate User',
      scheduledTime: today1030,
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      status: 'PENDING',
      bufferMinutes: 60,
      graceMinutes: 360,
    },
  });

  console.log('\n' + '='.repeat(80));
  console.log('✅ TEST INVITE TOKEN GENERATED SUCCESSFULLY');
  console.log('='.repeat(80));
  console.log(`Token:            ${invite.token}`);
  console.log(`Candidate Name:   ${invite.candidateName}`);
  console.log(`Candidate Email:  ${invite.candidateEmail}`);
  console.log(`Scheduled Time:   10:30 AM (Window Open / Active)`);
  console.log(`Open Modules (8): MCQ, SQL, CODING, DEBUGGING, AI_PROMPTING, SIMULATION, TEST_SCENARIOS, NOSQL`);
  console.log(`Candidate URL:    http://localhost:3000/invite/${invite.token}`);
  console.log('='.repeat(80) + '\n');
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
