export interface EventTemplate {
  id: string;
  track: "fresher" | "experienced";
  workspaceType:
    "chat" | "jira" | "code" | "pipeline" | "security" | "incident" | "email";
  artifactIds: string[];
  eventDepth: "shallow" | "medium" | "deep";
  timerSeconds: number;
  supportedActions: string[];
  competencies: string[];
  title: string;
  description: string;
}

export const eventTemplates: EventTemplate[] = [
  // --- FRESHER TRACK EVENTS ---
  {
    id: "fresher_manager_eta",
    track: "fresher",
    workspaceType: "chat",
    artifactIds: ["fresher_eta_request_slack"],
    eventDepth: "shallow",
    timerSeconds: 90,
    supportedActions: ["respond"],
    competencies: ["Communication", "Planning"],
    title: "Manager ETA Request",
    description:
      "Your engineering manager asks for an ETA and blockers for a dashboard feature demo scheduled for tomorrow.",
  },
  {
    id: "fresher_req_clarify",
    track: "fresher",
    workspaceType: "jira",
    artifactIds: ["fresher_requirement_jira"],
    eventDepth: "medium",
    timerSeconds: 120,
    supportedActions: ["ask_clarification", "state_assumption"],
    competencies: ["Communication", "Requirement Understanding"],
    title: "Requirement Clarification",
    description:
      "You receive an ambiguous Jira ticket to implement profile search without clear search parameters or constraints.",
  },
  {
    id: "fresher_qa_bug",
    track: "fresher",
    workspaceType: "code",
    artifactIds: ["fresher_bug_report_jira", "fresher_bug_code"],
    eventDepth: "deep",
    timerSeconds: 180,
    supportedActions: ["edit_code", "run_tests", "submit_fix"],
    competencies: ["Debugging", "Ownership"],
    title: "QA Bug Report",
    description:
      "A bug ticket reports that empty, space-only profile names bypass validation, breaking the recruiter dashboard UI.",
  },
  {
    id: "fresher_code_review",
    track: "fresher",
    workspaceType: "jira", // Uses PR comment interface
    artifactIds: ["fresher_code_review_pr"],
    eventDepth: "medium",
    timerSeconds: 120,
    supportedActions: ["comment", "approve", "reject"],
    competencies: ["Collaboration", "Code Quality Awareness"],
    title: "Code Review Request",
    description:
      "A teammate submits a pull request refactoring the cache layer. You must review the diff for bugs and code quality issues.",
  },
  {
    id: "fresher_teammate_question",
    track: "fresher",
    workspaceType: "chat",
    artifactIds: ["fresher_teammate_question_slack"],
    eventDepth: "shallow",
    timerSeconds: 90,
    supportedActions: ["respond"],
    competencies: ["Communication", "Collaboration"],
    title: "Teammate Question",
    description:
      "A teammate asks for guidance on how database indexes work and when they should be avoided.",
  },

  // --- EXPERIENCED TRACK EVENTS ---
  {
    id: "experienced_prod_incident",
    track: "experienced",
    workspaceType: "incident",
    artifactIds: [
      "experienced_incident_dashboard",
      "experienced_incident_logs",
      "experienced_incident_timeline",
    ],
    eventDepth: "deep",
    timerSeconds: 240,
    supportedActions: ["investigate", "rollback", "escalate"],
    competencies: ["Incident Handling", "Ownership", "Technical Judgment"],
    title: "Production Incident",
    description:
      "A severe CPU utilization spike on the database primary instance starts causing checkout timeouts right after a new deployment.",
  },
  {
    id: "experienced_pipeline_failure",
    track: "experienced",
    workspaceType: "pipeline",
    artifactIds: ["experienced_pipeline_config", "experienced_pipeline_logs"],
    eventDepth: "deep",
    timerSeconds: 240,
    supportedActions: ["run_tests", "edit_config", "re_run_pipeline"],
    competencies: ["Debugging", "Technical Judgment"],
    title: "Pipeline Failure",
    description:
      "The main build pipeline fails during the npm install / husky setup step, blocking all releases.",
  },
  {
    id: "experienced_security_alert",
    track: "experienced",
    workspaceType: "security",
    artifactIds: ["experienced_security_alert", "experienced_security_code"],
    eventDepth: "deep",
    timerSeconds: 180,
    supportedActions: ["patch_code", "deactivate_key", "escalate"],
    competencies: ["Security Awareness", "Risk Management"],
    title: "Security Alert",
    description:
      "An automated security scan reports a high-severity alert: AWS access credentials were leaked in a public code repository.",
  },
  {
    id: "experienced_customer_escalation",
    track: "experienced",
    workspaceType: "email",
    artifactIds: ["experienced_customer_escalation_email"],
    eventDepth: "medium",
    timerSeconds: 180,
    supportedActions: ["respond", "propose_plan"],
    competencies: ["Communication", "Ownership", "Prioritization"],
    title: "Customer Escalation",
    description:
      "An account manager forwards an urgent customer complaint: enterprise checkouts are failing with error codes in Europe.",
  },
  {
    id: "experienced_priority_conflict",
    track: "experienced",
    workspaceType: "chat",
    artifactIds: ["experienced_priority_conflict_slack"],
    eventDepth: "shallow",
    timerSeconds: 120,
    supportedActions: ["choose_stripe", "choose_cache", "propose_compromise"],
    competencies: ["Prioritization", "Engineering Judgment"],
    title: "Priority Conflict",
    description:
      "The PM pushes for the Stripe Europe checkout bug fix, while the Tech Lead insists on fixing a crash-looping cache memory leak.",
  },
];

export function getTemplatesByTrack(
  track: "fresher" | "experienced",
): EventTemplate[] {
  return eventTemplates.filter((t) => t.track === track);
}
