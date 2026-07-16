import { PrismaClient, ModuleType, InviteStatus, DriveStatus, QuestionStatus, CvMode } from "@prisma/client";
import * as jwt from "jsonwebtoken";
import * as dotenv from "dotenv";
import * as path from "path";

// Load .env file from backend root
dotenv.config({ path: path.join(__dirname, "../.env") });
dotenv.config({ path: path.join(__dirname, "../api/.env") });

const prisma = new PrismaClient();

const jwtSecret = process.env.JWT_SECRET || "dev-jwt-secret-key-12345!!!";
const appPort = process.env.PORT || "3001";
const frontendPort = "5173"; // Default Vite port for candidate-web

async function main() {
  console.log("🌱 Seeding Dev Candidate Invite…");

  // 1. Staff
  const staff = await prisma.staff.upsert({
    where: { email: "dev-recruiter@example.com" },
    update: {},
    create: {
      email: "dev-recruiter@example.com",
      name: "Dev Recruiter",
      role: "RECRUITER",
      keycloakUserId: "dev-keycloak-recruiter-id-999",
    },
  });

  // 2. RoleTemplate
  const roleTemplateName = "Dev QA Automation Engineer";
  let roleTemplate = await prisma.roleTemplate.findFirst({
    where: { roleName: roleTemplateName },
  });

  if (!roleTemplate) {
    roleTemplate = await prisma.roleTemplate.create({
      data: {
        roleName: roleTemplateName,
        weightingPreset: {
          MCQ: 0.25,
          SQL: 0.25,
          CODING: 0.30,
          AI_PROMPTING: 0.20,
          SIMULATION: 0.0,
        },
        durationMinutes: 60,
      },
    });
  }

  // 3. Questions (MCQ, SQL, CODING, AI_PROMPTING)
  const questionData = [
    {
      moduleType: ModuleType.MCQ,
      role: "QA",
      difficulty: "easy",
      tags: ["testing", "mcq"],
      content: {
        prompt: "Which HTTP status code represents a validation or client error?",
        options: ["200 OK", "400 Bad Request", "500 Internal Server Error", "302 Found"],
      },
      scoringConfig: {
        correctIndex: 1,
      },
    },
    {
      moduleType: ModuleType.SQL,
      role: "QA",
      difficulty: "medium",
      tags: ["database", "sql"],
      content: {
        prompt: "Write a query to retrieve all active candidate emails.",
        schema: "CREATE TABLE candidates (id SERIAL, email VARCHAR(255), status VARCHAR(50));",
        seedData: "INSERT INTO candidates (email, status) VALUES ('test1@example.com', 'ACTIVE'), ('test2@example.com', 'INACTIVE');",
        expectedQuery: "SELECT email FROM candidates WHERE status = 'ACTIVE';",
      },
      scoringConfig: {},
    },
    {
      moduleType: ModuleType.CODING,
      role: "QA",
      difficulty: "medium",
      tags: ["javascript", "coding"],
      content: {
        prompt: "Write a function sum(a, b) that returns the sum of two numbers.",
        starterCode: "function sum(a, b) {\n  // Write your code here\n}",
        testCases: [
          { input: "1, 2", expectedOutput: "3" },
          { input: "-1, 5", expectedOutput: "4" },
        ],
      },
      scoringConfig: {},
    },
    {
      moduleType: ModuleType.AI_PROMPTING,
      role: "QA",
      difficulty: "medium",
      tags: ["prompting"],
      content: {
        prompt: "Prompt the LLM to generate 3 test cases for a login page.",
        rubric: "Ensure prompt includes boundary conditions.",
      },
      scoringConfig: {},
    },
  ];

  const seededQuestions = [];
  for (const q of questionData) {
    const existing = await prisma.question.findFirst({
      where: {
        moduleType: q.moduleType,
        tags: { has: q.tags[0] },
      },
    });

    if (existing) {
      seededQuestions.push(existing);
    } else {
      const created = await prisma.question.create({
        data: {
          moduleType: q.moduleType,
          role: q.role,
          difficulty: q.difficulty,
          tags: q.tags,
          content: q.content,
          scoringConfig: q.scoringConfig,
          version: 1,
          status: QuestionStatus.PUBLISHED,
        },
      });
      seededQuestions.push(created);
    }
  }

  // 4. Drive
  const driveName = "QA Dev Candidate Drive 2026";
  let drive = await prisma.drive.findFirst({
    where: { name: driveName },
  });

  if (!drive) {
    drive = await prisma.drive.create({
      data: {
        name: driveName,
        roleTemplateId: roleTemplate.id,
        moduleConfig: {
          MCQ: { enabled: true, weight: 0.25 },
          SQL: { enabled: true, weight: 0.25 },
          CODING: { enabled: true, weight: 0.30 },
          AI_PROMPTING: { enabled: true, weight: 0.20 },
        },
        status: DriveStatus.ACTIVE,
        createdById: staff.id,
      },
    });

    // Link Questions
    for (const q of seededQuestions) {
      await prisma.driveQuestion.upsert({
        where: {
          driveId_questionId: {
            driveId: drive.id,
            questionId: q.id,
          },
        },
        update: {},
        create: {
          driveId: drive.id,
          questionId: q.id,
          moduleType: q.moduleType,
        },
      });
    }
  }

  // 5. Candidate
  const candidateEmail = "dev-candidate@example.com";
  const candidate = await prisma.candidate.upsert({
    where: { email: candidateEmail },
    update: {},
    create: {
      email: candidateEmail,
      name: "Dev Candidate",
    },
  });

  // 6. Invite
  const inviteId = "dev-invite-uuid-" + Math.floor(Math.random() * 100000);
  
  // Replicate AuthService.generateInviteToken() payload shape
  const ttlHours = 48;
  const token = jwt.sign(
    {
      inviteId,
      candidateEmail: candidate.email,
      candidateName: candidate.name,
      roleTemplateId: roleTemplate.id,
      cvMode: CvMode.FULL,
    },
    jwtSecret,
    {
      expiresIn: `${ttlHours}h`,
    }
  );

  // Expiration date
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + ttlHours);

  // Insert the Invite row
  await prisma.invite.upsert({
    where: { token },
    update: {},
    create: {
      id: inviteId,
      candidateEmail: candidate.email,
      candidateName: candidate.name,
      roleTemplateId: roleTemplate.id,
      driveId: drive.id,
      status: InviteStatus.PENDING,
      token,
      createdById: staff.id,
      expiresAt,
      isGenerated: true,
    },
  });

  console.log("✔ Dev Candidate and Invite successfully seeded!");
  console.log("\n==================================================");
  console.log("Test Login URL:");
  console.log(`http://localhost:${frontendPort}/login?token=${token}`);
  console.log("==================================================\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
