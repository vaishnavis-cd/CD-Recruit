import { NestFactory } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { Module } from "@nestjs/common";
import { MinioModule } from "../src/integrations/minio/minio.module";
import { MinioService } from "../src/integrations/minio/minio.service";
import { ProctoringModule } from "../src/proctoring/proctoring.module";
import { ProctoringService } from "../src/proctoring/proctoring.service";
import { PrismaModule } from "../src/prisma/prisma.module";
import { configuration } from "../src/config/configuration";
import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "../../../.env") });
dotenv.config({ path: path.join(__dirname, "../../.env") });

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    PrismaModule,
    MinioModule,
    ProctoringModule,
  ],
})
class TestModule {}

async function testUploadEvidence() {
  console.log("==================================================");
  console.log("    TESTING MINIO EVIDENCE UPLOAD & INTEGRITY");
  console.log("==================================================");

  const prisma = new PrismaClient();
  await prisma.$connect();

  const app = await NestFactory.createApplicationContext(TestModule, { logger: false });
  const proctoringService = app.get(ProctoringService);
  const minioService = app.get(MinioService);

  let session = await prisma.session.findFirst({
    where: { status: "IN_PROGRESS" },
  });

  if (!session) {
    let candidate = await prisma.candidate.findFirst();
    if (!candidate) {
      candidate = await prisma.candidate.create({
        data: { name: "MinIO Test Candidate", email: `minio_test_${Date.now()}@example.com` },
      });
    }
    let roleTemplate = await prisma.roleTemplate.findFirst({ where: { isActive: true } });
    session = await prisma.session.create({
      data: {
        candidate: { connect: { id: candidate.id } },
        roleTemplate: { connect: { id: roleTemplate!.id } },
        cvMode: "FULL",
        status: "IN_PROGRESS",
      },
    });
  }

  console.log(`Using Session ID: ${session.id}`);

  const mockWebmBuffer = Buffer.from("GABM_MOCK_WEBM_VIDEO_CLIP_HEADER_DATA_1234567890_PROCTORA_INTEGRITY_SNIPPET");
  const eventDto = {
    sessionId: session.id,
    eventType: "MULTIPLE_FACES" as any,
    severity: "HIGH" as any,
    timestamp: new Date().toISOString(),
    modelVersion: "MediaPipe-Face-v1",
  };

  console.log(`\nUploading mock evidence clip (${mockWebmBuffer.length} bytes) to MinIO...`);

  const result = await proctoringService.uploadEvidenceAndCreateEvent(
    session.id,
    { originalname: "multiple_faces_clip.webm", buffer: mockWebmBuffer },
    eventDto,
  );

  console.log("\n✅ UPLOAD & INTEGRITY EVENT RESULT:");
  console.log(` - Event ID: ${result.id}`);
  console.log(` - Event Type: ${result.eventType}`);
  console.log(` - Severity: ${result.severity}`);
  console.log(` - Upload Status: ${result.uploadStatus}`);
  console.log(` - MinIO Presigned Clip URL: ${result.clipUrl}`);

  const dbEvent = await prisma.proctoringEvent.findUnique({
    where: { id: result.id },
  });

  console.log(`\n✅ Database Verification:`);
  console.log(` - DB Event ID: ${dbEvent?.id}`);
  console.log(` - DB Clip URL Key: ${dbEvent?.clipUrl}`);
  console.log(` - DB Upload Status: ${dbEvent?.uploadStatus}`);

  const stream = await minioService.getObjectStream("cd-recruit-biometric", dbEvent!.clipUrl!);
  console.log(` - MinIO Storage Object Stream Exists? ${stream ? "✅ YES (Object stored in MinIO)" : "❌ NO"}`);

  await app.close();
  await prisma.$disconnect();
}

testUploadEvidence().catch(console.error);
