import { AiEvaluationService } from "./ai/ai-evaluation.service";
import { Judge0Service } from "./judge0/judge0.service";
import { Judge0Client } from "./judge0/judge0.client";
import { MinioService } from "./minio/minio.service";
import { AadhaarOcrService } from "./ocr/aadhaar-ocr.service";
import { FaceVerifyOnnxService } from "./face-verify-onnx/face-verify-onnx.service";
import { ONNX_ARCFACE_THRESHOLD } from "./face-verify-onnx/threshold";
import { FaceVerifyClient } from "./face-verify/face-verify.client";
import { ExecutionStatus } from "@cd-recruit/shared-types";
import { JUDGE0_STATUS } from "./judge0/judge0.constants";
import assert from "node:assert";

async function runIntegrationsTests() {
  console.log("================================================================================");
  console.log("Running Characterization & Regression Tests for Integrations Subsystem");
  console.log("================================================================================");

  let testPassed = 0;
  let testTotal = 0;

  function pass(msg: string) {
    testTotal++;
    testPassed++;
    console.log(`✅ PASS: ${msg}`);
  }

  // ---------------------------------------------------------------------------
  // TEST 1: AiEvaluationService Dual Provider & Heuristic Fallback
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 1] Testing AiEvaluationService prompt, simulation, and scenario evaluation...");

    const mockConfig: any = {
      get: (_key: string) => "", // Empty keys trigger deterministic heuristic dev fallback
    };

    const aiService = new AiEvaluationService(mockConfig);

    // 1.1 Prompting evaluation
    const promptRes = await aiService.evaluatePromptingResponse(
      "Write a prompt to generate unit tests",
      "Act as an expert software tester. Given this Python function, write comprehensive pytest test cases including edge cases.",
    );
    assert(promptRes.score !== null && promptRes.score >= 0, "Prompting score must be a number");
    assert(promptRes.reasoning.length > 0, "Reasoning must not be empty");
    assert(promptRes.providerUsed === "DEV_FALLBACK" || promptRes.providerUsed === "GROQ", "Provider must be identified");
    pass("evaluatePromptingResponse returns structured evaluation with score and reasoning");

    // 1.2 Simulation evaluation
    const simRes = await aiService.evaluateSimulationResponse(
      "Production service memory spike",
      "Investigated logs, identified memory leak in auth middleware, deployed fix with rollback plan.",
    );
    assert(simRes.score !== null && simRes.score >= 0, "Simulation score must be a number");
    pass("evaluateSimulationResponse evaluates incident response actions");

    // 1.3 Test Scenario evaluation with semantic tolerance
    const scenarioRes = await aiService.evaluateTestScenarioResponse(
      "Explain the difference between authentication and authorization.",
      "Authentication verifies identity (who you are), while authorization verifies permissions (what you are allowed to access).",
      "Authn checks who you are with credentials, and authz determines access rights to specific resources.",
    );
    assert(scenarioRes.score !== null && scenarioRes.score >= 50, "Semantically matching concepts must receive positive score");
    pass("evaluateTestScenarioResponse evaluates conceptual criteria with semantic tolerance");
  }

  // ---------------------------------------------------------------------------
  // TEST 2: Judge0Service Language Mapping, Status Codes & Sandbox Barrier
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 2] Testing Judge0Service language IDs, status mappings, and sandbox safety...");

    const mockJudge0Client: any = {
      createBatchSubmissions: async () => {
        throw new Error("Judge0 connection refused: 503 Service Unavailable");
      },
    };

    const judge0Service = new Judge0Service(mockJudge0Client);

    // 2.1 Language ID resolution
    assert.strictEqual(judge0Service.getLanguageId("python"), 71, "Python language ID must be 71");
    assert.strictEqual(judge0Service.getLanguageId("javascript"), 63, "JavaScript language ID must be 63");
    assert.strictEqual(judge0Service.getLanguageId("typescript"), 74, "TypeScript language ID must be 74");
    assert.strictEqual(judge0Service.getLanguageId("java"), 62, "Java language ID must be 62");
    assert.strictEqual(judge0Service.getLanguageId("cpp"), 54, "C++ language ID must be 54");
    assert.strictEqual(judge0Service.getLanguageId("go"), 60, "Go language ID must be 60");
    pass("getLanguageId resolves canonical Judge0 IDs across all supported languages");

    // 2.2 Status code mapping
    assert.strictEqual(judge0Service.mapStatus(JUDGE0_STATUS.ACCEPTED), ExecutionStatus.COMPLETED);
    assert.strictEqual(judge0Service.mapStatus(JUDGE0_STATUS.WRONG_ANSWER), ExecutionStatus.COMPLETED);
    assert.strictEqual(judge0Service.mapStatus(JUDGE0_STATUS.TIME_LIMIT_EXCEEDED), ExecutionStatus.TIMEOUT);
    assert.strictEqual(judge0Service.mapStatus(JUDGE0_STATUS.COMPILATION_ERROR), ExecutionStatus.COMPILATION_ERROR);
    assert.strictEqual(judge0Service.mapStatus(JUDGE0_STATUS.SIGSEGV), ExecutionStatus.RUNTIME_ERROR);
    assert.strictEqual(judge0Service.mapStatus(JUDGE0_STATUS.IN_QUEUE), ExecutionStatus.PENDING);
    assert.strictEqual(judge0Service.mapStatus(JUDGE0_STATUS.PROCESSING), ExecutionStatus.RUNNING);
    pass("mapStatus correctly translates all Judge0 execution statuses to ExecutionStatus enum");

    // 2.3 Sandboxed Execution Failure Isolation (No host fallback)
    const execResult = await judge0Service.runTests(
      "print('hello')",
      71,
      "q-1",
      [{ input: "1", expectedOutput: "1", label: "Case 1" }],
    );
    assert.strictEqual(execResult.status, ExecutionStatus.FAILED, "Infrastructure failure must return FAILED");
    assert(
      execResult.stderr.includes("Judge0 sandboxed execution environment unavailable"),
      "Stderr must inform that sandboxed environment was unavailable without executing on host OS",
    );
    pass("runTests isolates sandbox infrastructure failure without falling back to host execution");
  }

  // ---------------------------------------------------------------------------
  // TEST 3: MinioService Presigned URLs & TTL Configuration
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 3] Testing MinioService presigned URL generation and TTL handling...");

    let requestedTtl = 0;
    const mockMinioClient: any = {
      bucketExists: async () => true,
      makeBucket: async () => {},
      presignedGetObject: async (_bucket: string, _key: string, ttl: number) => {
        requestedTtl = ttl;
        return `http://127.0.0.1:9000/cd-recruit-biometric/clip.webm?X-Amz-Expires=${ttl}`;
      },
    };

    const mockConfig: any = {
      get: (key: string) => {
        if (key === "evidenceClipUrlTtlSeconds") return 600;
        if (key === "minio.endpoint") return "localhost";
        if (key === "minio.port") return 9000;
        if (key === "minio.bucketBiometric") return "cd-recruit-biometric";
        if (key === "minio.bucketGeneral") return "cd-recruit-general";
        return null;
      },
    };

    const minioService = new MinioService(mockConfig);
    (minioService as any).minioClient = mockMinioClient;
    (minioService as any).storageHealthy = true;

    const url = await minioService.getSignedUrl("cd-recruit-biometric", "evidence/clip.webm");
    assert.strictEqual(requestedTtl, 600, "Should use configured TTL of 600s");
    assert(url.includes("X-Amz-Expires=600"), "Presigned URL must reflect requested expiry TTL");
    pass("MinioService generates presigned URLs respecting evidenceClipUrlTtlSeconds config");
  }

  // ---------------------------------------------------------------------------
  // TEST 4: AadhaarOcrService Anchor & Detail Parsing
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 4] Testing AadhaarOcrService regex extraction and heuristics...");

    const ocrService = new AadhaarOcrService();

    const sampleOcrText = `
Government of India
Unique Identification Authority of India
Priya Sharma
DOB: 15/08/1995
Female
8472 9183 0492
`;

    const parsed = ocrService.extractAadhaarDetails(sampleOcrText);
    assert.strictEqual(parsed.aadhaarNumber, "847291830492", "Must extract 12-digit Aadhaar number without spaces");
    assert.strictEqual(parsed.dob, "15/08/1995", "Must extract Date of Birth");
    assert.strictEqual(parsed.name, "Priya Sharma", "Must extract candidate name from line preceding DOB");
    pass("AadhaarOcrService extracts 12-digit Aadhaar number, DOB, and candidate name correctly");
  }

  // ---------------------------------------------------------------------------
  // TEST 5: Face Verification Biometric Threshold Calibration
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 5] Testing Face Verification ArcFace threshold calibration...");

    assert.strictEqual(ONNX_ARCFACE_THRESHOLD, 0.72, "Empirically calibrated ArcFace threshold must be 0.72");

    const mockConfig: any = { get: () => "http://localhost:8001" };
    const onnxService = new FaceVerifyOnnxService(mockConfig);
    await onnxService.onModuleInit(); // Safe even when local .onnx weights are not present
    pass("FaceVerifyOnnxService initializes safely with calibrated threshold 0.72");

    const client = new FaceVerifyClient(mockConfig);
    assert((client as any).baseUrl === "http://localhost:8001", "FaceVerifyClient must resolve base URL");
    pass("FaceVerifyClient resolves target service URL properly");
  }

  console.log("\n================================================================================");
  console.log(`Summary: ${testPassed}/${testTotal} tests passed successfully!`);
  console.log("================================================================================");
}

runIntegrationsTests().catch((err) => {
  console.error("❌ Characterization tests failed:", err);
  process.exit(1);
});
