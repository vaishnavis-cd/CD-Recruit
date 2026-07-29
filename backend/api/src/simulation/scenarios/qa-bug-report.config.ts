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

export const QA_BUG_REPORT_SCENARIO: ContextSimulationScenarioConfig = {
  id: "qa-bug-login-validation",
  title: "QA Bug Report: Login Validation Error",
  description:
    "During regression testing, QA discovered that login validation incorrectly accepts usernames with leading or trailing spaces. The issue has been reproduced consistently and marked as High Priority. Investigate the issue, implement a fix and verify that existing functionality is not affected.",
  track: "fresher",
  rubricVersion: "1.0.0",
  initialSayPrompt: "What would you do to solve this issue?",
  managerEmail: {
    fromName: "Rahul Sharma",
    fromRole: "Engineering Manager",
    fromEmail: "rahul.sharma@company.com",
    subject: "Login Validation Bug – Deployment Status",
    body: `Hi,

I noticed you're working on the login validation issue reported by QA.

We're planning today's deployment shortly, and Product is asking whether this fix can be included. Before I respond to them, could you let me know:

* Have you identified the root cause yet?
* Do you think the fix will be ready for today's deployment?
* Approximately how much more time do you need?

If you believe additional testing is required or that the fix should not be deployed today, let me know so I can update the stakeholders accordingly.

Thanks,
Rahul Sharma
Engineering Manager`,
  },
  starterCode: {
    python: `# login_validation.py

def validate_username(username: str) -> bool:
    """
    Validates a username for login.
    Requirements:
    - Must be between 3 and 20 characters long.
    - Must NOT contain leading or trailing spaces.
    - Must only contain alphanumeric characters or underscores.
    """
    if not username:
        return False
    
    # QA BUG: Missing leading/trailing space validation!
    # Fix needed: username should be checked or trimmed properly.
    if len(username) < 3 or len(username) > 20:
        return False
        
    return all(c.isalnum() or c == '_' or c == ' ' for c in username)
`,
    javascript: `// login_validation.js

function validateUsername(username) {
  if (!username || typeof username !== 'string') {
    return false;
  }

  // QA BUG: Missing leading/trailing space check!
  if (username.length < 3 || username.length > 20) {
    return false;
  }

  return /^[a-zA-Z0-9_ ]+$/.test(username);
}

module.exports = { validateUsername };
`,
  },
  testCases: [
    {
      input: '"valid_user"',
      expectedOutput: "true",
      label: "Sample Valid Username",
      isHidden: false,
    },
    {
      input: '" user_123"',
      expectedOutput: "false",
      label: "Leading Space Bug Check",
      isHidden: false,
    },
    {
      input: '"user_123 "',
      expectedOutput: "false",
      label: "Trailing Space Bug Check",
      isHidden: false,
    },
    {
      input: '" user_123 "',
      expectedOutput: "false",
      label: "Hidden Both Spaces Test",
      isHidden: true,
    },
    {
      input: '"ab"',
      expectedOutput: "false",
      label: "Hidden Length Short Test",
      isHidden: true,
    },
  ],
  evaluationCriteria: {
    initialSayWeight: 0.2,
    emailSayWeight: 0.2,
    doBehaviourWeight: 0.25,
    doTechnicalWeight: 0.2,
    sayDoCorrelationWeight: 0.15,
  },
};
