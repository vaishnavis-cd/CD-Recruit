import { ModuleType } from "@prisma/client";

export interface SimulationTrigger {
  type: "email" | "slack" | "ticket";
  from: string;
  subject?: string;
  body: string;
  timestamp: string;
}

export interface RubricCriteria {
  criterion: string;
  weight: number;
  description: string;
}

export interface SimulationContent {
  title: string;
  description: string;
  triggers: SimulationTrigger[];
  rubric: RubricCriteria[];
  explanation?: string;
}

export interface SimulationSeedEntry {
  moduleType: Extract<ModuleType, "SIMULATION">;
  content: SimulationContent;
}

export const simulationQuestions: SimulationSeedEntry[] = [
  {
    moduleType: "SIMULATION",
    content: {
      title: "QA Bug Report: Login Validation Error",
      description:
        "During regression testing, QA discovered that login validation incorrectly accepts usernames with leading or trailing spaces. The issue has been reproduced consistently and marked as High Priority. Investigate the issue, implement a fix and verify that existing functionality is not affected.",
      triggers: [
        {
          type: "ticket",
          from: "QA Tester (Regression Suite)",
          body: "HIGH PRIORITY: Login validation accepts leading and trailing whitespace in username field.",
          timestamp: "2026-07-28T10:00:00Z",
        },
        {
          type: "email",
          from: "Rahul Sharma (Engineering Manager)",
          subject: "Login Validation Bug – Deployment Status",
          body: "Hi, I noticed you are working on the login validation issue reported by QA. We are planning today deployment shortly...",
          timestamp: "2026-07-28T10:05:00Z",
        },
      ],
      rubric: [
        {
          criterion: "Initial Debugging Plan",
          weight: 0.2,
          description: "Candidate submits clear initial debugging strategy before code modifications.",
        },
        {
          criterion: "Manager Communication",
          weight: 0.2,
          description: "Candidate replies to manager email with ETA and deployment risk status.",
        },
        {
          criterion: "DO Technical & Behaviour",
          weight: 0.45,
          description: "Candidate inspects files, modifies validation logic, and passes hidden test suite.",
        },
        {
          criterion: "Say-Do Correlation",
          weight: 0.15,
          description: "Candidate workspace actions match initial stated plan.",
        },
      ],
    },
  },
  {
    moduleType: "SIMULATION",
    content: {
      title: "Production Outage: High CPU Spike",
      description:
        "A production incident occurs shortly after a recent deployment. The database is experiencing a severe CPU spike, causing page load timeout alerts.",
      triggers: [
        {
          type: "ticket",
          from: "Datadog Alert Bot",
          body: "CRITICAL: Database instance db-prod-primary CPU utilization has exceeded 95% for 5 consecutive minutes.",
          timestamp: "2026-07-14T10:00:00Z",
        },
        {
          type: "slack",
          from: "Sarah (Engineering Manager)",
          body: "Hey Team, users are reporting slow loads and timeout errors when loading their dashboard. Is anyone looking at the Datadog alert?",
          timestamp: "2026-07-14T10:01:30Z",
        },
        {
          type: "email",
          from: "Support Team Lead",
          subject: "[Escalation] Customer dashboard timeouts",
          body: "Hi Engineers, we have received 12 customer tickets in the last 15 minutes stating that the dashboard fails to load. Please investigate immediately.",
          timestamp: "2026-07-14T10:03:00Z",
        },
      ],
      rubric: [
        {
          criterion: "Immediate Triaging",
          weight: 0.3,
          description:
            "Candidate identifies the recent deployment as the primary suspect, acknowledges the Slack thread, and proposes checking database locks and slow queries.",
        },
        {
          criterion: "Communication Quality",
          weight: 0.3,
          description:
            "Candidate keeps Sarah and the Support team updated with clear, jargon-free progress reports.",
        },
        {
          criterion: "Mitigation Strategy",
          weight: 0.4,
          description:
            "Candidate proposes rolling back the recent deployment as the fastest mitigation step rather than trying to debug code on production.",
        },
      ],
      explanation:
        "Production outages require immediate acknowledgment, rolling back code to restore services, and analyzing queries offline.",
    },
  },
  {
    moduleType: "SIMULATION",
    content: {
      title: "Code Review Dispute",
      description:
        "A disagreement between a senior engineer and a junior engineer on the team threatens to delay a critical feature merge.",
      triggers: [
        {
          type: "slack",
          from: "Leo (Junior Developer)",
          body: "Hey, can someone review my PR? Alex left some comments demanding I rewrite the entire caching layer using Redis instead of memory cache, but it's a small internal tool and I think memory is fine. Alex is refusing to approve.",
          timestamp: "2026-07-14T11:00:00Z",
        },
        {
          type: "ticket",
          from: "Alex (Senior Developer)",
          body: "Comment on PR #412: We must use Redis here to allow scaling this service to multiple instances in the future. In-memory caching will lead to stale state across container instances.",
          timestamp: "2026-07-14T11:05:00Z",
        },
      ],
      rubric: [
        {
          criterion: "Empathy and Conflict Resolution",
          weight: 0.4,
          description:
            "Candidate mediates without taking sides, recognizing the validity of Alex's scaling concern and Leo's timeline constraints.",
        },
        {
          criterion: "Technical Compromise",
          weight: 0.4,
          description:
            "Candidate proposes a compromise, such as starting with an interface wrapper so switching cache providers later is trivial.",
        },
        {
          criterion: "Team Alignment",
          weight: 0.2,
          description:
            "Candidate organizes a brief sync call to resolve the issue directly instead of arguing in PR comments.",
        },
      ],
    },
  },
  {
    moduleType: "SIMULATION",
    content: {
      title: "Product Manager vs Engineering on Tech Debt",
      description:
        "A conflict arises regarding sprint priorities. The PM wants to release a new feature, while developers want to refactor a core legacy module.",
      triggers: [
        {
          type: "slack",
          from: "Clara (Product Manager)",
          body: "Hey, we need to squeeze the new Stripe checkout flow into the upcoming sprint. I know we scheduled the billing database refactoring, but sales is pushing hard for this.",
          timestamp: "2026-07-14T12:00:00Z",
        },
        {
          type: "email",
          from: "Dave (Backend Developer)",
          subject: "Stripe feature vs Billing refactor risk",
          body: "Hi guys, if we add Stripe checkout without refactoring our billing records table, we risk duplicate transactions because the current schema doesn't support transaction isolation for multi-step checkouts. I strongly recommend refactoring first.",
          timestamp: "2026-07-14T12:05:00Z",
        },
      ],
      rubric: [
        {
          criterion: "Risk Assessment",
          weight: 0.4,
          description:
            "Candidate understands and articulates the technical risk (duplicate billing) to the PM in business terms.",
        },
        {
          criterion: "Pragmatic Scheduling",
          weight: 0.4,
          description:
            "Candidate proposes a phased approach (e.g. implementing minimal schema safety first, then building Stripe, then full refactoring).",
        },
        {
          criterion: "Stakeholder Collaboration",
          weight: 0.2,
          description:
            "Candidate maintains a collaborative tone and facilitates agreement between PM and developer.",
        },
      ],
    },
  },
  {
    moduleType: "SIMULATION",
    content: {
      title: "Security Alert: Leaked API Keys",
      description:
        "A security scanner detects that a developer has accidentally pushed AWS credentials into a public repository.",
      triggers: [
        {
          type: "ticket",
          from: "GitHub Security Alert",
          body: "WARNING: AWS Access Key ID detected in public commit 81f3d2a. Secrets leaked to public domains must be rotated immediately.",
          timestamp: "2026-07-14T13:00:00Z",
        },
        {
          type: "slack",
          from: "Marcus (Security Engineer)",
          body: "Did anyone see the GitHub leak alert? We need to verify what permissions that key had and revoke it immediately in the AWS IAM Console.",
          timestamp: "2026-07-14T13:02:00Z",
        },
      ],
      rubric: [
        {
          criterion: "Immediate Remediation Steps",
          weight: 0.5,
          description:
            "Candidate recognizes that deleting the commit is not enough; the credentials must be immediately deactivated in IAM.",
        },
        {
          criterion: "Impact Investigation",
          weight: 0.3,
          description:
            "Candidate checks CloudTrail logs to verify if the leaked key has been exploited.",
        },
        {
          criterion: "Post-Mortem Actions",
          weight: 0.2,
          description:
            "Candidate recommends setting up git-secrets or pre-commit hooks to prevent future leaks.",
        },
      ],
    },
  },
  {
    moduleType: "SIMULATION",
    content: {
      title: "Customer Escalation: Payment Failures",
      description:
        "A major client complains that their users cannot complete payments on the web application.",
      triggers: [
        {
          type: "email",
          from: "Account Manager",
          subject: "[URGENT] Payment issues for Client EnterpriseCorp",
          body: "Hi Support and Devs, EnterpriseCorp's CTO just called me. Their checkout page has been throwing error codes for the last hour. This is costing them thousands per minute. Help!",
          timestamp: "2026-07-14T14:00:00Z",
        },
        {
          type: "slack",
          from: "Payment Gateway Service status",
          body: "Stripe API reports partial outages in card validations in the Europe region.",
          timestamp: "2026-07-14T14:05:00Z",
        },
      ],
      rubric: [
        {
          criterion: "Root Cause Diagnosis",
          weight: 0.4,
          description:
            "Candidate identifies the problem as a third-party gateway regional outage, linking Client location to Stripe status updates.",
        },
        {
          criterion: "Outage Mitigation",
          weight: 0.3,
          description:
            "Candidate suggests adding user-facing warning banners and checking if billing fallback routes can be enabled.",
        },
        {
          criterion: "Client Management",
          weight: 0.3,
          description:
            "Candidate drafts a professional update for the Account Manager explaining the external nature of the outage and expected recovery timelines.",
        },
      ],
    },
  },
  {
    moduleType: "SIMULATION",
    content: {
      title: "API Breaking Change Proposal",
      description:
        "A team member wants to rename a key database field that is exposed directly through public API endpoints.",
      triggers: [
        {
          type: "ticket",
          from: "Jira TASK-892",
          body: "Rename candidate_id to user_id across the backend schema to align with user management databases.",
          timestamp: "2026-07-14T15:00:00Z",
        },
        {
          type: "email",
          from: "Dev Lead",
          subject: "Breaking API concerns on TASK-892",
          body: "Hi team, renaming this will break integrations for at least 40 external developers. How should we proceed with this migration safely?",
          timestamp: "2026-07-14T15:10:00Z",
        },
      ],
      rubric: [
        {
          criterion: "Deprecation Strategy",
          weight: 0.5,
          description:
            "Candidate proposes exposing both fields in the API payload temporarily, writing deprecation warnings in docs, and scheduling a final removal date.",
        },
        {
          criterion: "API Versioning",
          weight: 0.3,
          description:
            "Candidate advocates for introducing v2 of the API instead of making breaking changes in v1.",
        },
        {
          criterion: "Developer Relations",
          weight: 0.2,
          description:
            "Candidate drafts a clear notification email to be sent to external developers.",
        },
      ],
    },
  },
  {
    moduleType: "SIMULATION",
    content: {
      title: "Deadlock on Main Router File",
      description:
        "Two developers have conflicting refactoring paths on a shared central router file, leading to complex merge conflicts in CI.",
      triggers: [
        {
          type: "slack",
          from: "Alice",
          body: "Hey, I just merged my routes refactor, but now Bob's PR is failing tests because my changes completely altered index.ts structure. Bob, let's sync.",
          timestamp: "2026-07-14T16:00:00Z",
        },
        {
          type: "slack",
          from: "Bob",
          body: "Alice, I spent three days reorganizing index.ts to implement controller classes. Merging yours over mine is going to take hours of manual resolution. Is there a better way?",
          timestamp: "2026-07-14T16:05:00Z",
        },
      ],
      rubric: [
        {
          criterion: "Refactoring Best Practices",
          weight: 0.4,
          description:
            "Candidate advises splitting the massive central file into smaller files (e.g. modular routers per domain) to prevent conflict lockups.",
        },
        {
          criterion: "Collaboration",
          weight: 0.4,
          description:
            "Candidate recommends a pairing session to resolve the merge conflict together rather than overwriting someone's work.",
        },
        {
          criterion: "Branch Management",
          weight: 0.2,
          description:
            "Candidate recommends shorter-lived feature branches and frequent pulls from main.",
        },
      ],
    },
  },
  {
    moduleType: "SIMULATION",
    content: {
      title: "Vague Feature Requirements",
      description:
        "A ticket is assigned to a developer during a sprint with unclear specifications and no input validations defined.",
      triggers: [
        {
          type: "ticket",
          from: "Jira TASK-304",
          body: "Implement profile search. Users should be able to search profiles by details. Make it fast.",
          timestamp: "2026-07-14T17:00:00Z",
        },
        {
          type: "slack",
          from: "Dev Team Member",
          body: "Are we doing SQL fuzzy search, Elasticsearch, or matching exact prefixes? TASK-304 is super vague.",
          timestamp: "2026-07-14T17:05:00Z",
        },
      ],
      rubric: [
        {
          criterion: "Scope Clarification",
          weight: 0.4,
          description:
            "Candidate asks the PM for user stories (e.g., search by name, email, or skill) before starting work.",
        },
        {
          criterion: "Technical Scoping",
          weight: 0.4,
          description:
            "Candidate recommends a simple SQL ILIKE search as an MVP and schedules full-text indexes or Elasticsearch for a later phase.",
        },
        {
          criterion: "Validation Requirements",
          weight: 0.2,
          description:
            "Candidate raises concerns about performance limits (e.g. minimum query length constraint to prevent page crashes).",
        },
      ],
    },
  },
  {
    moduleType: "SIMULATION",
    content: {
      title: "Scope Creep mid-Sprint",
      description:
        "A Product Manager attempts to insert major new features into the current active sprint under the guise of 'minor cleanups'.",
      triggers: [
        {
          type: "slack",
          from: "Rita (Product Manager)",
          body: "Hi team! Just a quick ask: can we also add PDF downloads for report metrics in TASK-102? The data is already there in the UI, so it should be simple, right?",
          timestamp: "2026-07-14T18:00:00Z",
        },
        {
          type: "email",
          from: "Jane (Frontend Dev)",
          subject: "Risk on PDF export task addition",
          body: "Hi Rita, generating PDFs in the frontend is notoriously buggy due to CSS print formats, or we need a server-side PDF generator (puppeteer). This is not a 1-hour task.",
          timestamp: "2026-07-14T18:10:00Z",
        },
      ],
      rubric: [
        {
          criterion: "Sprint Integrity Protection",
          weight: 0.4,
          description:
            "Candidate explains sprint capacity constraints, requesting that new tasks are logged in the backlog for the next sprint.",
        },
        {
          criterion: "Estimation Accuracy",
          weight: 0.4,
          description:
            "Candidate explains the technical complexity (frontend print limitations vs backend engine requirements) to validate Jane's concerns.",
        },
        {
          criterion: "Negotiation Skills",
          weight: 0.2,
          description:
            "Candidate proposes a print stylesheet fallback as a low-effort immediate solution, deferring true PDF files.",
        },
      ],
    },
  },
  {
    moduleType: "SIMULATION",
    content: {
      title: "Flaky Tests in CI",
      description:
        "The main build pipeline fails occasionally due to database integration tests timing out during setup.",
      triggers: [
        {
          type: "ticket",
          from: "Jenkins Build System",
          body: "Build #549 FAILED. Test suite 'AuthIntegrationTests' timed out waiting for database connection pool.",
          timestamp: "2026-07-14T19:00:00Z",
        },
        {
          type: "slack",
          from: "Eric (QA Dev)",
          body: "Ugh, integration tests failed again. If I rebuild, it usually passes. Is anyone fixing this database cleanup deadlock?",
          timestamp: "2026-07-14T19:05:00Z",
        },
      ],
      rubric: [
        {
          criterion: "Flakiness Analysis",
          weight: 0.4,
          description:
            "Candidate pinpoints concurrent test database resets as the likely cause of transactional lock conflicts.",
        },
        {
          criterion: "CI Optimization",
          weight: 0.4,
          description:
            "Candidate proposes running tests in isolated transactions, using mocks for database connections in auth tests, or executing migrations once instead of per-test.",
        },
        {
          criterion: "Build Health Priority",
          weight: 0.2,
          description:
            "Candidate prioritizes resolving pipeline flakiness to maintain developer confidence in CI results.",
        },
      ],
    },
  },
  {
    moduleType: "SIMULATION",
    content: {
      title: "Third-Party Service Downtime",
      description:
        "An email delivery provider suffers a complete outage during a candidate recruitment invite campaign.",
      triggers: [
        {
          type: "ticket",
          from: "SendGrid Webhook",
          body: "ERR: SMTP Connection refused from mail.sendgrid.net. Outgoing queue backlog exceeding threshold.",
          timestamp: "2026-07-14T20:00:00Z",
        },
        {
          type: "slack",
          from: "HR Admin",
          body: "Candidates are saying they aren't receiving their invite link emails. They need to start their assessments today. What's the status?",
          timestamp: "2026-07-14T20:02:00Z",
        },
      ],
      rubric: [
        {
          criterion: "Queue Fault Tolerance",
          weight: 0.4,
          description:
            "Candidate check if invite jobs are backed by a persistent queue (like BullMQ) and confirms failed jobs will retry automatically when service restores.",
        },
        {
          criterion: "Provider Redundancy",
          weight: 0.4,
          description:
            "Candidate recommends implementing a multi-provider fallback utility (e.g. switching to AWS SES if SendGrid fails).",
        },
        {
          criterion: "Manual Workaround",
          weight: 0.2,
          description:
            "Candidate shows the HR Admin how to copy invite URLs directly from the admin dashboard to bypass email temporarily.",
        },
      ],
    },
  },
  {
    moduleType: "SIMULATION",
    content: {
      title: "Hanging Database Migration",
      description:
        "A database migration script freezes during deployment on production, causing query timeouts.",
      triggers: [
        {
          type: "ticket",
          from: "Sentry Alert",
          body: "QueryTimeoutException: Statement timeout occurred on table candidates during ALTER TABLE add column.",
          timestamp: "2026-07-14T21:00:00Z",
        },
        {
          type: "slack",
          from: "DevOps Engineer",
          body: "The migration script is trying to add a default value to a huge table. It acquired an AccessExclusiveLock, and now all select queries on candidates are blocked in queue.",
          timestamp: "2026-07-14T21:05:00Z",
        },
      ],
      rubric: [
        {
          criterion: "Emergency Recovery",
          weight: 0.4,
          description:
            "Candidate cancels the migration process immediately to release locks and restore API responsiveness.",
        },
        {
          criterion: "Safe Migration Steps",
          weight: 0.4,
          description:
            "Candidate designs a safe migration plan: add nullable column first, backfill rows in small batches, add constraint later.",
        },
        {
          criterion: "Lock Timeout Enforcements",
          weight: 0.2,
          description:
            "Candidate recommends setting lock_timeout variables on all DDL queries to avoid freezing DB.",
        },
      ],
    },
  },
  {
    moduleType: "SIMULATION",
    content: {
      title: "AWS Storage Full",
      description:
        "The object storage server runs out of disk space, preventing candidates from uploading screen recording evidence clips.",
      triggers: [
        {
          type: "ticket",
          from: "Prometheus Monitoring",
          body: "CRITICAL: Storage volume minio-disk-volume capacity reached 98%. Writes are failing.",
          timestamp: "2026-07-14T22:00:00Z",
        },
        {
          type: "email",
          from: "Proctoring Service Module",
          subject: "[ERR] Failed to upload evidence clips",
          body: "Storage client error: HTTP 507 Insufficient Storage on upload. Candidate sessions will terminate with errors.",
          timestamp: "2026-07-14T22:02:00Z",
        },
      ],
      rubric: [
        {
          criterion: "Immediate Disk Recovery",
          weight: 0.4,
          description:
            "Candidate purges expired clips or triggers lifecycle retention policies immediately to reclaim space.",
        },
        {
          criterion: "Infrastructure Scaling",
          weight: 0.4,
          description:
            "Candidate recommends configuring auto-expanding cloud storage (like AWS S3) instead of fixed local disks.",
        },
        {
          criterion: "Session Graceful Failure",
          weight: 0.2,
          description:
            "Candidate suggests adding client-side catch blocks to store recording clips in IndexedDB temporarily if upload fails.",
        },
      ],
    },
  },
  {
    moduleType: "SIMULATION",
    content: {
      title: "Vulnerability in Node Dependency",
      description:
        "An npm audit run blocks a production build because of a high-severity prototype pollution vulnerability in a deep transitive package.",
      triggers: [
        {
          type: "ticket",
          from: "Snyk Security Alert",
          body: "High Severity: Prototype pollution in package minimist <= 1.2.2. Path: webpack -> minimist.",
          timestamp: "2026-07-14T23:00:00Z",
        },
        {
          type: "slack",
          from: "Release Manager",
          body: "Build pipeline is failing due to security overrides. We need to override this dependency version. Can someone check if npm overrides/resolutions work?",
          timestamp: "2026-07-14T23:05:00Z",
        },
      ],
      rubric: [
        {
          criterion: "Package Resolution",
          weight: 0.4,
          description:
            "Candidate uses package.json 'overrides' (npm) or 'resolutions' (yarn) to force-update minimist to 1.2.8.",
        },
        {
          criterion: "Risk Evaluation",
          weight: 0.4,
          description:
            "Candidate tests the application build locally to ensure the version override doesn't break Webpack compilation.",
        },
        {
          criterion: "Proactive Security",
          weight: 0.2,
          description:
            "Candidate schedules regular dependency audits in CI rather than doing them manually at release time.",
        },
      ],
    },
  },
  {
    moduleType: "SIMULATION",
    content: {
      title: "API Performance Degradation",
      description:
        "Response latency of the candidates endpoint spikes to 4 seconds, triggering alerts.",
      triggers: [
        {
          type: "ticket",
          from: "APM latency monitor",
          body: "P95 response time for GET /api/v1/candidates exceeded 3000ms.",
          timestamp: "2026-07-15T09:00:00Z",
        },
        {
          type: "slack",
          from: "Frontend Dev",
          body: "The candidate dashboard table takes forever to load now. It seems we are performing N+1 queries for each candidate to get their sessions count.",
          timestamp: "2026-07-15T09:02:00Z",
        },
      ],
      rubric: [
        {
          criterion: "Query Optimization",
          weight: 0.4,
          description:
            "Candidate implements JOINs or includes counts in a single database query instead of looping over candidates.",
        },
        {
          criterion: "Pagination Implementation",
          weight: 0.4,
          description:
            "Candidate points out that the endpoint lacks pagination limits, loading thousands of candidates, and implements limit/offset parameters.",
        },
        {
          criterion: "Caching Options",
          weight: 0.2,
          description:
            "Candidate suggests caching active candidate lists in Redis with short expirations.",
        },
      ],
    },
  },
  {
    moduleType: "SIMULATION",
    content: {
      title: "Unreproducible QA Bug",
      description:
        "A QA engineer reports a critical bug where candidate session fails to submit, but developers cannot reproduce it locally.",
      triggers: [
        {
          type: "ticket",
          from: "QA Reporter",
          body: "CRITICAL: Clicking submit session does nothing on final page. No logs in backend.",
          timestamp: "2026-07-15T10:00:00Z",
        },
        {
          type: "slack",
          from: "QA Tester",
          body: "I've hit this twice in Safari. Chrome seems to work. The submit button is completely unresponsive.",
          timestamp: "2026-07-15T10:05:00Z",
        },
      ],
      rubric: [
        {
          criterion: "Browser Specific Testing",
          weight: 0.4,
          description:
            "Candidate tests the issue specifically on Safari browser or examines console JS exceptions.",
        },
        {
          criterion: "Log Analysis",
          weight: 0.4,
          description:
            "Candidate asks the tester for client-side console logs or requests inspecting Sentry frontend events.",
        },
        {
          criterion: "Polyfills and Compat",
          weight: 0.2,
          description:
            "Candidate identifies that a new JS feature used in submission handler is unsupported in older Safari versions.",
        },
      ],
    },
  },
  {
    moduleType: "SIMULATION",
    content: {
      title: "React Native List Lag",
      description:
        "Reviewers complain that scrolling through the candidate list on the mobile review app is stuttering and drop frames.",
      triggers: [
        {
          type: "slack",
          from: "Lead Mobile Dev",
          body: "Hey, we are dropping serious frames on candidate review screen. Frame rate drops to 15fps when scrolling. Anyone has ideas on FlatList optimization?",
          timestamp: "2026-07-15T11:00:00Z",
        },
      ],
      rubric: [
        {
          criterion: "FlatList Tweaks",
          weight: 0.4,
          description:
            "Candidate suggests setting initialNumToRender, windowSize, and using getItemLayout.",
        },
        {
          criterion: "Component Re-renders",
          weight: 0.4,
          description:
            "Candidate suggests using React.memo on items to prevent redundant layout updates.",
        },
        {
          criterion: "Asset Optimization",
          weight: 0.2,
          description:
            "Candidate checks if candidate profile thumbnails are high-resolution files and recommends thumbnail size limits.",
        },
      ],
    },
  },
  {
    moduleType: "SIMULATION",
    content: {
      title: "CI Pipeline Cache Fail",
      description:
        "CI builds are taking 20 minutes because npm install is downloading all node_modules from scratch for every build run.",
      triggers: [
        {
          type: "slack",
          from: "Bob (DevOps)",
          body: "Our CI runner bills are skyrocketing. The cache key in GitHub Actions might be broken because package-lock.json hashing is failing.",
          timestamp: "2026-07-15T12:00:00Z",
        },
      ],
      rubric: [
        {
          criterion: "Cache Key Hashing",
          weight: 0.4,
          description:
            "Candidate verifies the GHA workflow yaml file configuration, checking the hashFiles('package-lock.json') pattern.",
        },
        {
          criterion: "Dependency Lock Sync",
          weight: 0.4,
          description:
            "Candidate checks if package-lock.json matches package.json directly or if local developers are modifying package.json without committing locks.",
        },
        {
          criterion: "NPM CI Usage",
          weight: 0.2,
          description:
            "Candidate ensures the build script uses 'npm ci' instead of 'npm install'.",
        },
      ],
    },
  },
  {
    moduleType: "SIMULATION",
    content: {
      title: "Deprecating Node 18 Support",
      description:
        "The team needs to upgrade backend microservices from Node 18 to Node 22 because 18 is approaching End of Life.",
      triggers: [
        {
          type: "email",
          from: "Tech Arch",
          subject: "Node.js 22 Upgrade Plan",
          body: "Hi team, we need to upgrade the API services to Node 22 next week. Please test core modules for compatibility problems (e.g. changes in crypto modules or fetch api behavior).",
          timestamp: "2026-07-15T13:00:00Z",
        },
      ],
      rubric: [
        {
          criterion: "Local Compatibility Testing",
          weight: 0.4,
          description:
            "Candidate changes local runtime to Node 22, executes the test suite, and reports any compilation issues or deprecation warnings.",
        },
        {
          criterion: "Docker and CI Configs",
          weight: 0.4,
          description:
            "Candidate updates the Docker base images (node:22-alpine) and CI build runner versions in parallel.",
        },
        {
          criterion: "Dependency Auditing",
          weight: 0.2,
          description:
            "Candidate checks if native binary compilation libraries (e.g. node-gyp components) require upgrades.",
        },
      ],
    },
  },
];
