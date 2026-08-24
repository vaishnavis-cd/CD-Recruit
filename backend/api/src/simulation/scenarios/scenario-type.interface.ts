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

export interface ScenarioChecklistItem {
  id: string;
  label: string;
  detail: string;
  actionTab: string; // 'workspace' | 'channels' | 'signoff'
  channelTab?: string; // 'slack' | 'jira' | 'pr' | 'email'
  selectedFile?: string;
}

export interface ScenarioSlackMessage {
  sender: string;
  body: string;
  timeOffsetSeconds?: number;
}

export interface ScenarioJiraTicket {
  ticketId: string;
  title: string;
  priority: string;
  status: string;
  reporter: string;
  assignee: string;
  labels: string[];
  description: string;
}

export interface ScenarioPRComment {
  sender: string;
  role: string;
  comment: string;
  timeOffsetMinutes: number;
  replies?: Array<{
    sender: string;
    role: string;
    comment: string;
    timeOffsetMinutes: number;
  }>;
}

export interface ScenarioTerminalInfo {
  repository: string;
  branch: string;
  initialLogs: string[];
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
  // Extended Workspace Configs
  readonlyFiles?: Record<string, string>;
  checklist?: ScenarioChecklistItem[];
  slackMessages?: ScenarioSlackMessage[];
  jiraTicket?: ScenarioJiraTicket;
  prComments?: ScenarioPRComment[];
  defaultFile?: string;
  terminalInfo?: ScenarioTerminalInfo;
  expectedConcepts?: string[];
}
