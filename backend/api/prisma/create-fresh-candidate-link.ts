import { PrismaClient, InviteStatus } from "@prisma/client";
import * as jwt from "jsonwebtoken";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "../../../.env") });
dotenv.config({ path: path.join(__dirname, "../.env") });

const prisma = new PrismaClient();
const jwtSecret = process.env.JWT_SECRET || "dev-jwt-secret-key-12345!!!";

async function main() {
  const timestamp = Date.now();
  const candidateEmail = `candidate-${timestamp}@example.com`;
  const candidateName = `Fresh Candidate ${timestamp.toString().slice(-4)}`;

  // 1. Create fresh Candidate
  const candidate = await prisma.candidate.create({
    data: {
      email: candidateEmail,
      name: candidateName,
    },
  });

  // 2. Fetch RoleTemplate & Staff
  const roleTemplate = await prisma.roleTemplate.findFirst();
  const staff = await prisma.staff.findFirst();
  const drive = await prisma.drive.findFirst();

  if (!roleTemplate || !staff || !drive) {
    throw new Error("Missing seeded dependencies. Run npm run seed:candidate first.");
  }

  // 3. Create Invite
  const inviteId = `invite-fresh-${timestamp}`;
  const ttlHours = 24;
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

  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

  await prisma.invite.create({
    data: {
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
      scheduledTime: new Date(),
      bufferMinutes: 15,
      graceMinutes: 120,
    },
  });

  console.log("\n==================================================");
  console.log(`NEW FRESH CANDIDATE SESSION CREATED:`);
  console.log(`Candidate Name: ${candidateName}`);
  console.log(`Candidate Email: ${candidateEmail}`);
  console.log(`Invite ID: ${inviteId}`);
  console.log(`\nDirect Candidate Test Link:`);
  console.log(`http://localhost:3000/login?token=${token}`);
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
