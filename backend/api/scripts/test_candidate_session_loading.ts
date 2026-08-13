import { PrismaClient } from "@prisma/client";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { SessionService } from "../src/session/session.service";
import { AuthService } from "../src/auth/auth.service";
import { CandidateService } from "../src/candidate/candidate.service";
import { DriveService } from "../src/drive/drive.service";
import { CandidateIngestionService } from "../src/drive/candidate-ingestion.service";
import { CsvIngestionService } from "../src/drive/csv-ingestion.service";

import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "../../../.env") });
dotenv.config({ path: path.join(__dirname, "../../.env") });

async function testCandidateSessionLoading() {
  console.log("=== TESTING CANDIDATE SESSION LOADING & INVITE RESOLUTION ===");

  const prisma = new PrismaClient();
  await prisma.$connect();

  try {
    // Find an invite in DB
    const invite = await prisma.invite.findFirst({
      where: { token: { not: "" } },
      orderBy: { createdAt: "desc" },
      include: { drive: true, candidate: true },
    });

    if (!invite) {
      console.log("No invites found in database. Creating a test drive and candidate invite...");
      // Find active RoleTemplate
      const template = await prisma.roleTemplate.findFirst({
        where: { isActive: true },
      });
      if (!template) {
        throw new Error("No active RoleTemplate found in database.");
      }

      // Create test drive
      const drive = await prisma.drive.create({
        data: {
          name: "Session Load Test Drive",
          roleTemplateId: template.id,
          createdById: "system-test",
          status: "PUBLISHED",
          moduleConfig: {
            MCQ: { enabled: true, weightShare: 50 },
            TEST_SCENARIOS: { enabled: true, weightShare: 50 },
          },
        },
      });

      const candidate = await prisma.candidate.create({
        data: {
          name: "Test Candidate",
          email: `test_candidate_${Date.now()}@example.com`,
        },
      });

      const jwtService = new JwtService({ secret: process.env.JWT_SECRET || "test-secret" });
      const token = jwtService.sign({
        inviteId: candidate.id,
        candidateEmail: candidate.email,
        driveId: drive.id,
      });

      const newInvite = await prisma.invite.create({
        data: {
          driveId: drive.id,
          candidateId: candidate.id,
          candidateEmail: candidate.email,
          token,
          isGenerated: true,
          status: "INVITED",
        },
        include: { drive: true, candidate: true },
      });

      console.log("Created test invite with token:", token);
      await testStartSession(prisma, token);
    } else {
      console.log(`Found invite for candidate ${invite.candidateEmail} on drive ${invite.drive?.name}`);
      console.log(`Invite token: ${invite.token}`);
      await testStartSession(prisma, invite.token);
    }
  } catch (err: any) {
    console.error("❌ ERROR TESTING CANDIDATE SESSION LOADING:", err);
  } finally {
    await prisma.$disconnect();
  }
}

async function testStartSession(prisma: any, token: string) {
  const jwtService = new JwtService({ secret: process.env.JWT_SECRET || "super-secret-default-key-for-cd-recruit-development-only" });
  const configService = new ConfigService({
    JWT_SECRET: process.env.JWT_SECRET || "super-secret-default-key-for-cd-recruit-development-only",
  });
  const authService = new AuthService(prisma, jwtService, configService);
  const candidateService = new CandidateService(prisma);
  const minioService = {} as any;
  const queueProvider = {} as any;
  const sandboxOrchestrator = {} as any;

  const sessionService = new SessionService(
    prisma,
    configService,
    authService,
    candidateService,
    minioService,
    queueProvider,
    sandboxOrchestrator
  );

  console.log("Calling sessionService.startSession({ inviteToken: token })...");
  const res = await sessionService.startSession({ inviteToken: token });
  console.log("✅ SUCCESS! startSession result:");
  console.log("- Session ID:", res.sessionId);
  console.log("- Status:", res.status);
  console.log("- CV Mode:", res.cvMode);
  console.log("- Duration:", res.durationMinutes, "minutes");
  console.log("- Questions Count:", res.questions ? res.questions.length : 0);
  if (res.questions && res.questions.length > 0) {
    console.log("- Sample Question 1:", res.questions[0].questionId, "| Module:", res.questions[0].moduleType);
  }
}

testCandidateSessionLoading();
