import { ContextSimulationScenarioConfig } from "./scenario-type.interface";
import { QA_BUG_REPORT_SCENARIO } from "./qa-bug-report.config";
import { EXPERIENCED_PROD_INCIDENT_SCENARIO } from "./experienced-prod-incident.config";

export { EXPERIENCED_PROD_INCIDENT_SCENARIO };

// --- Scenario 2: Database Incident ---
export const DATABASE_INCIDENT_SCENARIO: ContextSimulationScenarioConfig = {
  id: "database-incident",
  title: "Database Incident: Connection Pool Outage",
  description: "Production logs show pool limit reached on db-prod-primary. Latency has spiked to 12s, and GET /api/v1/users/search is timing out. Investigate the connection pool configuration, fix the max_connections limit, and verify.",
  track: "experienced",
  rubricVersion: "1.0.0",
  initialSayPrompt: "What is your immediate plan to diagnose and mitigate this database outage?",
  managerEmail: {
    fromName: "Sarah Jenkins",
    fromRole: "QA & DevOps Lead",
    fromEmail: "sarah.j@company.com",
    subject: "DB Pool Limit Reached - URGENT Production Outage",
    body: `Hi,

We are experiencing a severe P1 database incident. The Datadog alerts show DB CPU is at 98%, and connection pool utilization is at 100%.

Could you let me know:
1. Have you identified why the connection pool is getting exhausted?
2. Can we mitigate this immediately without risking data corruption?
3. What is the status of the hotfix?

Stakeholders are asking for updates.

Thanks,
Sarah`,
  },
  starterCode: {
    python: `# db_config.py

def get_connection_pool_settings(env: str) -> dict:
    """
    Returns database pool configuration.
    Requirements:
    - Default pool size for production must be at least 15 connections.
    - Max connections must be at least 30 to support traffic spikes.
    """
    # BUG: Connection limits are set too low for production!
    return {
        "pool_size": 2,
        "max_overflow": 5,
        "timeout": 30
    }
`,
    javascript: `// db_config.js

function getConnectionPoolSettings(env) {
  // BUG: Connection limits are set too low for production!
  return {
    poolSize: 2,
    maxOverflow: 5,
    timeout: 30
  };
}

module.exports = { getConnectionPoolSettings };
`,
  },
  testCases: [
    {
      input: '"production"',
      expectedOutput: "true",
      label: "Production Check",
      isHidden: false,
    },
    {
      input: '"poolSize"',
      expectedOutput: "true",
      label: "Safe Pool Size (>= 15)",
      isHidden: false,
    },
    {
      input: '"maxOverflow"',
      expectedOutput: "true",
      label: "Safe Max Overflow (>= 15)",
      isHidden: false,
    },
  ],
  evaluationCriteria: {
    initialSayWeight: 0.25,
    emailSayWeight: 0.2,
    doBehaviourWeight: 0.2,
    doTechnicalWeight: 0.2,
    sayDoCorrelationWeight: 0.15,
  },
  readonlyFiles: {
    "config/settings.yaml": `database:\n  host: db-prod-primary\n  port: 5432\n  name: user_service\n`,
    "utils/logger.py": `def log_db_connection(pool_id): print(f"[DB] Pool initialized with id {pool_id}")\n`,
  },
  checklist: [
    { id: "review_logs", label: "1. Review Production Logs", detail: "Inspect slow query logs and pool limit exceptions", actionTab: "channels", channelTab: "slack" },
    { id: "reply_manager", label: "2. Respond to Sarah", detail: "Acknowledge the pool limit status and ETA", actionTab: "channels", channelTab: "email" },
    { id: "modify_pool", label: "3. Update db_config pool limits", detail: "Increase pool_size and max_overflow in db_config", actionTab: "workspace", selectedFile: "login/login_validation.py" }, // Reuse main workspace editor file slot
    { id: "submit_fix", label: "4. Deploy & Verify", detail: "Deploy database connection config fix", actionTab: "signoff" }
  ],
  slackMessages: [
    { sender: "System Alert Bot", body: "CRITICAL: Database instance db-prod-primary CPU utilization exceeded 98%." },
    { sender: "Marcus (DBA)", body: "I am seeing dozens of blocked processes. The pool size on the app is too low for the current volume of requests." }
  ],
  jiraTicket: {
    ticketId: "INCIDENT-992",
    title: "Production database connection limits exceeded",
    priority: "CRITICAL",
    status: "Investigating",
    reporter: "Sarah Jenkins",
    assignee: "Candidate SRE",
    labels: ["Database", "Outage"],
    description: "App servers are timing out attempting to acquire a DB connection. Production logs report ConnectionTimeoutError: pool limit reached."
  },
  defaultFile: "login/login_validation.py",
  terminalInfo: {
    repository: "cdrecruit/db-service",
    branch: "hotfix/db-pool-exhaustion",
    initialLogs: [
      "[ERR] ConnectionTimeoutError: pool limit reached on db-prod-primary.",
      "[WARN] Slow query detected: SELECT * FROM audit_logs ORDER BY created_at DESC; (Duration: 12450ms)",
      "Ready to configure db_config.py."
    ]
  },
  expectedConcepts: ["pool", "connection", "exhaustion", "increase", "limit", "overflow"]
};

