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
  // Multi-File Project Layout
  defaultFile: "src/auth/validation.py",
  readonlyFiles: {
    "src/auth/auth_handler.py": `# auth_handler.py - Core Authentication Handler
from validation import validate_username

def authenticate_user(username: str, password_hash: str) -> dict:
    if not validate_username(username):
        raise ValueError("Invalid username format")
    # Query database and verify user password hash...
    return {"status": "authenticated", "user": username}
`,
    "src/auth/middleware.py": `# middleware.py - Request Sanitation Middleware
class AuthenticationMiddleware:
    def process_request(self, request_headers: dict) -> None:
        # Sanitizes headers without modifying raw credentials
        pass
`,
    "tests/test_validation.py": `# test_validation.py - QA Regression Test Suite
import pytest
from validation import validate_username

def test_valid_username():
    assert validate_username("valid_user") is True

def test_leading_space():
    # QA REGRESSION: Leading whitespace must be rejected
    assert validate_username(" user_123") is False

def test_trailing_space():
    # QA REGRESSION: Trailing whitespace must be rejected
    assert validate_username("user_123 ") is False
`,
    "config/settings.yaml": `environment: staging
service_name: auth-service
version: 2.4.1
auth_timeout_seconds: 300
`,
    "utils/string_helpers.py": `def is_alphanumeric_or_underscore(s: str) -> bool:
    return all(c.isalnum() or c == '_' for c in s)
`
  },
  checklist: [
    { id: 'review_slack', label: '1. Review #incident-login-outage', detail: 'Check QA reproduction reports', actionTab: 'channels', channelTab: 'slack' },
    { id: 'inspect_jira', label: '2. Inspect JIRA Bug Ticket', detail: 'Review BUG-3124 criteria', actionTab: 'channels', channelTab: 'jira' },
    { id: 'reply_manager', label: '3. Reply to Manager Email', detail: 'Provide deployment ETA & risk status', actionTab: 'channels', channelTab: 'email' },
    { id: 'patch_code', label: '4. Patch src/auth/validation.py', detail: 'Fix leading/trailing space validation', actionTab: 'workspace', selectedFile: 'src/auth/validation.py' },
    { id: 'submit_hotfix', label: '5. Run Tests & Deploy', detail: 'Run pytest and deploy fix', actionTab: 'signoff' }
  ],
  slackMessages: [
    { sender: 'Sarah Jenkins (QA Lead)', body: 'The username leading space issue is still reproducible in Staging build 2.4.1.' },
    { sender: 'Priya Patel (Engineering Manager)', body: 'Need an ETA in 15 minutes for the stakeholder deployment update.' },
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
  terminalInfo: {
    repository: 'cdrecruit/auth-service',
    branch: 'fix/space-validation',
    initialLogs: [
      'pytest tests/test_validation.py',
      '============================= test session starts =============================',
      'platform linux -- Python 3.11.8, pytest-7.4.4',
      'rootdir: /workspace/auth-service',
      'collected 3 items',
      '',
      'tests/test_validation.py::test_valid_username PASSED                     [ 33%]',
      'tests/test_validation.py::test_leading_space FAILED                     [ 66%]',
      'tests/test_validation.py::test_trailing_space FAILED                    [100%]',
      '',
      '================================== FAILURES ===================================',
      'FAILED tests/test_validation.py::test_leading_space - AssertionError: assert True is False',
      'FAILED tests/test_validation.py::test_trailing_space - AssertionError: assert True is False',
      '========================= 2 failed, 1 passed in 0.04s ========================='
    ]
  },
  expectedConcepts: ['test', 'verify', 'check', 'inspect', 'read', 'look', 'debug']
};