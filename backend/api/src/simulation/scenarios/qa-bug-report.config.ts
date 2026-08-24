import { ContextSimulationScenarioConfig } from "./scenario-type.interface";

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
  // Dynamic Workspace configs
  readonlyFiles: {
    'login/auth.py': `# auth.py - Core Authentication Handler\n\nfrom login_validation import validate_username\n\ndef authenticate_user(username: str, password_hash: str) -> dict:\n    if not validate_username(username):\n        raise ValueError("Invalid username format")\n    # Proceed with password verification against PostgreSQL database...\n    return {"status": "authenticated", "user": username}\n`,
    'login/middleware.py': `# middleware.py - Request Sanitation Middleware\n\nclass AuthenticationMiddleware:\n    def process_request(self, req):\n        # Pass username to validation service without modifying raw headers\n        pass\n`,
    'tests/test_validation.py': `# test_validation.py - QA Unit & Regression Test Suite\n\nimport pytest\nfrom login_validation import validate_username\n\ndef test_valid_username():\n    assert validate_username("valid_user") == True\n\ndef test_leading_space():\n    # QA REGRESSION BUG: Should reject leading spaces!\n    assert validate_username(" user_123") == False\n\ndef test_trailing_space():\n    # QA REGRESSION BUG: Should reject trailing spaces!\n    assert validate_username("user_123 ") == False\n`,
    'config/settings.yaml': `# settings.yaml\nenvironment: staging\nservice_name: login-service\nversion: 2.4.1\nauth_timeout_seconds: 300\n`,
    'utils/string_helpers.py': `# string_helpers.py\n\ndef is_alphanumeric_or_underscore(s: str) -> bool:\n    return all(c.isalnum() or c == '_' for c in s)\n`
  },
  checklist: [
    { id: 'review_slack', label: '1. Review #incident-login-outage', detail: 'Check QA reports & reproduction notes', actionTab: 'channels', channelTab: 'slack' },
    { id: 'inspect_jira', label: '2. Inspect JIRA Bug Ticket', detail: 'Review BUG-3124 acceptance criteria', actionTab: 'channels', channelTab: 'jira' },
    { id: 'reply_manager', label: '3. Reply to Manager Email', detail: 'Provide ETA update to stakeholders', actionTab: 'channels', channelTab: 'email' },
    { id: 'patch_code', label: '4. Patch login_validation.py', detail: 'Fix leading/trailing space validation', actionTab: 'workspace', selectedFile: 'login/login_validation.py' },
    { id: 'submit_hotfix', label: '5. Authorize & Submit Hotfix', detail: 'Deploy patch to staging & finish', actionTab: 'signoff' }
  ],
  slackMessages: [
    { sender: 'Sarah Jenkins (QA Lead)', body: 'The username leading space issue is still reproducible in Staging build 2.4.1.' },
    { sender: 'Priya Patel (Engineering Manager)', body: 'Need ETA in 15 minutes for the stakeholder deployment update.' },
    { sender: 'Michael Chen (Product Manager)', body: 'Marketing campaign release depends on this authentication fix.' }
  ],
  jiraTicket: {
    ticketId: 'BUG-3124',
    title: 'Username space validation regression in Login API',
    priority: 'HIGH PRIORITY',
    status: 'In Progress',
    reporter: 'QA Sarah Jenkins',
    assignee: 'Candidate Engineer',
    labels: ['Regression', 'Authentication'],
    description: 'During regression testing, QA discovered that login validation incorrectly accepts usernames with leading or trailing spaces. The issue has been reproduced consistently and marked as High Priority. Investigate the issue, implement a fix and verify that existing functionality is not affected.'
  },
  prComments: [
    {
      sender: 'Alex Rivera',
      role: 'Senior Tech Lead',
      comment: 'Reject invalid input. Do not silently trim leading or trailing spaces without returning explicit validation errors. Validation must fail if spaces exist at boundaries.',
      timeOffsetMinutes: 120,
      replies: [
        {
          sender: 'Rahul Sharma',
          role: 'Junior Engineer',
          comment: 'We should check if username length fits after trimming, or return false immediately when spaces exist at boundaries.',
          timeOffsetMinutes: 60
        }
      ]
    }
  ],
  defaultFile: 'login/login_validation.py',
  terminalInfo: {
    repository: 'cdrecruit/login-service',
    branch: 'feature/login-validation',
    initialLogs: [
      '=========================================================================',
      ' 🚀 INCIDENT WAR ROOM DIAGNOSTIC TERMINAL READY',
      ' Target Repository: cdrecruit/login-service | Branch: feature/login-validation',
      ' Environment: Staging Candidate Sandbox | Pytest 7.4.0',
      '=========================================================================',
      'pytest',
      'collected 5 items',
      'tests/test_validation.py::test_valid_user PASSED',
      'tests/test_validation.py::test_leading_space_bug FAILED',
      'tests/test_validation.py::test_trailing_space_bug FAILED',
      'Coverage 96%',
      'System ready. Modify code and click Run Diagnostics to verify fix.'
    ]
  },
  expectedConcepts: ['test', 'verify', 'check', 'inspect', 'read', 'look', 'debug']
};