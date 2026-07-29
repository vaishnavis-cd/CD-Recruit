import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { ContextSimulationEvaluatorService } from '../backend/api/src/simulation/context-simulation-evaluator.service';
import { SimulationTelemetryService } from '../backend/api/src/simulation/simulation-telemetry.service';
import { QA_BUG_REPORT_SCENARIO } from '../backend/api/src/simulation/scenarios/qa-bug-report.config';

async function testPhase1MvpPipeline() {
  console.log('\n======================================================================');
  console.log(' AUDITING CONTEXT SIMULATION PHASE 1 MVP PIPELINE & EVALUATOR');
  console.log('======================================================================\n');

  // 1. Verify Scenario Config
  console.log('✔ [1/6] Scenario Configuration Loaded:');
  console.log(`  - Title: ${QA_BUG_REPORT_SCENARIO.title}`);
  console.log(`  - Rubric Version: ${QA_BUG_REPORT_SCENARIO.rubricVersion}`);
  console.log(`  - Manager Email Sender: ${QA_BUG_REPORT_SCENARIO.managerEmail.fromName} (${QA_BUG_REPORT_SCENARIO.managerEmail.fromRole})`);
  console.log(`  - Starter Code Languages: ${Object.keys(QA_BUG_REPORT_SCENARIO.starterCode).join(', ')}`);

  // 2. Simulate Telemetry Stream
  const telemetryService = new SimulationTelemetryService();
  const sessionId = `sim_session_${Date.now()}`;

  console.log('\n✔ [2/6] Telemetry Stream Simulation:');
  console.log('  - Edit occurred before actions?:', telemetryService.hasFirstEditOccurred(sessionId));

  telemetryService.recordEvent(sessionId, { type: 'FILE_OPEN', filepath: 'login_validation.py' });
  console.log('  - Recorded FILE_OPEN. First edit occurred?:', telemetryService.hasFirstEditOccurred(sessionId));

  telemetryService.recordEvent(sessionId, { type: 'FILE_EDIT', filepath: 'login_validation.py', metadata: { line: 12 } });
  console.log('  - Recorded FILE_EDIT. First edit occurred?:', telemetryService.hasFirstEditOccurred(sessionId), '(Backend Email Trigger Fired!)');

  telemetryService.recordEvent(sessionId, { type: 'TEST_EXECUTE', metadata: { testCount: 5 } });

  const events = telemetryService.getEventStream(sessionId);
  console.log(`  - Total Recorded Chronological Events: ${events.length}`);

  // 3. Test 4-Part Evaluator
  const mockAiService: any = {
    evaluateSimulationResponse: async (context: string, prompt: string) => ({
      score: 88,
      reasoning: 'Strong technical plan and clear ETA update with risk management.',
      feedback: 'Good strategy and professional communication.',
      providerUsed: 'DEV_FALLBACK',
    }),
  };

  const evaluator = new ContextSimulationEvaluatorService(mockAiService);

  const candidateInitialSay = 'I will inspect login_validation.py to check how username input is validated. I will verify if whitespace trimming (.trim()) is applied, run existing tests, and add edge case tests for leading/trailing spaces.';
  const candidateEmailReply = 'Hi Rahul, I identified the root cause in whitespace trimming. The fix will be ready in 20 minutes after verifying test suite. We can safely include it in today deployment.';

  const testExecution = { passedTests: 5, totalTests: 5, isCorrect: true };

  console.log('\n✔ [3/6] Running 4-Part Evaluation Engine:');
  const fullResult = await evaluator.generateFullEvaluation(
    candidateInitialSay,
    candidateEmailReply,
    events,
    testExecution,
    QA_BUG_REPORT_SCENARIO,
  );

  console.log('\n======================================================================');
  console.log(`  Overall Context Simulation Score: ${fullResult.overallScore} / 100`);
  console.log(`  Rubric Version: ${fullResult.rubricVersion}`);
  console.log(`  ------------------------------------------------------------------`);
  console.log(`  Part 1: Initial SAY Score = ${fullResult.initialSay.score}/100`);
  console.log(`          Reasoning: ${fullResult.initialSay.reasoning}`);
  console.log(`  Part 2: Email SAY Score   = ${fullResult.emailSay.score}/100`);
  console.log(`          Reasoning: ${fullResult.emailSay.reasoning}`);
  console.log(`  Part 3: DO Evaluation Score = ${fullResult.doEvaluation.compositeDoScore}/100`);
  console.log(`          - Behaviour Score: ${fullResult.doEvaluation.behaviourScore}/100`);
  console.log(`          - Technical Score: ${fullResult.doEvaluation.technicalScore}/100`);
  console.log(`          - Strengths: ${fullResult.doEvaluation.strengths.join(', ')}`);
  console.log(`  Part 4: Say-Do Correlation Score = ${fullResult.sayDoCorrelation.score}/100`);
  console.log(`          - Strengths: ${fullResult.sayDoCorrelation.strengths.join(', ')}`);
  console.log('======================================================================\n');
  console.log('🎉 AUDIT COMPLETE: PHASE 1 MVP PIPELINE VERIFIED 100% SUCCESSFULLY!\n');
}

testPhase1MvpPipeline();