// --- Scenario 3: CI/CD Pipeline Failure ---
export const PIPELINE_FAILURE_SCENARIO: ContextSimulationScenarioConfig = {
  id: "pipeline-failure",
  title: "CI/CD Pipeline Failure: Missing Husky",
  description: "The deployment pipeline fails during the npm install step due to a missing directory for the husky prepare script. Fix the package setup or CI environment script to bypass this issue in headless environments.",
  track: "experienced",
  rubricVersion: "1.0.0",
  initialSayPrompt: "How will you bypass or resolve the husky prepare failure in the CI build runner?",
  managerEmail: {
    fromName: "Priya Patel",
    fromRole: "Release Manager",
    fromEmail: "priya.p@company.com",
    subject: "CI Pipeline Blocked - Release Schedule Delayed",
    body: `Hi,

The CI pipeline has been failing consistently for the last hour, blocking all other developers from merging.

Could you let me know:
1. What is causing the prepare script failure?
2. Can we temporarily bypass this check to unblock the staging release?
3. How long until the build runner is green again?

We need this solved urgently.

Thanks,
Priya`,
  },
  starterCode: {
    python: `# ci_prepare.py

def should_skip_husky(env: dict) -> bool:
    """
    Checks if husky preparation should be skipped.
    Requirements:
    - Should return True if CI environment variable is 'true' or '1'.
    - Should return True if environment is headless/testing.
    """
    # BUG: Always attempts to run husky without checking CI environments!
    return False
`,
    javascript: `// ci_prepare.js

function shouldSkipHusky(env) {
  // BUG: Always returns false instead of checking CI flags
  return false;
}

module.exports = { shouldSkipHusky };
`,
  },
  testCases: [
    {
      input: '"CI"',
      expectedOutput: "true",
      label: "Bypass on CI Flag",
      isHidden: false,
    },
    {
      input: '"headless"',
      expectedOutput: "true",
      label: "Bypass on Headless Flag",
      isHidden: false,
    },
  ],
  evaluationCriteria: {
    initialSayWeight: 0.2,
    emailSayWeight: 0.2,
    doBehaviourWeight: 0.3,
    doTechnicalWeight: 0.15,
    sayDoCorrelationWeight: 0.15,
  },
  readonlyFiles: {
    ".github/workflows/ci.yml": "name: Node.js CI\njobs:\n  build:\n    steps:\n      - uses: actions/checkout@v2\n      - run: npm install\n",
  },
  checklist: [
    { id: "read_build_logs", label: "1. Check Build Logs", detail: "Read the GitHub Actions prepare script execution logs", actionTab: "channels", channelTab: "slack" },
    { id: "email_priya", label: "2. Respond to Priya", detail: "Explain the Husky error and the bypass proposal", actionTab: "channels", channelTab: "email" },
    { id: "fix_ci_script", label: "3. Patch ci_prepare script", detail: "Modify should_skip_husky logic to check environment variables", actionTab: "workspace", selectedFile: "login/login_validation.py" },
    { id: "submit_pipeline", label: "4. Deploy and Run CI", detail: "Submit the build script and verify green status", actionTab: "signoff" }
  ],
  slackMessages: [
    { sender: "GHA Runner Bot", body: "Build #1042 failed: Prepare script failed with error." },
    { sender: "Dave (CI/CD)", body: "The runner environment is headless and does not initialize a .git folder before npm install, causing husky to crash." }
  ],
  jiraTicket: {
    ticketId: "BUILD-402",
    title: "Husky prepare script crashes in headless CI runners",
    priority: "HIGH",
    status: "Open",
    reporter: "Dave (CI/CD)",
    assignee: "Candidate DevOps",
    labels: ["CI/CD", "Husky"],
    description: "Build pipeline is blocked at npm install. npm prepare fails because git directory is not found by husky."
  },
  defaultFile: "login/login_validation.py",
  terminalInfo: {
    repository: "cdrecruit/build-pipeline",
    branch: "fix/husky-ci-bypass",
    initialLogs: [
      "npm error Lifecycle script `prepare` failed with error:",
      "npm error Command failed: husky",
      "npm error husky - Git directory not found"
    ]
  },
  expectedConcepts: ["bypass", "skip", "ci", "headless", "environment", "variable"]
};

