import { PrismaClient, ModuleType, InviteStatus, DriveStatus, QuestionStatus, CvMode } from "@prisma/client";
import * as jwt from "jsonwebtoken";
import * as dotenv from "dotenv";
import * as path from "path";

// Load .env file from workspace root or backend root
dotenv.config({ path: path.join(__dirname, "../../../.env") });
dotenv.config({ path: path.join(__dirname, "../.env") });

const prisma = new PrismaClient();

const jwtSecret = process.env.JWT_SECRET || "dev-jwt-secret-key-12345!!!";
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
          MCQ: 0.20,
          SQL: 0.20,
          CODING: 0.25,
          AI_PROMPTING: 0.20,
          SIMULATION: 0.15,
        },
        durationMinutes: 60,
      },
    });
  }

  // 3. Questions (MCQ, SQL, CODING, AI_PROMPTING) - 3 per type
  const questionData = [
    // MCQ 1
    {
      moduleType: ModuleType.MCQ,
      role: "QA",
      difficulty: "easy",
      tags: ["testing", "mcq-http"],
      content: {
        prompt: "Which HTTP status code represents a validation or client error?",
        options: ["200 OK", "400 Bad Request", "500 Internal Server Error", "302 Found"],
      },
      scoringConfig: {
        correctIndex: 1,
      },
    },
    // MCQ 2
    {
      moduleType: ModuleType.MCQ,
      role: "QA",
      difficulty: "easy",
      tags: ["testing", "mcq-git"],
      content: {
        prompt: "Which git command is used to record changes in the repository?",
        options: ["git push", "git commit", "git pull", "git status"],
      },
      scoringConfig: {
        correctIndex: 1,
      },
    },
    // MCQ 3
    {
      moduleType: ModuleType.MCQ,
      role: "QA",
      difficulty: "easy",
      tags: ["testing", "mcq-js"],
      content: {
        prompt: "Which operator is used for strict equality in JavaScript?",
        options: ["=", "==", "===", "!=="],
      },
      scoringConfig: {
        correctIndex: 2,
      },
    },

    // SQL 1
    {
      moduleType: ModuleType.SQL,
      role: "QA",
      difficulty: "medium",
      tags: ["database", "sql-candidates"],
      content: {
        prompt: "Write a query to retrieve all active candidate emails.",
        schema: "CREATE TABLE candidates (id SERIAL, email VARCHAR(255), status VARCHAR(50));",
        seedData: "INSERT INTO candidates (email, status) VALUES ('test1@example.com', 'ACTIVE'), ('test2@example.com', 'INACTIVE');",
        expectedQuery: "SELECT email FROM candidates WHERE status = 'ACTIVE';",
      },
      scoringConfig: {},
    },
    // SQL 2
    {
      moduleType: ModuleType.SQL,
      role: "QA",
      difficulty: "medium",
      tags: ["database", "sql-count"],
      content: {
        prompt: "Write a query to count all candidates.",
        schema: "CREATE TABLE candidates (id SERIAL, email VARCHAR(255));",
        seedData: "INSERT INTO candidates (email) VALUES ('test1@example.com'), ('test2@example.com');",
        expectedQuery: "SELECT COUNT(*) FROM candidates;",
      },
      scoringConfig: {},
    },
    // SQL 3
    {
      moduleType: ModuleType.SQL,
      role: "QA",
      difficulty: "medium",
      tags: ["database", "sql-delete"],
      content: {
        prompt: "Write a query to delete inactive candidates.",
        schema: "CREATE TABLE candidates (id SERIAL, status VARCHAR(50));",
        seedData: "INSERT INTO candidates (status) VALUES ('ACTIVE'), ('INACTIVE');",
        expectedQuery: "DELETE FROM candidates WHERE status = 'INACTIVE';",
      },
      scoringConfig: {},
    },

    // CODING 1
    {
      moduleType: ModuleType.CODING,
      role: "QA",
      difficulty: "medium",
      tags: ["javascript", "coding-sum"],
      content: {
        prompt: "Write a program that reads two comma-separated numbers on each line from standard input (stdin) and prints their sum to standard output (stdout).",
        starterCode: {
          javascript:
            "const fs = require('fs');\n\nfunction sum(a, b) {\n  // Write your code here\n  return 0;\n}\n\nconst input = fs.readFileSync(0, 'utf-8').trim();\nif (input) {\n  const lines = input.split('\\n');\n  for (const line of lines) {\n    if (!line.trim()) continue;\n    const parts = line.trim().split(',');\n    const a = parseInt(parts[0].trim(), 10);\n    const b = parseInt(parts[1].trim(), 10);\n    console.log(sum(a, b));\n  }\n}",
          python:
            "import sys\n\ndef sum(a: int, b: int) -> int:\n    # Write your code here\n    return 0\n\nfor line in sys.stdin:\n    if not line.strip():\n        continue\n    parts = line.strip().split(',')\n    a = int(parts[0].strip())\n    b = int(parts[1].strip())\n    print(sum(a, b))",
        },
        testCases: [
          { input: "1, 2", expectedOutput: "3", isHidden: false },
          { input: "-1, 5", expectedOutput: "4", isHidden: false },
          { input: "10, 20", expectedOutput: "30", isHidden: true },
        ],
      },
      scoringConfig: {},
    },
    // CODING 2
    {
      moduleType: ModuleType.CODING,
      role: "QA",
      difficulty: "medium",
      tags: ["javascript", "coding-reverse"],
      content: {
        prompt: "Write a program that reads a string on each line from standard input (stdin) and prints its reversed version to standard output (stdout).",
        starterCode: {
          javascript:
            "const fs = require('fs');\n\nfunction reverseString(str) {\n  // Write your code here\n  return '';\n}\n\nconst input = fs.readFileSync(0, 'utf-8').trim();\nif (input) {\n  const lines = input.split('\\n');\n  for (const line of lines) {\n    console.log(reverseString(line.trim()));\n  }\n}",
          python:
            "import sys\n\ndef reverse_string(s: str) -> str:\n    # Write your code here\n    return ''\n\nfor line in sys.stdin:\n    print(reverse_string(line.strip()))",
        },
        testCases: [
          { input: "hello", expectedOutput: "olleh", isHidden: false },
          { input: "qa", expectedOutput: "aq", isHidden: false },
          { input: "antigravity", expectedOutput: "ytivargitna", isHidden: true },
        ],
      },
      scoringConfig: {},
    },
    // CODING 3
    {
      moduleType: ModuleType.CODING,
      role: "QA",
      difficulty: "medium",
      tags: ["javascript", "coding-even"],
      content: {
        prompt: "Write a program that reads an integer on each line from standard input (stdin) and prints 'true' if the number is even, or 'false' otherwise, to standard output (stdout).",
        starterCode: {
          javascript:
            "const fs = require('fs');\n\nfunction isEven(n) {\n  // Write your code here\n  return false;\n}\n\nconst input = fs.readFileSync(0, 'utf-8').trim();\nif (input) {\n  const lines = input.split('\\n');\n  for (const line of lines) {\n    if (!line.trim()) continue;\n    const n = parseInt(line.trim(), 10);\n    console.log(isEven(n) ? 'true' : 'false');\n  }\n}",
          python:
            "import sys\n\ndef is_even(n: int) -> bool:\n    # Write your code here\n    return False\n\nfor line in sys.stdin:\n    if not line.strip():\n        continue\n    n = int(line.strip())\n    print('true' if is_even(n) else 'false')",
        },
        testCases: [
          { input: "4", expectedOutput: "true", isHidden: false },
          { input: "7", expectedOutput: "false", isHidden: false },
          { input: "100", expectedOutput: "true", isHidden: true },
          { input: "-5", expectedOutput: "false", isHidden: true },
        ],
      },
      scoringConfig: {},
    },

    // AI PROMPTING 1
    {
      moduleType: ModuleType.AI_PROMPTING,
      role: "QA",
      difficulty: "medium",
      tags: ["prompting-login"],
      content: {
        prompt: "Prompt the LLM to generate 3 test cases for a login page.",
        rubric: "Ensure prompt includes boundary conditions.",
      },
      scoringConfig: {},
    },
    // AI PROMPTING 2
    {
      moduleType: ModuleType.AI_PROMPTING,
      role: "QA",
      difficulty: "medium",
      tags: ["prompting-bug"],
      content: {
        prompt: "Prompt the LLM to explain a NullPointerException in Java.",
        rubric: "Ensure response structure is friendly for beginners.",
      },
      scoringConfig: {},
    },
    // AI PROMPTING 3
    {
      moduleType: ModuleType.AI_PROMPTING,
      role: "QA",
      difficulty: "medium",
      tags: ["prompting-sql"],
      content: {
        prompt: "Prompt the LLM to write a complex SQL join query.",
        rubric: "Ensure it requests optimization tips.",
      },
      scoringConfig: {},
    },

    // SIMULATION 1
    {
      moduleType: ModuleType.SIMULATION,
      role: "QA",
      difficulty: "medium",
      tags: ["simulation-prod-outage"],
      content: {
        title: "Production Outage: High CPU Spike",
        description: "A production incident occurs shortly after a recent deployment.",
        triggers: [
          {
            type: "ticket",
            from: "Datadog Alert Bot",
            body: "CRITICAL: Database instance db-prod-primary CPU utilization has exceeded 95%.",
            timestamp: "2026-07-14T10:00:00Z",
          },
        ],
        rubric: [
          { criterion: "Immediate Triaging", weight: 0.5, description: "Check logs and roll back deployment." },
        ],
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
          MCQ: { enabled: true, weight: 0.20 },
          SQL: { enabled: true, weight: 0.20 },
          CODING: { enabled: true, weight: 0.25 },
          AI_PROMPTING: { enabled: true, weight: 0.20 },
          SIMULATION: { enabled: true, weight: 0.15 },
        },
        status: DriveStatus.ACTIVE,
        createdById: staff.id,
      },
    });
  }

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
        questionVersionSnapshot: q.version ?? 1,
      },
    });
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
  console.log("Standard Test Login URL:");
  console.log(`http://localhost:3000/login?token=${token}`);
  console.log("==================================================\n");

  // 7. Fast-Timer Test Candidate (2-minute buffer)
  const fastCandidateEmail = "dev-candidate-2min@example.com";
  const fastCandidate = await prisma.candidate.upsert({
    where: { email: fastCandidateEmail },
    update: {},
    create: {
      email: fastCandidateEmail,
      name: "Dev Candidate (2Min Buffer)",
    },
  });

  const fastInviteId = "dev-invite-2min-uuid-" + Math.floor(Math.random() * 100000);
  const fastToken = jwt.sign(
    {
      inviteId: fastInviteId,
      candidateEmail: fastCandidate.email,
      candidateName: fastCandidate.name,
      roleTemplateId: roleTemplate.id,
    },
    jwtSecret,
    {
      expiresIn: `${ttlHours}h`,
    }
  );

  const fastScheduledTime = new Date(Date.now() + 5 * 60 * 1000); // 5 mins in future

  await prisma.invite.upsert({
    where: { token: fastToken },
    update: {
      bufferMinutes: 2,
      scheduledTime: fastScheduledTime,
    },
    create: {
      id: fastInviteId,
      candidateEmail: fastCandidate.email,
      candidateName: fastCandidate.name,
      roleTemplateId: roleTemplate.id,
      driveId: drive.id,
      status: InviteStatus.PENDING,
      token: fastToken,
      createdById: staff.id,
      expiresAt,
      isGenerated: true,
      scheduledTime: fastScheduledTime,
      bufferMinutes: 2,
    },
  });

  console.log("✔ 2-Minute Buffer Candidate & Invite successfully seeded!");
  console.log("==================================================");
  console.log("2-Minute Buffer Test Login URL:");
  console.log(`http://localhost:3000/login?token=${fastToken}`);
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
