export interface AIScenarioNarrative {
  companyName: string;
  projectName: string;
  qaTicketId: string;
  qaTicketTitle: string;
  qaTicketDescription: string;
  managerPersona: {
    name: string;
    role: string;
    email: string;
  };
  initialSlackPrompt: string;
  managerEmailBody: string;
}

export interface ContextSimulationScenarioConfig {
  id: string;
  title: string;
  description: string;
  track: "fresher" | "experienced";
  rubricVersion: string;
  initialSayPrompt: string;
  managerEmail: {
    fromName: string;
    fromRole: string;
    fromEmail: string;
    subject: string;
    body: string;
  };
  starterCode: Record<string, string>;
  testCases: Array<{
    input: string;
    expectedOutput: string;
    isHidden?: boolean;
    label?: string;
  }>;
  evaluationCriteria: {
    initialSayWeight: number;
    emailSayWeight: number;
    doBehaviourWeight: number;
    doTechnicalWeight: number;
    sayDoCorrelationWeight: number;
  };
}
