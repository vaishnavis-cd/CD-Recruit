export interface Artifact {
  id: string;
  type:
    | "slack"
    | "email"
    | "ticket"
    | "code"
    | "diff"
    | "dashboard"
    | "logs"
    | "alert";
  title: string;
  sender?: string;
  subject?: string;
  content: string;
  metadata?: Record<string, any>;
}

export const artifactLibrary: Record<string, Artifact> = {
  // --- FRESHER TRACK ARTIFACTS ---
  fresher_eta_request_slack: {
    id: "fresher_eta_request_slack",
    type: "slack",
    title: "Slack Message from Engineering Manager",
    sender: "Sarah (Engineering Manager)",
    content:
      "Hey, client demo is tomorrow. Can you provide a realistic ETA for the profile dashboard task and mention if you have any blockers?",
  },
  fresher_requirement_jira: {
    id: "fresher_requirement_jira",
    type: "ticket",
    title: "Jira Ticket TASK-304",
    sender: "Rita (Product Manager)",
    content:
      "Jira TASK-304: Profile Search. Users should be able to search profiles by details. Make it fast.",
    metadata: {
      status: "To Do",
      assignee: "Candidate",
      priority: "Medium",
    },
  },
  fresher_bug_report_jira: {
    id: "fresher_bug_report_jira",
    type: "ticket",
    title: "Jira Ticket BUG-412",
    sender: "QA Lead",
    content:
      "BUG-412: Blank profile names pass validation. A user can input space-only values (e.g. '   ') and the system accepts it as a valid profile name, which breaks the UI dashboard layout.",
    metadata: {
      status: "Open",
      priority: "High",
    },
  },
  fresher_bug_code: {
    id: "fresher_bug_code",
    type: "code",
    title: "validateProfileName function",
    content: `function validateProfileName(name: string): boolean {
  if (!name) return false;
  return name.length > 0;
}`,
  },
  fresher_code_review_pr: {
    id: "fresher_code_review_pr",
    type: "diff",
    title: "Pull Request #124 - Cache Refactoring",
    sender: "Leo (Junior Developer)",
    content: `diff --git a/src/utils/cache.ts b/src/utils/cache.ts
index a1b2c3d..e5f6g7h 100644
--- a/src/utils/cache.ts
+++ b/src/utils/cache.ts
@@ -1,5 +1,9 @@
 export class LocalCache {
-  private store = new Map<string, any>();
+  // Memory leak: static map grows indefinitely without TTL or size eviction
+  private static store = new Map<string, any>();
 
   get(key: string): any {
     return LocalCache.store.get(key);
   }
 
   set(key: string, value: any): void {
+    // Console log in production path
+    console.log("Setting cache key", key);
     LocalCache.store.set(key, value);
   }
 }`,
  },
  fresher_teammate_question_slack: {
    id: "fresher_teammate_question_slack",
    type: "slack",
    title: "Slack DM from Teammate",
    sender: "Raj (Frontend Developer)",
    content:
      "Hi! I am preparing for a dev sync. Why are indexes used in databases? When should we avoid them?",
  },

  // --- EXPERIENCED TRACK ARTIFACTS ---
  experienced_incident_dashboard: {
    id: "experienced_incident_dashboard",
    type: "dashboard",
    title: "Datadog Monitoring Metrics",
    content:
      "Service Name: api-prod-service\nDB CPU Utilization: 98% (Spiked at 14:00:00)\nConnection pool utilization: 100%\nLatency (p99): 12,450ms",
  },
  experienced_incident_logs: {
    id: "experienced_incident_logs",
    type: "logs",
    title: "API Production Logs",
    content: `2026-07-15 14:00:01 [WARN] Slow query detected: SELECT * FROM audit_logs WHERE payload ILIKE '%search%' ORDER BY created_at DESC; (Duration: 12450ms)
2026-07-15 14:00:05 [ERR] ConnectionTimeoutError: pool limit reached on db-prod-primary.
2026-07-15 14:00:10 [ERR] GET /api/v1/users/search - Timeout after 15000ms.`,
  },
  experienced_incident_timeline: {
    id: "experienced_incident_timeline",
    type: "logs",
    title: "Deployment Timeline",
    content:
      "13:58:00 - Deployed commit a3b4c5d: Add transaction audit lookup feature.\n13:55:00 - Health check passed.",
  },
  experienced_pipeline_logs: {
    id: "experienced_pipeline_logs",
    type: "logs",
    title: "GitHub Actions Build Logs",
    content: `Run npm install
npm error Lifecycle script \`prepare\` failed with error:
npm error Command failed: husky
npm error husky - Git directory not found
npm error Failed to complete husky install. Exited with status 1.`,
  },
  experienced_pipeline_config: {
    id: "experienced_pipeline_config",
    type: "code",
    title: ".github/workflows/ci.yml",
    content: `name: Node.js CI
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Use Node.js 18
        uses: actions/setup-node@v2
        with:
          node-version: 18
      - name: Install dependencies
        run: npm install`,
  },
  experienced_security_alert: {
    id: "experienced_security_alert",
    type: "alert",
    title: "Snyk / GitHub Security Scanner Alert",
    content:
      "High Severity: Leaked AWS Access Key ID detected in public commit 81f3d2a on GitHub. Secret has been exposed to the public internet.",
  },
  experienced_security_code: {
    id: "experienced_security_code",
    type: "code",
    title: "src/config/aws.ts",
    content: `// config.ts
export const AWS_CONFIG = {
  accessKeyId: "AKIAIOSFODNN7EXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
};`,
  },
  experienced_customer_escalation_email: {
    id: "experienced_customer_escalation_email",
    type: "email",
    title: "[URGENT] Payment issues for Client EnterpriseCorp",
    sender: "John (Account Manager)",
    subject: "Fw: Urgent checkout failure",
    content:
      "Hi team, we are EnterpriseCorp. Our checkout page is failing validation with error codes on Stripe Europe region. We are losing $5,000 per hour. Please investigate immediately!",
  },
  experienced_priority_conflict_slack: {
    id: "experienced_priority_conflict_slack",
    type: "slack",
    title: "Priority Conflict Slack Thread",
    content: `Sarah (EM): We have two critical items today.
Clara (PM): The EnterpriseCorp checkout fix is crucial. Sales is screaming, we have contracts at risk.
Dave (Tech Lead): The cache memory leak is causing container pods to crash loop twice a day. We must merge and deploy the cache refactoring now to stabilize production.`,
  },
};