// --- Scenario 4: Security Issue ---
export const SECURITY_ISSUE_SCENARIO: ContextSimulationScenarioConfig = {
  id: "security-issue",
  title: "Security Issue: Secrets Leakage",
  description: "A automated scanner alerts that AWS credentials have been pushed to a public config file. Deactivate/rotate keys, transition configuration to environment variables, and verify that no hardcoded credentials remain.",
  track: "experienced",
  rubricVersion: "1.0.0",
  initialSayPrompt: "What is your immediate plan to contain this secret leak and secure the AWS resources?",
  managerEmail: {
    fromName: "Marcus Vance",
    fromRole: "SecOps Lead",
    fromEmail: "marcus.v@company.com",
    subject: "EXPOSED SECRETS ALERT - Action Required",
    body: `Hi,

A GitHub scanner has detected hardcoded AWS credentials in our public repository commit 81f3d2a.

Please let me know immediately:
1. Have you revoked the credentials in AWS IAM?
2. Are you refactoring the code to pull from environment variables?
3. How are you ensuring we don't commit keys in the future?

I need this addressed and resolved right now.

Thanks,
Marcus`,
  },
  starterCode: {
    python: `# aws_loader.py
import os

def load_credentials(config: dict) -> dict:
    """
    Loads AWS credentials securely.
    Requirements:
    - Credentials MUST be loaded from environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY).
    - Under no circumstances should hardcoded values like 'AKIA' or 'wJalr' remain.
    """
    # BUG: Hardcoded secret variables!
    return {
        "aws_access_key_id": "AKIAIOSFODNN7EXAMPLE",
        "aws_secret_access_key": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
    }
`,
    javascript: `// aws_loader.js

function loadCredentials(config) {
  // BUG: Hardcoded credentials!
  return {
    awsAccessKeyId: "AKIAIOSFODNN7EXAMPLE",
    awsSecretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
  };
}

module.exports = { loadCredentials };
`,
  },
  testCases: [
    {
      input: '"env"',
      expectedOutput: "true",
      label: "Verify environment variables load",
      isHidden: false,
    },
    {
      input: '"no_secrets"',
      expectedOutput: "true",
      label: "Confirm no hardcoded AKIA prefix",
      isHidden: false,
    },
  ],
  evaluationCriteria: {
    initialSayWeight: 0.25,
    emailSayWeight: 0.25,
    doBehaviourWeight: 0.2,
    doTechnicalWeight: 0.15,
    sayDoCorrelationWeight: 0.15,
  },
  readonlyFiles: {
    "src/config/aws.ts": "export const AWS_CONFIG = {\n  region: 'us-east-1'\n};\n",
  },
  checklist: [
    { id: "read_security_alert", label: "1. View Snyk Alert", detail: "Review Snyk / GitHub secrets scanner incident details", actionTab: "channels", channelTab: "slack" },
    { id: "email_marcus", label: "2. Respond to Marcus", detail: "Confirm key revocation status and rotation ETA", actionTab: "channels", channelTab: "email" },
    { id: "remove_keys", label: "3. Remove hardcoded keys", detail: "Modify aws_loader to pull from environment variables", actionTab: "workspace", selectedFile: "login/login_validation.py" },
    { id: "submit_security", label: "4. Verify containment", detail: "Confirm remediation is complete and submit", actionTab: "signoff" }
  ],
  slackMessages: [
    { sender: "Snyk Security Bot", body: "High Severity: Leaked AWS Access Key ID detected in public commit." },
    { sender: "Marcus (Security)", body: "Do NOT just delete the commit; once leaked, the key must be rotated and deactivated in AWS IAM immediately." }
  ],
  jiraTicket: {
    ticketId: "SEC-812",
    title: "AWS Credentials committed to public source file",
    priority: "CRITICAL",
    status: "Open",
    reporter: "Marcus Vance",
    assignee: "Candidate SRE",
    labels: ["Security", "Vulnerability"],
    description: "GitHub Automated secrets scanner alerted that valid credentials were found in src/config/aws.ts."
  },
  defaultFile: "login/login_validation.py",
  terminalInfo: {
    repository: "cdrecruit/api-service",
    branch: "remediate/secrets-leak",
    initialLogs: [
      "[ALERT] Exposed AWS keys detected. Deactivate key in IAM first.",
      "Update aws_loader.py to read environment variables."
    ]
  },
  expectedConcepts: ["rotate", "revoke", "iam", "environment", "variable", "deactivate"]
};

