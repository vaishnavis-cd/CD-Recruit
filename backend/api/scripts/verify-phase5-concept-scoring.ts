import path from "path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
import { ConfigService } from "@nestjs/config";
import { AiEvaluationService } from "../src/integrations/ai/ai-evaluation.service";
import { TestScenarioScoringService } from "../src/test-scenarios/test-scenario-scoring.service";

console.log("=== PHASE 5 TEST SCENARIOS CONCEPT-CHECKLIST SCORING VERIFICATION ===");

const configService = new ConfigService();
const aiService = new AiEvaluationService(configService);
const scoringService = new TestScenarioScoringService(aiService);

async function run() {
  const prompt = "Your monitoring tool alerts that a company laptop connected to a known malicious IP. Describe how you'd respond.";
  const expectedConcepts = [
    "isolate device from network",
    "identify responsible process/connection",
    "check for malware/indicators of compromise",
    "preserve logs/evidence",
    "escalate per incident response policy",
    "notify security team"
  ];

  const candidateAnswer = "I would immediately isolate the device from the network to prevent lateral movement. Then I will identify the responsible process connecting to the IP and check for malware indicators. Finally, I will preserve all system logs and notify the security team.";

  console.log("Scenario Prompt:", prompt);
  console.log("Candidate Answer:", candidateAnswer);
  console.log("\nExecuting Concept Match Scoring...");

  const result = await scoringService.scoreTestScenarioResponse(prompt, expectedConcepts, candidateAnswer);

  console.log("\n--- RESULT ---");
  console.log("Provider Used:", result.providerUsed);
  console.log(`Score: ${result.score}% (${result.matchedCount}/${result.totalConcepts} concepts matched)`);
  console.log("\nItemized Concept Match Breakdown:");
  for (const item of result.conceptMatches) {
    console.log(`- [${item.matched ? "MATCH" : "NO-MATCH"}] ${item.concept} --> ${item.reasoning}`);
  }
}

run().catch((e) => {
  console.error("Test failed:", e);
  process.exit(1);
});
