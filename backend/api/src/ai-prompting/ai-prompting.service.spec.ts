import { AiPromptingService } from "./ai-prompting.service";
import { validatePromptGuardrails } from "./ai-prompting-guardrails";
import { BadRequestException } from "@nestjs/common";

async function runAiPromptingCharacterizationTests() {
  console.log("================================================================================");
  console.log("Running Characterization & Regression Tests for AiPromptingService");
  console.log("================================================================================");

  let testPassed = 0;
  let testTotal = 0;

  function assert(condition: boolean, message: string) {
    testTotal++;
    if (!condition) {
      console.error(`❌ FAIL: ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    } else {
      console.log(`✅ PASS: ${message}`);
      testPassed++;
    }
  }

  // ---------------------------------------------------------------------------
  // TEST 1: Guardrails Step 1 - Length Validation (< 10 words or > 300 words)
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 1] Testing Guardrails Step 1: Length Validation...");
    const shortResult = validatePromptGuardrails("Too short prompt", { prompt: "Explain async/await" }, {});
    assert(!shortResult.passed, "Prompt under 10 words must fail guardrails");
    assert(shortResult.failedStep === 1, "Short prompt must fail at Step 1");

    const validPrompt = "Please act as a senior backend engineer and explain async await patterns with error handling in Node.js.";
    const validResult = validatePromptGuardrails(validPrompt, { prompt: "Explain async/await in Node.js", extractedKeywords: ["async", "await", "node"] }, {});
    assert(validResult.passed, "Valid length and relevant prompt must pass guardrails");
  }

  // ---------------------------------------------------------------------------
  // TEST 2: Guardrails Step 2 - Pasted Code Fragment Detection
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 2] Testing Guardrails Step 2: Pasted Code Detection...");
    const pastedCode = "function testCalculationMethod() {\n    const x = 10;\n    console.log('hello world test message');\n    return true;\n}";
    const codeResult = validatePromptGuardrails(pastedCode, { prompt: "Explain async/await" }, {});
    assert(!codeResult.passed, "Pasted code fragments must be rejected");
    assert(codeResult.failedStep === 2, "Pasted code must fail at Step 2");
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Guardrails Step 3 - Code-Request Intent Detection
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 3] Testing Guardrails Step 3: Code-Request Intent Detection...");
    const codeRequestPrompt = "Please write the python script and executable syntax for solving this problem.";
    const codeIntentResult = validatePromptGuardrails(codeRequestPrompt, { prompt: "Analyze requirements" }, {});
    assert(!codeIntentResult.passed, "Prompt asking for raw code/scripts must be rejected");
    assert(codeIntentResult.failedStep === 3, "Code-request intent must fail at Step 3");
  }

  // ---------------------------------------------------------------------------
  // TEST 4: Guardrails Step 4 - Relevance / Off-Topic Check
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 4] Testing Guardrails Step 4: Off-Topic Keyword Validation...");
    const offTopicPrompt = "Can you please write a poem about the sunny beach and ocean waves during summer vacation?";
    const offTopicResult = validatePromptGuardrails(offTopicPrompt, {
      prompt: "Design a PostgreSQL indexing strategy for high throughput order processing",
      extractedKeywords: ["postgresql", "indexing", "throughput", "order", "database"],
    }, {});
    assert(!offTopicResult.passed, "Completely off-topic prompt must be rejected");
    assert(offTopicResult.failedStep === 4, "Off-topic prompt must fail at Step 4");
  }

  // ---------------------------------------------------------------------------
  // TEST 5: AiPromptingService.run - Guardrail Rejection & 3-Strike Escalation
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 5] Testing AiPromptingService.run atomic rejection counter & 3-strike escalation...");
    let storedPayload: any = null;
    let createdIntegrityFlag: any = null;

    const mockPrisma: any = {
      question: {
        findUnique: async () => ({
          id: "prompt-1",
          content: { text: "Explain async/await in JavaScript", extractedKeywords: ["async", "javascript"] },
        }),
      },
      moduleResponse: {
        findUnique: async () => (storedPayload ? { responsePayload: storedPayload } : null),
        upsert: async (args: any) => {
          storedPayload = args.update.responsePayload;
          return { responsePayload: storedPayload };
        },
      },
      integrityFlag: {
        create: async (args: any) => {
          createdIntegrityFlag = args.data;
          return args.data;
        },
      },
      $transaction: async (fn: any) => fn(mockPrisma),
    };

    const mockAiEvalService: any = {
      generateAssistantResponse: async () => "mock response",
    };

    const service = new AiPromptingService(mockPrisma, mockAiEvalService);

    // Call 1: Short prompt (Rejection count = 1)
    const run1 = await service.run({ sessionId: "sess-1", questionId: "prompt-1", prompt: "short" });
    assert(run1.guardrailTriggered === true, "Call 1 must trigger guardrail rejection");
    assert(storedPayload.guardrailRejectionCount === 1, "Rejection count must be 1 after call 1");
    assert(!createdIntegrityFlag, "IntegrityFlag must NOT be created on 1st rejection");

    // Call 2: Short prompt (Rejection count = 2)
    const run2 = await service.run({ sessionId: "sess-1", questionId: "prompt-1", prompt: "too short" });
    assert(storedPayload.guardrailRejectionCount === 2, "Rejection count must be 2 after call 2");
    assert(!createdIntegrityFlag, "IntegrityFlag must NOT be created on 2nd rejection");

    // Call 3: Short prompt (Rejection count = 3 -> Triggers PROMPT_GUARDRAIL_ABUSE flag)
    const run3 = await service.run({ sessionId: "sess-1", questionId: "prompt-1", prompt: "still short" });
    assert(storedPayload.guardrailRejectionCount === 3, "Rejection count must be 3 after call 3");
    assert(!!createdIntegrityFlag, "IntegrityFlag must be created on 3rd guardrail abuse strike");
    assert(createdIntegrityFlag.category === "PROMPT_GUARDRAIL_ABUSE", "Flag category must be PROMPT_GUARDRAIL_ABUSE");
    assert(createdIntegrityFlag.severity === "HIGH", "Flag severity must be HIGH");
  }

  // ---------------------------------------------------------------------------
  // TEST 6: AiPromptingService.submit - Strict Guardrail Enforcement
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 6] Testing AiPromptingService.submit strict guardrail enforcement...");

    const mockPrisma: any = {
      question: {
        findUnique: async () => ({
          id: "prompt-1",
          content: { text: "Explain async/await in JavaScript", extractedKeywords: ["async", "javascript"] },
        }),
      },
    };

    const service = new AiPromptingService(mockPrisma, {} as any);

    let threwExpectedError = false;
    try {
      await service.submit({
        sessionId: "sess-1",
        questionId: "prompt-1",
        prompt: "short", // Invalid prompt
      });
    } catch (err: any) {
      if (err instanceof BadRequestException) {
        threwExpectedError = true;
      }
    }

    assert(threwExpectedError, "submit() MUST throw BadRequestException when prompt violates guardrails");
  }

  // ---------------------------------------------------------------------------
  // TEST 7: AiPromptingService.submit - Successful Scoring & Diagnostics
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 7] Testing AiPromptingService.submit composite scoring calculation...");
    let savedModuleResponse: any = null;

    const mockPrisma: any = {
      question: {
        findUnique: async () => ({
          id: "prompt-1",
          content: { text: "Design a PostgreSQL indexing strategy for order database", extractedKeywords: ["postgresql", "indexing", "database"] },
        }),
        upsert: async () => ({ id: "prompt-1" }),
      },
      moduleResponse: {
        upsert: async (args: any) => {
          savedModuleResponse = args.create.responsePayload;
          return { responsePayload: savedModuleResponse };
        },
      },
    };

    const mockAiEvalService: any = {
      evaluatePromptingResponse: async () => ({
        score: 90,
        reasoning: "Excellent detailed prompt with persona and constraint specifications.",
      }),
    };

    const service = new AiPromptingService(mockPrisma, mockAiEvalService);

    const validPrompt =
      "Act as a database architect. Please define the PostgreSQL indexing strategy for the orders table with B-Tree and GIN indexes. Constraints: Do not use table locks.";

    const result = await service.submit({
      sessionId: "sess-1",
      questionId: "prompt-1",
      prompt: validPrompt,
      timeSpentSeconds: 120,
    });

    assert(result.success === true, "Valid submission must succeed");
    assert(!!savedModuleResponse, "ModuleResponse must be saved");
    assert(savedModuleResponse.promptStructureCorrect === true, "promptStructureCorrect must be true for valid prompt");
    assert(savedModuleResponse.aiValidationScore === 90, "AI validation score must be 90");
    assert(savedModuleResponse.promptStructureScore >= 80, `Prompt structure score (${savedModuleResponse.promptStructureScore}) must be >= 80`);
    assert(savedModuleResponse.aiEvaluationSkipped === false, "aiEvaluationSkipped must be false");
  }

  console.log("\n================================================================================");
  console.log(`Summary: ${testPassed}/${testTotal} tests passed successfully!`);
  console.log("================================================================================");
}

runAiPromptingCharacterizationTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