// --- Scenario 5: Code Refactoring ---
export const CODE_REFACTORING_SCENARIO: ContextSimulationScenarioConfig = {
  id: "code-refactoring",
  title: "Code Refactoring: Cache Eviction Layer",
  description: "The memory cache class is leaking memory because it grows indefinitely. Refactor the cache to support a size limit (max 5 items) and basic eviction, and ensure tests pass.",
  track: "experienced",
  rubricVersion: "1.0.0",
  initialSayPrompt: "How do you plan to implement the cache eviction size limit in the cache layer class?",
  managerEmail: {
    fromName: "Dave Harrison",
    fromRole: "Tech Architect",
    fromEmail: "dave.h@company.com",
    subject: "Memory Outage - Cache Eviction Needed",
    body: `Hi,

We had another container crash loop in production due to a memory leak in the LocalCache.

Could you let me know:
1. How you are planning to refactor the Cache class?
2. Will you implement a maximum capacity constraint or an LRU mechanism?
3. How will you verify that cache hits still work as expected?

Please resolve this cache leak before our next deploy.

Thanks,
Dave`,
  },
  starterCode: {
    python: `# cache_layer.py

class LocalCache:
    """
    A simple in-memory cache layer.
    Requirements:
    - Must limit total size to a maximum of 5 items.
    - If a 6th item is set, evict the oldest key (basic FIFO or LRU).
    """
    store = {}
    keys_order = []

    @classmethod
    def get(cls, key: str) -> any:
        return cls.store.get(key)

    @classmethod
    def set(cls, key: str, value: any) -> None:
        # BUG: Memory leak - stores indefinitely without eviction!
        cls.store[key] = value
`,
    javascript: `// cache_layer.js

class LocalCache {
  // BUG: Memory leak - stores indefinitely
  static store = new Map();

  static get(key) {
    return this.store.get(key);
  }

  static set(key, value) {
    this.store.set(key, value);
  }
}

module.exports = { LocalCache };
`,
  },
  testCases: [
    {
      input: '"limitsize"',
      expectedOutput: "true",
      label: "Test cache capacity does not exceed 5",
      isHidden: false,
    },
    {
      input: '"eviction"',
      expectedOutput: "true",
      label: "Test oldest key is evicted",
      isHidden: false,
    },
  ],
  evaluationCriteria: {
    initialSayWeight: 0.2,
    emailSayWeight: 0.2,
    doBehaviourWeight: 0.25,
    doTechnicalWeight: 0.2,
    sayDoCorrelationWeight: 0.15,
  },
  readonlyFiles: {
    "src/utils/cache_test.py": "def test_cache_perf(): pass\n",
  },
  checklist: [
    { id: "analyze_leak", label: "1. Analyze memory profile", detail: "Read tech architect cache review comments", actionTab: "channels", channelTab: "slack" },
    { id: "reply_dave", label: "2. Respond to Dave", detail: "Outline cache eviction strategy and timeline", actionTab: "channels", channelTab: "email" },
    { id: "refactor_cache", label: "3. Patch cache_layer", detail: "Add key tracking and capacity enforcement to cache set()", actionTab: "workspace", selectedFile: "login/login_validation.py" },
    { id: "submit_refactor", label: "4. Run tests & submit", detail: "Confirm size limits are respected and submit code", actionTab: "signoff" }
  ],
  slackMessages: [
    { sender: "Dave (Tech Lead)", body: "The LocalCache map grows indefinitely. We must restrict capacity or we will continue seeing Out-of-Memory container terminations." }
  ],
  jiraTicket: {
    ticketId: "REFACTOR-401",
    title: "Cache class memory leak in backend router",
    priority: "MEDIUM",
    status: "Active",
    reporter: "Dave Harrison",
    assignee: "Candidate Engineer",
    labels: ["Refactor", "MemoryLeak"],
    description: "Restrict LocalCache size to 5 keys. When new keys are added, drop the oldest keys."
  },
  defaultFile: "login/login_validation.py",
  terminalInfo: {
    repository: "cdrecruit/core-cache",
    branch: "refactor/cache-capacity",
    initialLogs: [
      "[WARN] Memory usage exceeding 90% in container api-router.",
      "LocalCache contains 40,000 keys. Eviction layer missing."
    ]
  },
  expectedConcepts: ["evict", "size", "limit", "capacity", "leak", "clean", "oldest"]
};

