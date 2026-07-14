import { ModuleType } from './enums';

export interface TestCase {
  input: string;
  expectedOutput: string;
}

export interface CodingQuestionContent {
  prompt: string;
  starterCode: string;
  language: string;
  testCasesVisible: TestCase[];
}

/** SIMULATION content shape — to be finalized in Phase 9 */
export interface SimulationQuestionContent {
  scenarioTitle: string;
  triggerEvents: unknown[]; // Email/Slack/Ticket payload — shape locked in Phase 9
}

export interface QuestionResponse {
  questionId: string;
  moduleType: ModuleType;
  content: CodingQuestionContent | SimulationQuestionContent;
}
