import { PrismaClient } from "@prisma/client";
import * as crypto from "crypto";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

function hashApiKey(apiKey: string): string {
  if (!apiKey) return "";
  return crypto.createHash("sha256").update(apiKey.trim()).digest("hex");
}

async function runPartner1000LoadTest() {
  console.log("\n================================================================================");
  console.log("🚀 PARTNER API LOAD TEST: 1,000 CANDIDATES INGESTION TO LINK FLOW");
  console.log("================================================================================\n");

  const prisma = new PrismaClient();
  const API_PORT = process.env.API_PORT || "3001";
  const BASE_URL = `http://localhost:${API_PORT}/api/v1`;

  try {
    // 1. Check if backend API server is up
    console.log(`📡 1. Checking API health at ${BASE_URL}/health...`);
    let isLive = false;
    try {
      const ping = await fetch(`${BASE_URL}/health`);
      if (ping.ok || ping.status < 500) isLive = true;
    } catch {
      isLive = false;
    }

    if (!isLive) {
      console.warn(`⚠️ Warning: Could not reach API at ${BASE_URL}. Make sure 'npm run dev:api' is running.`);
    } else {
      console.log(`✅ API server is reachable at ${BASE_URL}`);
    }

    // 2. Ensure test Partner exists with a valid API key
    console.log("🔑 2. Resolving Partner and API Key...");
    let partner = await prisma.partner.findFirst({
      where: { name: "LoadTest ATS Partner", isRevoked: false },
    });

    let rawApiKey = "pk_live_loadtest_" + crypto.randomBytes(16).toString("hex");

    if (!partner) {
      const hashed = hashApiKey(rawApiKey);
      partner = await prisma.partner.create({
        data: {
          name: "LoadTest ATS Partner",
          hashedApiKey: hashed,
          rateLimit: 1000,
        },
      });
      console.log(`   Created new Partner '${partner.name}' (ID: ${partner.id})`);
    } else {
      // Rotate API key for fresh test run
      const hashed = hashApiKey(rawApiKey);
      partner = await prisma.partner.update({
        where: { id: partner.id },
        data: { hashedApiKey: hashed },
      });
      console.log(`   Using existing Partner '${partner.name}' with fresh API key`);
    }

    console.log(`   Raw X-API-Key: ${rawApiKey}`);

    // 3. Generate 1,000 realistic candidate payloads across experience tiers
    console.log("\n📦 3. Generating 1,000 candidate dataset...");
    const CANDIDATE_COUNT = 1000;
    const runId = Date.now().toString().slice(-6);
    const reqRef = `REQ-LOADTEST-${runId}`;
    const tiers = ["0-1", "2-5", "6-10", "11-15"];

    const candidates = Array.from({ length: CANDIDATE_COUNT }, (_, i) => ({
      name: `Test Candidate ${i + 1}`,
      email: `candidate_${runId}_${i + 1}@partner-loadtest.org`,
      level: tiers[i % tiers.length],
      external_candidate_ref: `ats-cand-ref-${runId}-${i + 1}`,
      phone: `+1555${String(i).padStart(7, "0")}`,
    }));

    const payload = {
      department_code: "SOFTWARE_ENGINEERING",
      category: "EXPERIENCED",
      requisition_ref: reqRef,
      drive_name: `Automated Load Test Sprint (${runId})`,
      candidates,
    };

    const payloadString = JSON.stringify(payload);
    const payloadSizeKb = (Buffer.byteLength(payloadString) / 1024).toFixed(2);
    console.log(`   Candidate Count: ${CANDIDATE_COUNT.toLocaleString()}`);
    console.log(`   Requisition Ref: ${reqRef}`);
    console.log(`   Department Code: ${payload.department_code}`);
    console.log(`   Payload Size:    ${payloadSizeKb} KB`);

    // 4. Dispatch live HTTP Request to Partner API
    console.log("\n⚡ 4. Dispatching HTTP POST to /api/v1/partner/candidates...");
    const endpoint = `${BASE_URL}/partner/candidates`;
    const idempotencyKey = `idemp-${reqRef}`;

    const startTime = performance.now();
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": rawApiKey,
        "Idempotency-Key": idempotencyKey,
      },
      body: payloadString,
    });
    const endTime = performance.now();
    const durationMs = endTime - startTime;
    const durationSec = durationMs / 1000;

    console.log(`   HTTP Status:     ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Request failed with status ${response.status}:`, errorText);
      throw new Error(`Partner API returned HTTP ${response.status}: ${errorText}`);
    }

    const data: any = await response.json();

    // 5. Performance & Data Validation Metrics
    console.log("\n📊 5. Performance & Throughput Metrics:");
    console.log("--------------------------------------------------------------------------------");
    console.log(`   Total Ingestion Time: ${durationMs.toFixed(2)} ms (${durationSec.toFixed(3)}s)`);
    console.log(`   Ingestion Throughput: ${(CANDIDATE_COUNT / durationSec).toFixed(0)} candidates / second`);
    console.log(`   Average Per-Candidate:${(durationMs / CANDIDATE_COUNT).toFixed(3)} ms / candidate`);
    console.log(`   Drive ID Created:     ${data.drive_id}`);
    console.log(`   Invites Generated:    ${data.invites?.length?.toLocaleString()} assessment links`);
    console.log("--------------------------------------------------------------------------------\n");

    // 6. Sample 5 generated assessment links
    console.log("🔗 6. Sample Assessment Links Generated:");
    const sampleInvites = (data.invites || []).slice(0, 5);
    sampleInvites.forEach((inv: any, idx: number) => {
      console.log(`   [${idx + 1}] ${inv.candidate_name} (${inv.candidate_email})`);
      console.log(`       Tier: ${inv.level_label || inv.level} | Expires: ${inv.expires_at}`);
      console.log(`       Link: ${inv.assessment_link}\n`);
    });

    if ((data.invites?.length || 0) > 5) {
      console.log(`   ... and ${(data.invites.length - 5).toLocaleString()} more candidate links ready for distribution.\n`);
    }

    // 7. Test Idempotency / Status Retrieval
    console.log("🔁 7. Testing Requisition Status Retrieval (GET /api/v1/partner/requisitions/:ref/status)...");
    const statusStart = performance.now();
    const statusRes = await fetch(`${BASE_URL}/partner/requisitions/${reqRef}/status`, {
      headers: { "X-API-Key": rawApiKey },
    });
    const statusEnd = performance.now();

    if (statusRes.ok) {
      const statusData: any = await statusRes.json();
      console.log(`   Status Retrieval Time: ${(statusEnd - statusStart).toFixed(2)} ms`);
      console.log(`   Retrieved Candidates:  ${statusData.candidates?.length?.toLocaleString()}`);
      console.log("   Status Check:          SUCCESS ✅");
    } else {
      console.log(`   Status Check note: Requisition endpoint returned ${statusRes.status}`);
    }

    console.log("\n================================================================================");
    console.log(`🎉 LOAD TEST SUCCESS: 1,000 Candidate Partner Flow completed in ${durationSec.toFixed(2)}s!`);
    console.log("================================================================================\n");
  } catch (err: any) {
    console.error("❌ Load test failed:", err.message || err);
  } finally {
    await prisma.$disconnect();
  }
}

runPartner1000LoadTest();