// --- Scenario 6: Priority / Incident Conflict ---
export const PRIORITY_CONFLICT_SCENARIO: ContextSimulationScenarioConfig = {
  id: "priority-conflict",
  title: "Incident Response: Priority Conflict",
  description: "A conflict arises mid-sprint. Clara (PM) wants a billing outage fixed immediately, while Dave (Tech Lead) wants the cache memory leak patched to stabilize containers. Resolve the priority conflict, communicate the plan, and coordinate with stakeholders.",
  track: "experienced",
  rubricVersion: "1.0.0",
  initialSayPrompt: "How do you evaluate these competing priorities? Explain your strategy for handling the billing outage vs cache leak.",
  managerEmail: {
    fromName: "Priya Patel",
    fromRole: "Director of Engineering",
    fromEmail: "priya.p@company.com",
    subject: "Priority Conflict: Outage vs Sprint Commitment",
    body: `Hi,

We have a conflict regarding priorities today. Clara is demanding the Stripe checkout issue for EnterpriseCorp be resolved immediately, but Dave says if we don't deploy the cache refactoring right now, the servers will crash again.

Could you let me know:
1. Which of these two tasks you are prioritizing and why?
2. What is your proposed plan to address both problems?
3. How will you communicate this to the product team without creating friction?

Please share your resolution plan.

Thanks,
Priya`,
  },
  starterCode: {
    python: `# priority_planner.py

def prioritize_incident(checkout_severity: int, memory_leak_severity: int) -> str:
    """
    Determines priority strategy.
    Requirements:
    - Returns 'billing_first' if checkout has higher impact.
    - Must justify the timeline to avoid concurrent deployment conflicts.
    """
    # BUG: Naive response structure
    return "no_strategy"
`,
    javascript: `// priority_planner.js

function prioritizeIncident(checkoutSeverity, memoryLeakSeverity) {
  return "no_strategy";
}

module.exports = { prioritizeIncident };
`,
  },
  testCases: [
    {
      input: '"impact"',
      expectedOutput: "true",
      label: "Evaluate business impact reasoning",
      isHidden: false,
    },
    {
      input: '"mitigation"',
      expectedOutput: "true",
      label: "Evaluate engineering mitigation proposal",
      isHidden: false,
    },
  ],
  evaluationCriteria: {
    initialSayWeight: 0.3,
    emailSayWeight: 0.3,
    doBehaviourWeight: 0.15,
    doTechnicalWeight: 0.1,
    sayDoCorrelationWeight: 0.15,
  },
  readonlyFiles: {
    "docs/incidents.md": "Incident 1: Stripe checkout regional outage\nIncident 2: Cache memory leak container crashes\n",
  },
  checklist: [
    { id: "read_conflict", label: "1. Review Slack thread", detail: "Read the debate between Clara and Dave on Slack", actionTab: "channels", channelTab: "slack" },
    { id: "reply_priya", label: "2. Respond to Priya", detail: "Present your prioritization logic and communication strategy", actionTab: "channels", channelTab: "email" },
    { id: "fix_planner", label: "3. Write priority decision", detail: "Update priority_planner with a structured response", actionTab: "workspace", selectedFile: "login/login_validation.py" },
    { id: "submit_conflict", label: "4. Confirm alignment", detail: "Submit incident priority plan and finish", actionTab: "signoff" }
  ],
  slackMessages: [
    { sender: "Clara (PM)", body: "The Stripe checkout bug is costing us $5,000 an hour! Sales is screaming. This must be fixed immediately." },
    { sender: "Dave (Tech Lead)", body: "If we don't deploy the cache patch, container pods will crash loop and block all users, not just Stripe users. We need stability first." }
  ],
  jiraTicket: {
    ticketId: "CONFLICT-101",
    title: "Stakeholder priority deadlock on Sprint Deployments",
    priority: "HIGH",
    status: "Blocked",
    reporter: "Priya Patel",
    assignee: "Candidate Lead",
    labels: ["Priority", "Conflict", "Incident"],
    description: "Disagreement on deployment sequence between PM (Stripe bug checkout) and Tech Lead (cache eviction stability)."
  },
  defaultFile: "login/login_validation.py",
  terminalInfo: {
    repository: "cdrecruit/incident-warroom",
    branch: "incident/priority-resolution",
    initialLogs: [
      "Simulated priority planner ready.",
      "Dave demands cache refactor. Clara demands Stripe checkout fix."
    ]
  },
  expectedConcepts: ["prioritize", "impact", "sequence", "mitigate", "compromise", "communicate"]
};

