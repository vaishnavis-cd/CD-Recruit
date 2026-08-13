import { PrismaClient, DriveStatus } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { DriveService } from '../src/drive/drive.service';
import { CandidateIngestionService } from '../src/drive/candidate-ingestion.service';
import { CsvIngestionService } from '../src/drive/csv-ingestion.service';
import { SessionService } from '../src/session/session.service';
import { AuthService } from '../src/auth/auth.service';
import { CandidateService } from '../src/candidate/candidate.service';

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../../.env') });
dotenv.config({ path: path.join(__dirname, '../../.env') });
dotenv.config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();

async function testDriveSessionActivation() {
  console.log('============================================================');
  console.log('TESTING DRIVE CREATION & CANDIDATE SESSION ACTIVATION FLOW');
  console.log('============================================================\n');

  // 1. Create a Software Engineer Drive with candidate
  const candidateEmail = `test.candidate.${Date.now()}@proctora.io`;
  const candidateName = 'Test Activation Candidate';

  const mockConfig = {
    get: (key: string) => {
      if (key === 'jwtSecret') return process.env.JWT_SECRET || 'super-secret-key-for-jwt-token-generation';
      if (key === 'graceWindowSeconds') return 1200;
      if (key === 'maxDisconnectCount') return 5;
      if (key === 'app.minio.bucketBiometric') return 'biometrics';
      return null;
    },
  };

  const authService = new AuthService(
    new JwtService({ secret: process.env.JWT_SECRET || 'super-secret-key-for-jwt-token-generation' }) as any,
    mockConfig as any,
    prisma as any,
  );

  const candidateService = new CandidateService(prisma as any);
  const candidateIngestion = new CandidateIngestionService(prisma as any, authService as any);
  const csvIngestion = new CsvIngestionService(candidateIngestion as any);

  const driveService = new DriveService(
    prisma as any,
    authService as any,
    candidateIngestion as any,
    csvIngestion as any,
  );

  const staffUser = await prisma.staff.findFirst();
  if (!staffUser) {
    throw new Error('No staff user found in database');
  }

  console.log('1. Creating Drive for Software Engineer (SOFTWARE_ENGINEERING / FRESHER)...');
  const driveResult = await driveService.create(
    {
      name: `Drive Test ${Date.now()}`,
      roleTemplateId: 'SOFTWARE_ENGINEERING',
      status: DriveStatus.ACTIVE,
      scheduleStart: new Date(Date.now() - 3600000).toISOString(),
      scheduleEnd: new Date(Date.now() + 86400000).toISOString(),
      candidates: [{ name: candidateName, email: candidateEmail }],
    },
    staffUser.id,
  );

  console.log(`  Drive Created! ID: ${driveResult.driveId}, Status: ${driveResult.status}`);

  // 2. Fetch the generated Invite record & token
  const invite = await prisma.invite.findFirst({
    where: { driveId: driveResult.driveId, candidateEmail },
  });

  if (!invite || !invite.token) {
    throw new Error('❌ Failed: Invite token was not generated for candidate!');
  }

  console.log(`  Invite Token Generated: ${invite.token.slice(0, 16)}...`);

  // 3. Test SessionService.startSession using the invite token
  const mockConfigService = new ConfigService({
    graceWindowSeconds: 1200,
    maxDisconnectCount: 5,
    'app.minio.bucketBiometric': 'biometrics',
  });

  const sessionService = new SessionService(
    prisma as any,
    authService as any,
    candidateService as any,
    mockConfigService as any,
    null as any, // MinioService
    null as any, // QueueProviderPort
    null as any, // SessionLifecycleService
    null as any, // SessionStateMachine
    null as any, // SessionScoringService
    null as any, // SandboxOrchestratorService
  );

  console.log('\n2. Activating Candidate Session via SessionService.startSession(token)...');
  const startResponse = await sessionService.startSession(invite.token);

  console.log(`  Session ID: ${startResponse.sessionId}`);
  console.log(`  Status: ${startResponse.status}`);
  console.log(`  Questions Count: ${startResponse.questions?.length}`);

  if (startResponse.questions && startResponse.questions.length > 0) {
    console.log('\nSample Selected Question:');
    console.log(`  ID: ${startResponse.questions[0].questionId}`);
    console.log(`  Module: ${startResponse.questions[0].moduleType}`);
    console.log(`  Difficulty: ${startResponse.questions[0].difficulty}`);
    console.log('\n✅ SUCCESS: Candidate Session Activated Smoothly with 0 Errors!');
  } else {
    console.error('\n❌ FAILURE: Session activated but no questions returned!');
  }

  await prisma.$disconnect();
}

testDriveSessionActivation().catch((err) => {
  console.error(err);
  process.exit(1);
});
