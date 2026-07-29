import { PrismaClient, ModuleType, InviteStatus, DriveStatus, QuestionStatus, CvMode } from "@prisma/client";
import { Queue } from "bullmq";
import * as dotenv from "dotenv";
import * as path from "path";

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), ".env") });
dotenv.config({ path: path.join(process.cwd(), "backend/.env") });
dotenv.config({ path: path.join(process.cwd(), "backend/api/.env") });

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding Load Test Environment...");

  // Clean up previous load-test data to avoid unique constraints and allow clean re-runs
  await prisma.invite.deleteMany({
    where: {
      token: { startsWith: "load-test-token-" },
    },
  });
  await prisma.drive.deleteMany({
    where: {
      name: "Load Test Drive 2026",
    },
  });
  console.log("  ✔ Cleaned up previous load test drives and invites.");

  // 1. Staff (Recruiter)
  const staff = await prisma.staff.upsert({
    where: { email: "recruiter@example.com" },
    update: {},
    create: {
      email: "recruiter@example.com",
      name: "Rachel Brooks",
      role: "RECRUITER",
      keycloakUserId: "mock-keycloak-recruiter-id",
    },
  });
  console.log(`  ✔ Staff recruiter active (ID: ${staff.id})`);

  // 2. Staff (System Orchestrator)
  const systemStaff = await prisma.staff.upsert({
    where: { email: "system-orchestrator@cdrecruit.local" },
    update: {},
    create: {
      email: "system-orchestrator@cdrecruit.local",
      name: "System Scaling Orchestrator",
      role: "ADMIN",
      keycloakUserId: "system-orchestrator-uuid",
    },
  });
  console.log(`  ✔ System Orchestrator staff active (ID: ${systemStaff.id})`);

  // 3. RoleTemplate
  const roleTemplate = await prisma.roleTemplate.upsert({
    where: { id: "load-test-template-uuid" },
    update: {},
    create: {
      id: "load-test-template-uuid",
      roleName: "Load Test Engineer",
      weightingPreset: {
        MCQ: 0.0,
        SQL: 0.0,
        CODING: 1.0,
        AI_PROMPTING: 0.0,
        SIMULATION: 0.0,
      },
      durationMinutes: 60,
    },
  });
  console.log(`  ✔ RoleTemplate active (ID: ${roleTemplate.id})`);

  // 4. Question (Valid UUID: 00000000-0000-4000-8000-000000000001)
  const questionId = "00000000-0000-4000-8000-000000000001";
  const questionContent = {
    prompt: "Write a program that reads two comma-separated numbers on each line from standard input (stdin) and prints their sum to standard output (stdout).",
    starterCode: {
      javascript:
        "const fs = require('fs');\n\nfunction sum(a, b) {\n  return a + b;\n}\n\nconst input = fs.readFileSync(0, 'utf-8').trim();\nif (input) {\n  const lines = input.split('\\n');\n  for (const line of lines) {\n    if (!line.trim()) continue;\n    const parts = line.trim().split(',');\n    const a = parseInt(parts[0].trim(), 10);\n    const b = parseInt(parts[1].trim(), 10);\n    console.log(sum(a, b));\n  }\n}",
    },
    visibleTestCases: [
      { input: "1, 2", expectedOutput: "3", label: "Example 1" },
    ],
    hiddenTestCases: [
      { input: "10, 20", expectedOutput: "30", label: "Hidden Case 1" },
    ],
  };

  const question = await prisma.question.upsert({
    where: { id: questionId },
    update: {
      content: questionContent,
      status: QuestionStatus.PUBLISHED,
    },
    create: {
      id: questionId,
      moduleType: ModuleType.CODING,
      role: "QA",
      difficulty: "medium",
      tags: ["coding"],
      content: questionContent,
      status: QuestionStatus.PUBLISHED,
      version: 1,
      scoringConfig: {},
    },
  });
  console.log(`  ✔ Question active (ID: ${question.id})`);

  // 5. Drive
  const driveName = "Load Test Drive 2026";
  const now = new Date();
  const scheduleStart = new Date(now.getTime() + 10 * 60 * 1000); // 10 mins future
  const scheduleEnd = new Date(now.getTime() + 4 * 60 * 60 * 1000); // 4 hours future

  const drive = await prisma.drive.create({
    data: {
      name: driveName,
      roleTemplateId: roleTemplate.id,
      moduleConfig: {
        CODING: { enabled: true, weight: 1.0, durationMinutes: 60 },
      },
      status: DriveStatus.ACTIVE,
      scheduleStart,
      scheduleEnd,
      createdById: staff.id,
      bufferMinutes: 15,
      graceMinutes: 5,
    },
  });
  console.log(`  ✔ Drive active (ID: ${drive.id})`);

  // Link Question to Drive
  await prisma.driveQuestion.create({
    data: {
      driveId: drive.id,
      questionId: question.id,
      moduleType: ModuleType.CODING,
    },
  });

  // 6. Invites (N = 200)
  const candidateCount = 200;
  console.log(`  🚀 Creating ${candidateCount} load-testing invites...`);

  const inviteData = [];
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 48);

  for (let i = 1; i <= candidateCount; i++) {
    const email = `load-test-candidate-${i}@example.com`;
    const token = `load-test-token-${i}`;

    // Upsert candidate
    const candidate = await prisma.candidate.upsert({
      where: { email },
      update: {},
      create: {
        email,
        name: `Load Test Candidate ${i}`,
      },
    });

    inviteData.push({
      candidateEmail: email,
      candidateName: `Load Test Candidate ${i}`,
      roleTemplateId: roleTemplate.id,
      driveId: drive.id,
      status: InviteStatus.PENDING,
      token,
      createdById: staff.id,
      expiresAt,
      isGenerated: true,
    });
  }

  // Batch insert invites using createMany
  await prisma.invite.createMany({
    data: inviteData,
    skipDuplicates: true,
  });

  // 7. Enqueue scaling jobs directly in BullMQ for autoscaling processor verification
  console.log("  🚀 Enqueuing scaling jobs in BullMQ...");
  const queue = new Queue("infra-scaling", {
    connection: {
      host: process.env.REDIS_HOST || "127.0.0.1",
      port: parseInt(process.env.REDIS_PORT || "6379", 10),
    },
  });

  const scaleUpJobId = `scale-up-${drive.id}`;
  const scaleDownJobId = `scale-down-${drive.id}`;

  const nowMs = Date.now();
  const scaleUpTime = drive.scheduleStart.getTime() - 30 * 60 * 1000;
  const scaleUpDelayMs = Math.max(scaleUpTime - nowMs, 0);

  const scaleDownTime = drive.scheduleEnd.getTime() + 15 * 60 * 1000;
  const scaleDownDelayMs = Math.max(scaleDownTime - nowMs, 0);

  await queue.add(
    "scale-up-judge0",
    { driveId: drive.id },
    { jobId: scaleUpJobId, delay: scaleUpDelayMs, removeOnComplete: true, removeOnFail: false }
  );

  await queue.add(
    "scale-down-judge0",
    { driveId: drive.id },
    { jobId: scaleDownJobId, delay: scaleDownDelayMs, removeOnComplete: true, removeOnFail: false }
  );

  await queue.close();
  console.log("  ✔ Scaling jobs enqueued in BullMQ successfully.");

  console.log(`✅ Seed complete! Seeded:`);
  console.log(`  - Drive: ${driveName} (${drive.id})`);
  console.log(`  - Question: sum(a,b) (${question.id})`);
  console.log(`  - Invites: ${candidateCount} unique records`);
}

main()
  .catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
