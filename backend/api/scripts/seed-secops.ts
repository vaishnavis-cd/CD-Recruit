import path from "path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
import { PrismaClient, ModuleType, QuestionStatus } from "@prisma/client";

const prisma = new PrismaClient();

async function run() {
  console.log("=== PHASE 7 SECOPS SEED DATA INSERTION ===");

  const secopsMCQs = [
    {
      prompt: "Which protocol operates at the Transport layer and provides reliable, connection-oriented delivery?",
      options: ["A) UDP", "B) TCP", "C) IP", "D) ICMP"],
      correctIndex: 1,
      difficulty: "easy",
      tier: 1,
    },
    {
      prompt: "Default port number for HTTPS?",
      options: ["A) 80", "B) 21", "C) 443", "D) 3389"],
      correctIndex: 2,
      difficulty: "easy",
      tier: 1,
    },
    {
      prompt: "In Linux, which command changes file permissions?",
      options: ["A) chown", "B) chmod", "C) chgrp", "D) chdir"],
      correctIndex: 1,
      difficulty: "easy",
      tier: 1,
    },
    {
      prompt: "What does the 'C' in the CIA triad stand for?",
      options: ["A) Consistency", "B) Confidentiality", "C) Compliance", "D) Control"],
      correctIndex: 1,
      difficulty: "easy",
      tier: 1,
    },
    {
      prompt: "What is Nmap primarily used for?",
      options: ["A) Editing text files", "B) Network scanning and host/port discovery", "C) Compiling code", "D) Managing user accounts"],
      correctIndex: 1,
      difficulty: "easy",
      tier: 1,
    },
    {
      prompt: "Which Bash command would you use to search a log file for a specific string, e.g. 'failed login'?",
      options: ["A) find", "B) grep", "C) chmod", "D) top"],
      correctIndex: 1,
      difficulty: "medium",
      tier: 2,
    },
    {
      prompt: "A firewall rule blocks all inbound traffic except port 443. Which principle does this demonstrate?",
      options: ["A) Defense in depth", "B) Least privilege", "C) Zero trust", "D) Separation of duties"],
      correctIndex: 1,
      difficulty: "medium",
      tier: 2,
    },
    {
      prompt: "Which of these is an example of multi-factor authentication?",
      options: ["A) Password + memorized PIN", "B) Password + OTP to phone", "C) Two different passwords", "D) Username + password"],
      correctIndex: 1,
      difficulty: "medium",
      tier: 1,
    },
    {
      prompt: "During a suspected ransomware incident, what should be the FIRST containment action?",
      options: ["A) Restore from backup immediately", "B) Isolate the affected host from the network", "C) Notify all employees via email", "D) Run antivirus on all machines"],
      correctIndex: 1,
      difficulty: "hard",
      tier: 2,
    },
    {
      prompt: "A simple Python script needs to read a log file and count occurrences of the word 'ERROR'. Which approach is correct?",
      options: ["A) open(file).count('ERROR') on the raw file object", "B) Read line by line, use .count('ERROR') per line and sum", "C) Use os.system('ERROR')", "D) Import re and call re.delete()"],
      correctIndex: 1,
      difficulty: "hard",
      tier: 2,
    },
  ];

  const secopsTestScenarios = [
    {
      prompt: "Your monitoring tool alerts that a company laptop connected to a known malicious IP. Describe how you'd respond.",
      difficulty: "medium",
      tier: 1,
      expectedConcepts: [
        "isolate device from network",
        "identify responsible process/connection",
        "check for malware/indicators of compromise",
        "preserve logs/evidence",
        "escalate per incident response policy",
        "notify security team",
      ],
    },
    {
      prompt: "A user reports an email asking them to reset their password via a link on a domain that looks slightly off. What steps would you take?",
      difficulty: "medium",
      tier: 1,
      expectedConcepts: [
        "don't click the link",
        "verify sender domain/headers",
        "report as phishing to security team",
        "block sender/domain",
        "check if others received the same email",
        "warn/educate the user",
      ],
    },
    {
      prompt: "A service account with domain admin privileges logged into 15 different servers within 5 minutes, outside business hours. Walk through your investigation and response.",
      difficulty: "hard",
      tier: 2,
      expectedConcepts: [
        "treat as potential compromise",
        "check if activity matches expected automation",
        "review authentication logs and source IP",
        "disable/rotate account credentials",
        "isolate affected systems",
        "escalate to incident response team",
        "perform root cause analysis",
        "document timeline",
      ],
    },
  ];

  const createdIds: string[] = [];

  // Insert MCQs
  for (const mcq of secopsMCQs) {
    const q = await prisma.question.create({
      data: {
        moduleType: ModuleType.MCQ,
        role: "SECOPS",
        difficulty: mcq.difficulty,
        tags: ["SECOPS", `tier_${mcq.tier}`],
        status: QuestionStatus.PUBLISHED,
        content: {
          prompt: mcq.prompt,
          options: mcq.options,
          correctIndex: mcq.correctIndex,
          department: "SECOPS",
          tier: mcq.tier,
        },
      },
    });
    createdIds.push(q.id);
  }

  // Insert Test Scenarios
  for (const ts of secopsTestScenarios) {
    const q = await prisma.question.create({
      data: {
        moduleType: ModuleType.TEST_SCENARIOS,
        role: "SECOPS",
        difficulty: ts.difficulty,
        tags: ["SECOPS", `tier_${ts.tier}`],
        status: QuestionStatus.PUBLISHED,
        content: {
          prompt: ts.prompt,
          expectedConcepts: ts.expectedConcepts,
          department: "SECOPS",
          tier: ts.tier,
        },
      },
    });
    createdIds.push(q.id);
  }

  console.log(`Successfully inserted ${createdIds.length} SECOPS items (10 MCQs + 3 Test Scenarios).`);
  
  // Fetch raw DB rows to verify output
  const rows = await prisma.question.findMany({
    where: { id: { in: createdIds } },
  });

  console.log("\nRAW DB ROWS (CONFIRMATION):");
  rows.forEach((r, idx) => {
    console.log(`[${idx + 1}] ID: ${r.id} | Module: ${r.moduleType} | Role: ${r.role} | Diff: ${r.difficulty} | Tags: ${r.tags.join(",")}`);
  });

  await prisma.$disconnect();
}

run().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