// --- Scenario Registry Loader ---
export const SCENARIO_REGISTRY: Record<string, ContextSimulationScenarioConfig> = {
  "qa-bug-login-validation": QA_BUG_REPORT_SCENARIO,
  "database-incident": DATABASE_INCIDENT_SCENARIO,
  "pipeline-failure": PIPELINE_FAILURE_SCENARIO,
  "security-issue": SECURITY_ISSUE_SCENARIO,
  "code-refactoring": CODE_REFACTORING_SCENARIO,
  "priority-conflict": PRIORITY_CONFLICT_SCENARIO,
  "experienced-db-connection-leak": EXPERIENCED_PROD_INCIDENT_SCENARIO,
};

export function getScenarioById(id: string): ContextSimulationScenarioConfig {
  if (!id) {
    return QA_BUG_REPORT_SCENARIO;
  }

  const normalized = id.trim().toLowerCase();

  // 1. Direct registry lookup
  if (SCENARIO_REGISTRY[normalized]) {
    return SCENARIO_REGISTRY[normalized];
  }

  // 2. Strict title to scenario ID mapping
  const titleMapping: Record<string, string> = {
    "production outage: high cpu spike": "database-incident",
    "customer escalation: payment failures": "pipeline-failure",
    "security alert: leaked api keys": "security-issue",
    "code review dispute": "code-refactoring",
    "product manager vs engineering on tech debt": "priority-conflict",
    "qa bug report: login validation error": "qa-bug-login-validation",
  };

  if (titleMapping[normalized]) {
    return SCENARIO_REGISTRY[titleMapping[normalized]];
  }

  // 3. Fallback partial title/keyword checks
  if (normalized.includes("cpu") || normalized.includes("database") || normalized.includes("pool")) {
    return SCENARIO_REGISTRY["database-incident"];
  }
  if (normalized.includes("payment") || normalized.includes("pipeline") || normalized.includes("ci/cd")) {
    return SCENARIO_REGISTRY["pipeline-failure"];
  }
  if (normalized.includes("security") || normalized.includes("keys") || normalized.includes("secrets") || normalized.includes("leak")) {
    return SCENARIO_REGISTRY["security-issue"];
  }
  if (normalized.includes("refactor") || normalized.includes("dispute") || normalized.includes("code review")) {
    return SCENARIO_REGISTRY["code-refactoring"];
  }
  if (normalized.includes("conflict") || normalized.includes("debt") || normalized.includes("priority")) {
    return SCENARIO_REGISTRY["priority-conflict"];
  }
  if (normalized.includes("login") || normalized.includes("validation") || normalized.includes("qa bug")) {
    return SCENARIO_REGISTRY["qa-bug-login-validation"];
  }

  // 4. Default fallback with warning log
  console.warn(`[ScenarioResolver] Unknown scenario resolution request for id/title: "${id}". Falling back to QA_BUG_REPORT_SCENARIO.`);
  return QA_BUG_REPORT_SCENARIO;
}
