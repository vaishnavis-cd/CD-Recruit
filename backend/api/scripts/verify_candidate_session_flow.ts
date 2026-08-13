import axios from "axios";
import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "../../../.env") });
dotenv.config({ path: path.join(__dirname, "../../.env") });

async function verifyCandidateSessionFlow() {
  console.log("=== VERIFYING CANDIDATE SESSION END-TO-END FLOW ===");
  const prisma = new PrismaClient();
  await prisma.$connect();

  try {
    // 1. Get or create active SDE role template
    let template = await prisma.roleTemplate.findFirst({
      where: { department: "SOFTWARE_ENGINEERING", isActive: true },
    });
    if (!template) {
      template = await prisma.roleTemplate.findFirst({ where: { isActive: true } });
    }
    if (!template) {
      throw new Error("No active RoleTemplate found in database.");
    }

    console.log(`Using RoleTemplate ID: ${template.id} (${template.roleName})`);

    // 2. Create a test Drive
    const staff = await prisma.staff.findFirst();
    const staffId = staff ? staff.id : (await prisma.staff.create({ data: { name: "Test Staff", email: `staff_${Date.now()}@example.com`, role: "ADMIN" } as any })).id;

    const driveName = `Verification Drive ${Date.now()}`;
    const drive = await prisma.drive.create({
      data: {
        name: driveName,
        roleTemplateId: template.id,
        createdById: staffId,
        status: "SCHEDULED" as any,
        moduleConfig: {
          MCQ: { enabled: true, weightShare: 50 },
          TEST_SCENARIOS: { enabled: true, weightShare: 50 },
        },
      },
    });

    console.log(`Created Drive: "${drive.name}" (ID: ${drive.id})`);

    // 3. Create a test Candidate & Invite
    const candidateEmail = `candidate_test_${Date.now()}@proctora.io`;
    const candidate = await prisma.candidate.create({
      data: {
        name: "Flow Candidate Test",
        email: candidateEmail,
      },
    });

    const token = `inv_test_${Date.now()}`;
    const invite = await prisma.invite.create({
      data: {
        drive: { connect: { id: drive.id } },
        createdBy: { connect: { id: staffId } },
        candidateName: candidate.name,
        candidateEmail: candidate.email,
        roleTemplate: { connect: { id: template.id } },
        token,
        isGenerated: true,
        status: "PENDING" as any,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    console.log(`Created Invite for candidate ${candidate.email} with token: ${token}`);

    // 4. Test live API endpoint /sessions/start
    const url = "http://127.0.0.1:3001/api/v1/sessions/start";
    console.log(`Invoking ${url}...`);

    const res = await axios.post(url, { inviteToken: token });
    console.log("✅ API /sessions/start returned HTTP", res.status);
    console.log("- Session ID:", res.data.sessionId);
    console.log("- Questions Received:", res.data.questions?.length);
    console.log("- Schedule Start:", res.data.scheduleStart);
    console.log("- Grace Minutes:", res.data.graceMinutes);

    if (res.data.questions && res.data.questions.length > 0) {
      console.log("✅ PASSED: Candidate session successfully loads questions without expiring!");
    } else {
      console.error("❌ WARNING: No questions returned in session.");
    }
  } catch (err: any) {
    console.error("❌ FAILED candidate session flow:", err.response?.data || err.message);
  } finally {
    await prisma.$disconnect();
  }
}

verifyCandidateSessionFlow();
