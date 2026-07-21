import { PrismaClient, CvMode, SessionStatus } from "@prisma/client";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "../../../.env") });
dotenv.config({ path: path.join(__dirname, "../.env") });

const prisma = new PrismaClient();

async function main() {
  let session = await prisma.session.findFirst({
    where: {
      status: { in: [SessionStatus.IN_PROGRESS, SessionStatus.NOT_STARTED] },
    },
    include: {
      candidate: true,
      roleTemplate: true,
    },
  });

  if (!session) {
    console.log("No existing active session found. Creating a test session...");
    const candidate = await prisma.candidate.upsert({
      where: { email: "test-backend-proctoring@example.com" },
      update: {},
      create: {
        email: "test-backend-proctoring@example.com",
        name: "Test Backend Candidate",
      },
    });

    const roleTemplate = await prisma.roleTemplate.findFirst();
    if (!roleTemplate) {
      throw new Error("No RoleTemplate found. Please seed the database first.");
    }

    session = await prisma.session.create({
      data: {
        candidateId: candidate.id,
        roleTemplateId: roleTemplate.id,
        cvMode: CvMode.FULL,
        status: SessionStatus.IN_PROGRESS,
        startedAt: new Date(),
      },
      include: {
        candidate: true,
        roleTemplate: true,
      },
    });
  }

  console.log("\n==================================================");
  console.log("VALID TEST SESSION DETECTED:");
  console.log(`Session ID: ${session.id}`);
  console.log(`Candidate Email: ${session.candidate.email}`);
  console.log(`Status: ${session.status}`);
  console.log(`CV Mode: ${session.cvMode}`);
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
