import "dotenv/config";
process.env.INFRA_MODE = process.env.INFRA_MODE || "full";
import { NestFactory } from "@nestjs/core";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import request from "supertest";
import { execSync } from "child_process";

async function runLiveVerification() {
  console.log("==================================================================");
  console.log("🚀 STARTING PHASE 0 LIVE VERIFICATION SUITE");
  console.log("==================================================================\n");

  const app: INestApplication = await NestFactory.create(AppModule, { logger: ["error", "warn", "log"] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  const server = app.getHttpServer();

  const prisma = app.get(PrismaService);

  // Ensure a test coding question exists
  let question = await prisma.question.findFirst({
    where: { moduleType: "CODING" as any },
  });

  if (!question) {
    question = await prisma.question.create({
      data: {
        title: "Test Addition Question",
        description: "Add two numbers",
        moduleType: "CODING" as any,
        difficulty: "EASY" as any,
        status: "PUBLISHED" as any,
        content: {
          visibleTestCases: [
            { input: "1 2", expectedOutput: "3", label: "Sample 1" },
            { input: "10 20", expectedOutput: "30", label: "Sample 2" },
          ],
        },
      },
    });
  }

  const session1 = "test-session-candidate-alpha";
  const session2 = "test-session-candidate-beta";

  // --------------------------------------------------------------------------
  // TEST 1: RATE LIMITER LIVE TEST (Keyed by candidate session, not IP)
  // --------------------------------------------------------------------------
  console.log("\n==================================================================");
  console.log("TEST 1: RATE LIMITER LIVE TEST (Keyed by candidate, not IP)");
  console.log("==================================================================");
  console.log(`Sending 6 rapid POST /coding/run requests for session: ${session1}...`);

  const runPayload1 = {
    sessionId: session1,
    questionId: question.id,
    language: "python",
    sourceCode: "import sys\nprint(3)",
  };

  const rateResults: Array<{ requestNum: number; status: number; body: any }> = [];

  for (let i = 1; i <= 6; i++) {
    const res = await request(server)
      .post("/coding/run")
      .send(runPayload1);

    rateResults.push({
      requestNum: i,
      status: res.status,
      body: res.body,
    });
    console.log(` Request #${i}: HTTP ${res.status} - Body: ${JSON.stringify(res.body)}`);
  }

  console.log(`\nNow sending 1 POST /coding/run request for DIFFERENT session: ${session2} from SAME IP...`);
  const runPayload2 = {
    sessionId: session2,
    questionId: question.id,
    language: "python",
    sourceCode: "import sys\nprint(3)",
  };

  const resSession2 = await request(server)
    .post("/coding/run")
    .send(runPayload2);

  console.log(` Session 2 Request #1: HTTP ${resSession2.status} - Body: ${JSON.stringify(resSession2.body)}`);

  // --------------------------------------------------------------------------
  // TEST 2: CIRCUIT BREAKER LIVE TEST
  // --------------------------------------------------------------------------
  console.log("\n==================================================================");
  console.log("TEST 2: CIRCUIT BREAKER LIVE TEST");
  console.log("==================================================================");

  console.log("\n1. Testing with Judge0 container UP (Healthy State)...");
  const healthyRes = await request(server)
    .post("/coding/run")
    .send({
      sessionId: "healthy-test-session",
      questionId: question.id,
      language: "python",
      sourceCode: "print(3)",
    });
  console.log(` Healthy Request Status: HTTP ${healthyRes.status}`);
  console.log(` Execution Status: ${healthyRes.body?.status}, Stderr: "${healthyRes.body?.stderr || ""}"`);

  console.log("\n2. Stopping Judge0 container (cdrecruit_judge0_server)...");
  try {
    execSync("docker stop cdrecruit_judge0_server", { stdio: "inherit" });
  } catch (e: any) {
    console.warn("Docker stop warning:", e?.message);
  }

  console.log("\n3. State 1: Request sent when Judge0 is freshly dead (BEFORE breaker opens)...");
  const deadStart = Date.now();
  const deadRes1 = await request(server)
    .post("/coding/run")
    .send({
      sessionId: "dead-state-session-1",
      questionId: question.id,
      language: "python",
      sourceCode: "print(3)",
    });
  const deadDuration1 = Date.now() - deadStart;
  console.log(` Dead Request #1: HTTP ${deadRes1.status} (Elapsed: ${deadDuration1}ms)`);
  console.log(` Response Body: ${JSON.stringify(deadRes1.body)}`);

  console.log("\n4. Tripping the circuit breaker with consecutive failures (volumeThreshold = 20)...");
  for (let i = 2; i <= 22; i++) {
    await request(server)
      .post("/coding/run")
      .send({
        sessionId: `trip-breaker-session-${i}`,
        questionId: question.id,
        language: "python",
        sourceCode: "print(3)",
      });
  }

  console.log("\n5. State 2: Request sent while Circuit Breaker is OPEN (Fast-Fail in < 20ms)...");
  const openStart = Date.now();
  const openRes = await request(server)
    .post("/coding/run")
    .send({
      sessionId: "open-breaker-session",
      questionId: question.id,
      language: "python",
      sourceCode: "print(3)",
    });
  const openDuration = Date.now() - openStart;
  console.log(` Open Breaker Request: HTTP ${openRes.status} (Elapsed: ${openDuration}ms)`);
  console.log(` Response Body: ${JSON.stringify(openRes.body)}`);

  console.log("\n6. Restarting Judge0 container (cdrecruit_judge0_server)...");
  try {
    execSync("docker start cdrecruit_judge0_server", { stdio: "inherit" });
  } catch (e: any) {
    console.warn("Docker start warning:", e?.message);
  }

  console.log("Waiting 5.5s for Circuit Breaker reset timeout (5000ms) and Judge0 warmup...");
  await new Promise((resolve) => setTimeout(resolve, 5500));

  console.log("\n7. State 3: Request sent AFTER Judge0 recovery (Breaker resets/closes)...");
  const recoverStart = Date.now();
  const recoverRes = await request(server)
    .post("/coding/run")
    .send({
      sessionId: "recovered-session",
      questionId: question.id,
      language: "python",
      sourceCode: "print(3)",
    });
  const recoverDuration = Date.now() - recoverStart;
  console.log(` Recovered Request: HTTP ${recoverRes.status} (Elapsed: ${recoverDuration}ms)`);
  console.log(` Execution Status: ${recoverRes.body?.status}, passedTests: ${recoverRes.body?.passedTests}`);

  console.log("\n==================================================================");
  console.log("✅ PHASE 0 LIVE VERIFICATION SUITE COMPLETE");
  console.log("==================================================================");

  await app.close();
  process.exit(0);
}

runLiveVerification().catch((err) => {
  console.error("Live verification failed:", err);
  process.exit(1);
});
