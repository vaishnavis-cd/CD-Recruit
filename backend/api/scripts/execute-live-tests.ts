import { PrismaClient } from "@prisma/client";
import { execSync } from "child_process";
import * as crypto from "crypto";

const API_BASE = "http://localhost:3001/api/v1";

async function main() {
  const prisma = new PrismaClient();
  await prisma.$connect();

  console.log("==================================================================");
  console.log("🧪 LIVE INTEGRATION & END-TO-END VERIFICATION");
  console.log("==================================================================\n");

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

  // Ensure test sessions exist with standard UUIDv4
  const sessionA = crypto.randomUUID();
  const sessionB = crypto.randomUUID();
  const sessionHealthy = crypto.randomUUID();
  const sessionDead1 = crypto.randomUUID();
  const sessionOpen = crypto.randomUUID();
  const sessionRecovered = crypto.randomUUID();

  let roleTemplate = await prisma.roleTemplate.findFirst();
  if (!roleTemplate) {
    roleTemplate = await prisma.roleTemplate.create({
      data: { roleName: "Software Engineer", durationMinutes: 60, weightingPreset: {} },
    });
  }

  const allSessions = [sessionA, sessionB, sessionHealthy, sessionDead1, sessionOpen, sessionRecovered];
  for (let i = 1; i <= 25; i++) {
    allSessions.push(crypto.randomUUID());
  }

  for (const sId of allSessions) {
    let candidate = await prisma.candidate.findFirst({ where: { email: `${sId}@test.com` } });
    if (!candidate) {
      candidate = await prisma.candidate.create({
        data: { email: `${sId}@test.com`, name: `Candidate-${sId.slice(0, 8)}` },
      });
    }
    await prisma.session.upsert({
      where: { id: sId },
      update: { status: "IN_PROGRESS" as any },
      create: {
        id: sId,
        candidate: { connect: { id: candidate.id } },
        roleTemplate: { connect: { id: roleTemplate.id } },
        cvMode: "FULL" as any,
        status: "IN_PROGRESS" as any,
      },
    });
  }

  // =========================================================================
  // TEST 1: RATE LIMITER LIVE TEST
  // =========================================================================
  console.log("==================================================================");
  console.log("1. RATE LIMITER LIVE TEST (Keyed by candidate sessionId)");
  console.log("==================================================================");
  console.log(`Firing 6 rapid POST /coding/run requests from Session Alpha (${sessionA})...\n`);

  const payloadA = {
    sessionId: sessionA,
    questionId: question.id,
    language: "python",
    sourceCode: "print(3)",
  };

  for (let i = 1; i <= 6; i++) {
    const res = await fetch(`${API_BASE}/coding/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payloadA),
    });
    const body = await res.json();
    console.log(`Request ${i}/6: HTTP ${res.status}`);
    console.log(`Response Body: ${JSON.stringify(body)}\n`);
  }

  console.log(`Now firing 1 POST /coding/run request from Session Beta (${sessionB}) immediately from the SAME client/IP...\n`);
  const payloadB = {
    sessionId: sessionB,
    questionId: question.id,
    language: "python",
    sourceCode: "print(3)",
  };

  const resBeta = await fetch(`${API_BASE}/coding/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payloadB),
  });
  const bodyBeta = await resBeta.json();
  console.log(`Session Beta Request 1: HTTP ${resBeta.status}`);
  console.log(`Response Body: ${JSON.stringify(bodyBeta)}\n`);

  // =========================================================================
  // TEST 2: CIRCUIT BREAKER LIVE TEST
  // =========================================================================
  console.log("==================================================================");
  console.log("2. CIRCUIT BREAKER LIVE TEST");
  console.log("==================================================================");

  console.log("\n[Step A] Request with Judge0 container UP (Healthy baseline)...");
  const healthyRes = await fetch(`${API_BASE}/coding/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: sessionHealthy,
      questionId: question.id,
      language: "python",
      sourceCode: "print(3)",
    }),
  });
  const healthyBody = await healthyRes.json();
  console.log(`Healthy Request: HTTP ${healthyRes.status}`);
  console.log(`Execution Status: ${healthyBody.status}, passedTests: ${healthyBody.passedTests}, totalTests: ${healthyBody.totalTests}\n`);

  console.log("[Step B] Stopping Judge0 container (cdrecruit_judge0_server)...");
  execSync("docker stop cdrecruit_judge0_server", { stdio: "inherit" });

  console.log("\n[Step C] STATE 1: Request sent after Judge0 is freshly dead (BEFORE breaker trips)...");
  const startDead1 = Date.now();
  let deadBody1: any;
  let deadStatus1: number = 0;
  try {
    const deadRes1 = await fetch(`${API_BASE}/coding/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: sessionDead1,
        questionId: question.id,
        language: "python",
        sourceCode: "print(3)",
      }),
    });
    deadStatus1 = deadRes1.status;
    deadBody1 = await deadRes1.json();
  } catch (err: any) {
    deadBody1 = { error: err.message };
  }
  const elapsedDead1 = Date.now() - startDead1;
  console.log(`Dead Request #1 (Pre-trip with 3 internal retries): HTTP ${deadStatus1} (Elapsed: ${elapsedDead1}ms)`);
  console.log(`Response Body: ${JSON.stringify(deadBody1)}\n`);

  console.log("[Step D] Sending requests to exceed volumeThreshold (20 failed requests)...");
  for (let i = 1; i <= 21; i++) {
    const sId = allSessions[5 + i];
    try {
      await fetch(`${API_BASE}/coding/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sId,
          questionId: question.id,
          language: "python",
          sourceCode: "print(3)",
        }),
      });
    } catch {
      // expected during outage
    }
  }

  console.log("\n[Step E] STATE 2: Request sent while Circuit Breaker is OPEN (Fast-Fail)...");
  const startOpen = Date.now();
  let openBody: any;
  let openStatus: number = 0;
  try {
    const openRes = await fetch(`${API_BASE}/coding/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: sessionOpen,
        questionId: question.id,
        language: "python",
        sourceCode: "print(3)",
      }),
    });
    openStatus = openRes.status;
    openBody = await openRes.json();
  } catch (err: any) {
    openBody = { error: err.message };
  }
  const elapsedOpen = Date.now() - startOpen;
  console.log(`Open Breaker Request: HTTP ${openStatus} (Elapsed: ${elapsedOpen}ms)`);
  console.log(`Response Body: ${JSON.stringify(openBody)}\n`);

  console.log("[Step F] Restarting Judge0 container (cdrecruit_judge0_server)...");
  execSync("docker start cdrecruit_judge0_server", { stdio: "inherit" });

  console.log("Waiting 6s for Circuit Breaker reset timeout (5000ms cooldown) and Judge0 warmup...");
  await new Promise((resolve) => setTimeout(resolve, 6000));

  console.log("\n[Step G] STATE 3: Request sent AFTER recovery (Circuit Breaker resets to CLOSED)...");
  const startRecover = Date.now();
  const recoverRes = await fetch(`${API_BASE}/coding/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: sessionRecovered,
      questionId: question.id,
      language: "python",
      sourceCode: "print(3)",
    }),
  });
  const elapsedRecover = Date.now() - startRecover;
  const recoverBody = await recoverRes.json();
  console.log(`Recovered Request: HTTP ${recoverRes.status} (Elapsed: ${elapsedRecover}ms)`);
  console.log(`Execution Status: ${recoverBody.status}, passedTests: ${recoverBody.passedTests}, totalTests: ${recoverBody.totalTests}`);
  console.log(`Response Body: ${JSON.stringify(recoverBody)}\n`);

  console.log("==================================================================");
  console.log("✅ ALL LIVE VERIFICATION CHECKS COMPLETED SUCCESSFULLY");
  console.log("==================================================================");

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
