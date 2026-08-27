import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import {
  Search,
  Plus,
  Filter,
  Database,
  Tag,
  ShieldCheck,
  FileSpreadsheet,
  Trash2,
  X,
  Edit3,
  Download,
  UploadCloud,
  Check,
  Folder,
  ChevronRight,
  ArrowLeft,
  Sparkles,
  Layers,
  GraduationCap,
} from "lucide-react";
import { AppShell } from "../components/app-shell";
import { useStore } from "../lib/store";
import { ModuleType } from "@cd-recruit/shared-types";
import { CodeEditor } from "../components/common/CodeEditor";
import { processQuestionTags } from "./drives.$id";
import {
  MODULE_LABEL_MAP,
  getDepartmentAllowedModules,
} from "../lib/roleModules";

export type TagSectionType = "module" | "level" | "topic" | "drive";

export const CANONICAL_MODULES: Array<{ key: string; label: string; aliases: string[] }> = [
  { key: "AI_PROMPTING", label: "AI Prompting", aliases: ["ai_prompting", "ai-prompting", "aiprompting", "prompting", "ai"] },
  { key: "CODING", label: "Coding", aliases: ["coding", "code", "dsa"] },
  { key: "DEBUGGING", label: "Debugging", aliases: ["debugging", "debug"] },
  { key: "MCQ", label: "MCQ", aliases: ["mcq", "multiplechoice", "multiple_choice"] },
  { key: "NOSQL", label: "NoSQL", aliases: ["nosql", "mongodb"] },
  { key: "SIMULATION", label: "Context Simulation", aliases: ["simulation", "contextsimulation", "contextualsimulation"] },
  { key: "SQL", label: "SQL", aliases: ["sql"] },
  { key: "TEST_SCENARIOS", label: "Test Scenarios", aliases: ["test_scenarios", "test-scenarios", "testscenarios", "scenarios", "testscenario"] },
];

export const CANONICAL_LEVELS: Array<{ key: string; label: string; tier: string; aliases: string[] }> = [
  { key: "0-1", label: "Fresher (0-1 yrs)", tier: "0-1", aliases: ["fresher", "freshers", "intern", "0-1", "0-1 yrs", "entry", "01"] },
  { key: "2-5", label: "Level 1 (2-5 yrs)", tier: "2-5", aliases: ["l1", "level1", "level 1", "2-5", "2-5 yrs", "junior", "25"] },
  { key: "6-10", label: "Level 2 (6-10 yrs)", tier: "6-10", aliases: ["l2", "level2", "level 2", "6-10", "6-10 yrs", "mid", "senior", "610"] },
  { key: "11-15", label: "Level 3 (11+ yrs)", tier: "11-15", aliases: ["l3", "level3", "level 3", "11-15", "11-15 yrs", "11+", "11+ yrs", "lead", "staff", "principal", "1115"] },
];

export const TOPIC_TAXONOMY_MAP: Record<string, string> = {
  // Algorithms & DSA
  "algorithm": "Algorithms",
  "algorithms": "Algorithms",
  "data-structure": "Data Structures",
  "data-structures": "Data Structures",
  "data_structures": "Data Structures",
  "array": "Arrays",
  "arrays": "Arrays",
  "string": "Strings",
  "strings": "Strings",
  "tree": "Trees",
  "trees": "Trees",
  "binary-tree": "Binary Trees",
  "binary-search": "Binary Search",
  "stack": "Stacks",
  "stacks": "Stacks",
  "queue": "Queues",
  "queues": "Queues",
  "graph": "Graphs",
  "graphs": "Graphs",
  "hash-map": "Hash Maps",
  "hash-maps": "Hash Maps",
  "hash-tables": "Hash Tables",
  "linked-list": "Linked Lists",
  "linked-lists": "Linked Lists",
  "dynamic-programming": "Dynamic Programming",
  "dp": "Dynamic Programming",
  "recursion": "Recursion",
  "backtracking": "Backtracking",
  "two-pointers": "Two Pointers",
  "sliding-window": "Sliding Window",
  "sorting": "Sorting Algorithms",
  "time-complexity": "Time Complexity & Big-O",

  // Operating Systems & Infrastructure
  "os": "Operating Systems",
  "operating-systems": "Operating Systems",
  "operating-system": "Operating Systems",
  "linux": "Linux",
  "windows": "Windows Administration",
  "active-directory": "Active Directory",
  "active_directory": "Active Directory",
  "bitlocker": "BitLocker & Key Mgmt",
  "bitlocker/key-management": "BitLocker & Key Mgmt",
  "mdm-rollout": "MDM Rollout",
  "automated-patching": "Automated Patching",
  "patch-management": "Patch Management",
  "hardware": "Hardware Lifecycle",
  "hardware-lifecycle": "Hardware Lifecycle",
  "endpoint": "Endpoint Management",
  "endpoint-management": "Endpoint Management",

  // Software Engineering & Languages
  "software_engineering": "Software Engineering",
  "software-engineering": "Software Engineering",
  "software engineering": "Software Engineering",
  "sde": "Software Engineering",
  "java": "Java",
  "java-oop": "Java & OOP",
  "core-java-&-oop": "Java & OOP",
  "python": "Python",
  "javascript": "JavaScript",
  "typescript": "TypeScript",
  "oop": "OOP Concepts",
  "concurrency": "Concurrency & Multithreading",
  "thread-safety": "Thread Safety",
  "code-quality": "Code Quality",
  "code-review": "Code Review",
  "refactoring": "Refactoring",
  "design-patterns": "Design Patterns",
  "system-design": "System Design",
  "microservices": "Microservices",
  "docker": "Docker",
  "kubernetes": "Kubernetes",
  "terraform": "Terraform",
  "ci/cd": "CI/CD Pipelines",
  "pipeline": "CI/CD Pipelines",

  // Database & SQL
  "sql-basics": "SQL Fundamentals",
  "sql basics": "SQL Fundamentals",
  "sql-debugging": "SQL Debugging",
  "sql-assistance": "SQL Optimization",
  "joins": "SQL Joins",
  "subqueries": "SQL Subqueries",
  "subquery": "SQL Subqueries",
  "group-by": "SQL Aggregation & Grouping",
  "group-by/having": "SQL Aggregation & Grouping",
  "having": "SQL Aggregation & Grouping",
  "aggregation": "SQL Aggregation & Grouping",
  "cte": "Common Table Expressions (CTE)",
  "window-functions": "Window Functions",
  "indexes": "Database Indexing",
  "indexing": "Database Indexing",
  "normalization": "Database Normalization",
  "transactions": "Database Transactions",
  "nulls": "Null Handling",
  "null-handling": "Null Handling",

  // SRE & DevOps
  "sre": "SRE & System Reliability",
  "reliability-engineering": "SRE & System Reliability",
  "system-reliability": "SRE & System Reliability",
  "observability": "Observability & Telemetry",
  "monitoring": "Monitoring & Alerting",
  "alert-triage": "Alert Triage",
  "slo": "SLO & SLA Management",
  "slo/sla-management": "SLO & SLA Management",
  "incident": "Incident Response",
  "incident-response": "Incident Response",
  "incident-command": "Incident Command",
  "incident-post-mortems": "Post-Mortems & RCA",
  "postmortem": "Post-Mortems & RCA",
  "rca": "Post-Mortems & RCA",
  "root-cause": "Root Cause Analysis",
  "dr": "Disaster Recovery",
  "disaster-recovery": "Disaster Recovery",
  "disaster-recovery-drill": "Disaster Recovery",
  "disaster-recovery-&-outage": "Disaster Recovery",
  "capacity": "Capacity Planning",
  "capacity-planning": "Capacity Planning",
  "high-load-traffic-estimation": "Traffic Estimation & Load",
  "caching": "Caching Architectures",
  "caching-architectures": "Caching Architectures",
  "circuit-breakers": "Circuit Breakers & Resilience",

  // Security & Compliance
  "security": "Cybersecurity Fundamentals",
  "cybersecurity-fundamentals": "Cybersecurity Fundamentals",
  "security-testing": "Security Testing",
  "security-tools": "Security Tools",
  "security-logging": "Security Logging & Audit",
  "security-monitoring": "Security Monitoring",
  "application-security": "Application Security",
  "cloud-security": "Cloud Security",
  "network-security": "Network Security",
  "iam": "IAM & Access Control",
  "iam-hardening": "IAM Hardening",
  "iam-privilege-audit": "IAM Privilege Audit",
  "cloud-iam-policies": "Cloud IAM Policies",
  "authentication": "Authentication",
  "authorization": "Authorization",
  "threat-hunting": "Threat Hunting",
  "vulnerability": "Vulnerability Management",
  "malware": "Malware & Ransomware",
  "ransomware": "Malware & Ransomware",
  "ransomware-containment": "Ransomware Containment",
  "phishing": "Phishing & Email Security",
  "email-security": "Email Security",
  "siem": "SIEM & SOC Operations",
  "soc": "SIEM & SOC Operations",
  "defense-in-depth": "Defense-in-Depth",

  // Networking
  "network": "Networking",
  "networking": "Networking",
  "protocols": "Network Protocols & Ports",
  "ports": "Network Protocols & Ports",
  "osi": "OSI Model & Routing",
  "firewall": "Firewalls & VPNs",
  "vpn": "Firewalls & VPNs",

  // QA & Testing
  "qa": "QA Methodologies",
  "testing": "Testing Concepts",
  "testing-concepts": "Testing Concepts",
  "acceptance": "Acceptance Criteria & Testing",
  "acceptance-criteria": "Acceptance Criteria & Testing",
  "boundary": "Boundary Value Analysis",
  "boundary-testing": "Boundary Value Analysis",
  "regression": "Regression Testing",
  "negative-testing": "Negative Testing",
  "flaky-tests": "Flaky Tests Triage",
  "scenario-testing": "Scenario Testing",
  "automation": "Test Automation",
  "automation-design": "Test Automation Design",
  "automation-scenario": "Automation Scenarios",
  "playwright": "Playwright Automation",
  "selenium": "Selenium WebDriver",
  "gherkin": "Gherkin & BDD Scenarios",
  "api-testing": "API Testing",
  "api-contract": "API Contracts",

  // PMO, Agile & Management
  "pmo": "Project Management",
  "agile": "Agile & Scrum",
  "agile-velocity-fluctuations": "Velocity & Sprint Health",
  "meeting": "Meetings & Ceremonies",
  "meetings": "Meetings & Ceremonies",
  "stakeholder": "Stakeholder Management",
  "stakeholders": "Stakeholder Management",
  "stakeholder-communication": "Stakeholder Communication",
  "stakeholder-conflicts": "Stakeholder Alignment",
  "change": "Change Management",
  "change-control": "Change Management",
  "change-management": "Change Management",
  "scope": "Scope & Scope Creep",
  "scope-creep": "Scope & Scope Creep",
  "risk": "Risk Management",
  "risk-management": "Risk Management",
  "milestone-delays": "Milestone & Schedule Mgmt",
  "schedule": "Milestone & Schedule Mgmt",
  "vendor": "Vendor Management",
  "vendor-sla-management": "Vendor Management",
  "sow": "SOW & Contracts",
  "say-do": "Say-Do Consistency",
  "say-do-consistency": "Say-Do Consistency",
  "decision-making": "Decision Making",
  "communication": "Technical Communication",
  "technical-communication": "Technical Communication",
};

export function classifyTag(rawTag: string): TagSectionType {
  const tag = rawTag.trim().toLowerCase();

  if (tag.startsWith("module:")) return "module";
  if (tag.startsWith("level:")) return "level";
  if (tag.startsWith("topic:")) return "topic";
  if (tag.startsWith("drive:") || tag.startsWith("#drive:") || tag.startsWith("[drive]")) return "drive";

  // Check aliases
  if (CANONICAL_MODULES.some((m) => m.aliases.includes(tag.replace(/[-_\s]+/g, "")))) return "module";
  if (CANONICAL_LEVELS.some((l) => l.aliases.includes(tag.replace(/[-_\s]+/g, "")))) return "level";
  if (tag.includes("drive:") || tag.includes("drive-") || tag.includes("drive_")) return "drive";

  return "topic";
}

export function formatTagDisplayName(tag: string, section?: TagSectionType): { title: string; subtitle: string } {
  const sec = section || classifyTag(tag);
  const raw = tag.replace(/^(module:|level:|topic:|drive:)/i, "").trim();

  if (sec === "module") {
    const cleanNorm = raw.toLowerCase().replace(/[-_\s]+/g, "");
    const matched = CANONICAL_MODULES.find(
      (m) => m.key.toLowerCase() === raw.toLowerCase() || m.aliases.includes(cleanNorm),
    );
    if (matched) return { title: matched.label, subtitle: "Assessment Module" };
    if (MODULE_LABEL_MAP[raw.toUpperCase()]) return { title: MODULE_LABEL_MAP[raw.toUpperCase()], subtitle: "Assessment Module" };
    const clean = raw.replace(/[_-]/g, " ");
    return {
      title: clean.charAt(0).toUpperCase() + clean.slice(1),
      subtitle: "Assessment Module",
    };
  }

  if (sec === "level") {
    const cleanNorm = raw.toLowerCase().replace(/[-_\s]+/g, "");
    const matched = CANONICAL_LEVELS.find(
      (l) => l.key.toLowerCase() === raw.toLowerCase() || l.aliases.includes(cleanNorm),
    );
    if (matched) return { title: matched.label, subtitle: "Seniority Tier" };
    return { title: raw.toUpperCase(), subtitle: "Seniority Tier" };
  }

  if (sec === "drive") {
    const cleaned = raw.replace(/^(#?drive\s*:\s*|#?drive\s*-\s*|\[drive\]\s*)/i, "").trim();
    return {
      title: cleaned || raw,
      subtitle: "Drive Import",
    };
  }

  // Topic
  const cleanLower = raw.toLowerCase().trim();
  if (cleanLower === "untagged") {
    return { title: "Untagged Questions", subtitle: "General" };
  }
  if (TOPIC_TAXONOMY_MAP[cleanLower]) {
    return { title: TOPIC_TAXONOMY_MAP[cleanLower], subtitle: "Topic" };
  }
  const cleanTitle = cleanLower
    .replace(/[_-]+/g, " ")
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  return {
    title: cleanTitle,
    subtitle: "Topic",
  };
}

export const Route = createFileRoute("/questions")({
  component: QuestionBankPage,
  head: () => ({
    meta: [
      { title: "Question Bank — Proctora" },
      {
        name: "description",
        content:
          "Author and review questions, configure automated validation scripts, and track cohort statistics.",
      },
    ],
  }),
});

export const TOPIC_DOMAINS = [
  { id: "all", label: "All Topics" },
  { id: "languages", label: "Languages & Frameworks" },
  { id: "databases", label: "Data & Databases" },
  { id: "sre_devops", label: "SRE & DevOps" },
  { id: "security", label: "Cybersecurity & IAM" },
  { id: "qa_testing", label: "QA & Testing" },
  { id: "pmo_agile", label: "PMO & Agile" },
  { id: "core_cs", label: "Core CS & Systems" },
] as const;

export function getTopicDomainId(titleOrTag: string): string {
  const lower = titleOrTag.toLowerCase();
  if (
    lower.includes("javascript") ||
    lower.includes("typescript") ||
    lower.includes("python") ||
    lower.includes("react") ||
    lower.includes("java") ||
    lower.includes("node") ||
    lower.includes("c++") ||
    lower.includes("golang") ||
    lower.includes("framework")
  ) {
    return "languages";
  }
  if (
    lower.includes("sql") ||
    lower.includes("nosql") ||
    lower.includes("data") ||
    lower.includes("database") ||
    lower.includes("mongo") ||
    lower.includes("postgres") ||
    lower.includes("schema") ||
    lower.includes("index") ||
    lower.includes("transaction") ||
    lower.includes("normalization") ||
    lower.includes("aggregation")
  ) {
    return "databases";
  }
  if (
    lower.includes("sre") ||
    lower.includes("reliability") ||
    lower.includes("observability") ||
    lower.includes("telemetry") ||
    lower.includes("monitoring") ||
    lower.includes("alert") ||
    lower.includes("slo") ||
    lower.includes("sla") ||
    lower.includes("incident") ||
    lower.includes("post-mortem") ||
    lower.includes("rca") ||
    lower.includes("disaster") ||
    lower.includes("recovery") ||
    lower.includes("capacity") ||
    lower.includes("caching") ||
    lower.includes("circuit") ||
    lower.includes("devops")
  ) {
    return "sre_devops";
  }
  if (
    lower.includes("security") ||
    lower.includes("cyber") ||
    lower.includes("iam") ||
    lower.includes("auth") ||
    lower.includes("threat") ||
    lower.includes("vulnerability") ||
    lower.includes("malware") ||
    lower.includes("ransomware") ||
    lower.includes("phishing") ||
    lower.includes("siem") ||
    lower.includes("soc") ||
    lower.includes("privilege")
  ) {
    return "security";
  }
  if (
    lower.includes("qa") ||
    lower.includes("test") ||
    lower.includes("automation") ||
    lower.includes("playwright") ||
    lower.includes("selenium") ||
    lower.includes("gherkin") ||
    lower.includes("bdd") ||
    lower.includes("regression") ||
    lower.includes("boundary") ||
    lower.includes("flaky") ||
    lower.includes("acceptance")
  ) {
    return "qa_testing";
  }
  if (
    lower.includes("pmo") ||
    lower.includes("agile") ||
    lower.includes("scrum") ||
    lower.includes("sprint") ||
    lower.includes("stakeholder") ||
    lower.includes("change") ||
    lower.includes("management") ||
    lower.includes("velocity") ||
    lower.includes("risk")
  ) {
    return "pmo_agile";
  }
  return "core_cs";
}

function QuestionBankPage() {
  const navigate = useNavigate();
  const questions = useStore((s) => s.questions);
  const fetchQuestions = useStore((s) => s.fetchQuestions);
  const createQuestion = useStore((s) => s.createQuestion);
  const updateQuestion = useStore((s) => s.updateQuestion);
  const archiveQuestion = useStore((s) => s.archiveQuestion);
  const bulkUploadQuestions = useStore((s) => s.bulkUploadQuestions);

  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [folderQuery, setFolderQuery] = useState("");
  const [modFilter, setModFilter] = useState<string>("all");
  const [diffFilter, setDiffFilter] = useState<string>("all");
  const [targetLevelFilter, setTargetLevelFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [selectedTopicDomain, setSelectedTopicDomain] = useState<string>("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<any | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const autoBulk = params.get("autoBulk") === "true";
      const driveName = params.get("driveName");

      if (driveName) {
        setSelectedFolder(driveName);
      }
      if (autoBulk) {
        setShowImportModal(true);
      }
    }
  }, []);

  // Form State (Create)
  const [moduleType, setModuleType] = useState<string>("MCQ");
  const [promptText, setPromptText] = useState("");
  const [difficulty, setDifficulty] = useState("medium");
  const [targetLevel, setTargetLevel] = useState("0-1");
  const [tagsInput, setTagsInput] = useState("");
  const [role, setRole] = useState("General");

  // MCQ specific (Create)
  const [mcqOptions, setMcqOptions] = useState<string[]>(["", "", "", ""]);
  const [correctIndex, setCorrectIndex] = useState(0);

  // SQL specific (Create)
  const [sqlSchema, setSqlSchema] = useState("");
  const [sqlSeed, setSqlSeed] = useState("");
  const [sqlExpectedQuery, setSqlExpectedQuery] = useState("");

  // NoSQL specific (Create)
  const [nosqlCollections, setNosqlCollections] = useState("");
  const [nosqlAllowedOps, setNosqlAllowedOps] = useState<string[]>([]);
  const [nosqlValidatorType, setNosqlValidatorType] = useState("OUTPUT_COMPARISON");
  const [nosqlExpectedOp, setNosqlExpectedOp] = useState("");
  const [nosqlDatasetRef, setNosqlDatasetRef] = useState("");

  // Coding specific (Create)
  const [starterCode, setStarterCode] = useState("");
  const [testCasesInput, setTestCasesInput] = useState("");

  // Simulation specific (Create)
  const [simTriggers, setSimTriggers] = useState("");
  const [simRubric, setSimRubric] = useState("");

  // AI Prompting specific (Create)
  const [aiSystemContext, setAiSystemContext] = useState("");
  const [aiTechStack, setAiTechStack] = useState("React/TypeScript");
  const [aiIdealResponse, setAiIdealResponse] = useState("");

  // Edit Form State
  const [editPromptText, setEditPromptText] = useState("");
  const [editDifficulty, setEditDifficulty] = useState("medium");
  const [editTargetLevel, setEditTargetLevel] = useState("0-1");
  const [editTagsInput, setEditTagsInput] = useState("");
  const [editRole, setEditRole] = useState("General");
  const [editMcqOptions, setEditMcqOptions] = useState<string[]>(["", "", "", ""]);
  const [editCorrectIndex, setEditCorrectIndex] = useState(0);
  const [editSqlSchema, setEditSqlSchema] = useState("");
  const [editSqlSeed, setEditSqlSeed] = useState("");
  const [editSqlExpectedQuery, setEditSqlExpectedQuery] = useState("");
  const [editNosqlCollections, setEditNosqlCollections] = useState("");
  const [editNosqlAllowedOps, setEditNosqlAllowedOps] = useState<string[]>([]);
  const [editNosqlValidatorType, setEditNosqlValidatorType] = useState("OUTPUT_COMPARISON");
  const [editNosqlExpectedOp, setEditNosqlExpectedOp] = useState("");
  const [editNosqlDatasetRef, setEditNosqlDatasetRef] = useState("");

  const [editStarterCode, setEditStarterCode] = useState("");
  const [editTestCasesInput, setEditTestCasesInput] = useState("");
  const [editSimTriggers, setEditSimTriggers] = useState("");
  const [editSimRubric, setEditSimRubric] = useState("");
  const [editAiSystemContext, setEditAiSystemContext] = useState("");
  const [editAiTechStack, setEditAiTechStack] = useState("React/TypeScript");
  const [editAiIdealResponse, setEditAiIdealResponse] = useState("");

  // Bulk Import State
  const [importModuleType, setImportModuleType] = useState<string>("MCQ");
  const [csvFile, setCsvFile] = useState<File | null>(null);

  // Confirmation Modal State
  const [confirmArchiveQuestion, setConfirmArchiveQuestion] = useState<any | null>(null);
  const [confirmDeleteFolder, setConfirmDeleteFolder] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchQuestions({
        moduleType: modFilter !== "all" ? modFilter : undefined,
        difficulty: diffFilter !== "all" ? diffFilter : undefined,
        targetLevel: targetLevelFilter !== "all" ? targetLevelFilter : undefined,
        role: roleFilter !== "all" ? roleFilter : undefined,
        search: query.trim() ? query.trim() : undefined,
      });
    }, 250);

    return () => clearTimeout(timer);
  }, [modFilter, diffFilter, targetLevelFilter, roleFilter, query]);

  // Grouped questions helper by canonical sections
  const { groupedQuestions, categorizedTagGroups } = useMemo(() => {
    const groups: Record<string, typeof questions> = {};

    const categorized: Record<
      TagSectionType,
      Array<{ tag: string; title: string; subtitle: string; questions: typeof questions }>
    > = {
      module: [],
      level: [],
      topic: [],
      drive: [],
    };

    // 1. Group Module Types by canonical key
    CANONICAL_MODULES.forEach((mod) => {
      const folderKey = `module:${mod.key}`;
      const matchingQuestions = questions.filter((q) => {
        const qMod = (q.moduleType || "").toUpperCase();
        if (qMod === mod.key) return true;
        const qTags = (q.tags || []).map((t) => t.toLowerCase().replace(/[-_\s]+/g, ""));
        return mod.aliases.some((alias) => qTags.includes(alias));
      });

      if (matchingQuestions.length > 0) {
        groups[folderKey] = matchingQuestions;
        groups[mod.key.toLowerCase()] = matchingQuestions;
        categorized.module.push({
          tag: folderKey,
          title: mod.label,
          subtitle: "Assessment Module",
          questions: matchingQuestions,
        });
      }
    });

    // 2. Group Experience Levels by canonical tier
    CANONICAL_LEVELS.forEach((lvl) => {
      const folderKey = `level:${lvl.key}`;
      const matchingQuestions = questions.filter((q) => {
        if (q.targetLevel === lvl.tier) return true;
        const qTags = (q.tags || []).map((t) => t.toLowerCase().replace(/[-_\s]+/g, ""));
        return lvl.aliases.some((alias) => qTags.includes(alias));
      });

      if (matchingQuestions.length > 0) {
        groups[folderKey] = matchingQuestions;
        groups[lvl.key] = matchingQuestions;
        categorized.level.push({
          tag: folderKey,
          title: lvl.label,
          subtitle: "Seniority Tier",
          questions: matchingQuestions,
        });
      }
    });

    // 3. Group Topics & Drives
    const driveTagMap = new Map<string, typeof questions>();
    const topicTagMap = new Map<string, { title: string; questions: typeof questions }>();

    questions.forEach((q) => {
      const rawTags = q.tags && q.tags.length > 0 ? q.tags : ["untagged"];
      rawTags.forEach((rawTag) => {
        const cleanTag = rawTag.trim().toLowerCase();
        if (!cleanTag) return;

        // Is Drive
        if (
          cleanTag.startsWith("drive:") ||
          cleanTag.startsWith("#drive:") ||
          cleanTag.startsWith("drive-") ||
          cleanTag.startsWith("drive_") ||
          cleanTag.startsWith("[drive]") ||
          cleanTag.includes("drive:")
        ) {
          const driveKey = `drive:${cleanTag}`;
          if (!driveTagMap.has(driveKey)) {
            driveTagMap.set(driveKey, []);
          }
          const list = driveTagMap.get(driveKey)!;
          if (!list.some((x) => x.id === q.id)) {
            list.push(q);
          }
          return;
        }

        // Skip module & level tags from topics cloud
        const cleanNormalized = cleanTag.replace(/[-_\s]+/g, "");
        if (CANONICAL_MODULES.some((m) => m.aliases.includes(cleanNormalized))) return;
        if (CANONICAL_LEVELS.some((l) => l.aliases.includes(cleanNormalized))) return;

        // Canonical topic mapping
        const canonicalTitle = formatTagDisplayName(cleanTag, "topic").title;
        const topicKey = `topic:${canonicalTitle}`;

        if (!topicTagMap.has(topicKey)) {
          topicTagMap.set(topicKey, { title: canonicalTitle, questions: [] });
        }
        const topicEntry = topicTagMap.get(topicKey)!;
        if (!topicEntry.questions.some((x) => x.id === q.id)) {
          topicEntry.questions.push(q);
        }
      });
    });

    // Populate Drive section
    driveTagMap.forEach((qList, driveKey) => {
      groups[driveKey] = qList;
      const raw = driveKey.replace(/^drive:/, "");
      groups[raw] = qList;
      const { title, subtitle } = formatTagDisplayName(raw, "drive");
      categorized.drive.push({
        tag: driveKey,
        title,
        subtitle,
        questions: qList,
      });
    });

    // Populate Topic section
    topicTagMap.forEach((entry, topicKey) => {
      groups[topicKey] = entry.questions;
      groups[entry.title] = entry.questions;
      categorized.topic.push({
        tag: topicKey,
        title: entry.title,
        subtitle: "Topic",
        questions: entry.questions,
      });
    });

    // Auto-sort alphabetically within each section (A to Z)
    (Object.keys(categorized) as TagSectionType[]).forEach((sec) => {
      categorized[sec].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
    });

    return { groupedQuestions: groups, categorizedTagGroups: categorized };
  }, [questions]);

  const handleOpenEdit = (q: any) => {
    setEditingQuestion(q);
    setEditDifficulty(q.difficulty);
    setEditTargetLevel(q.targetLevel || "0-1");
    setEditTagsInput(q.tags?.join(", ") || "");
    setEditPromptText(q.content?.prompt || q.content?.title || "");
    setEditRole(q.role || "General");

    if (q.moduleType === "MCQ") {
      const opts = [...(q.content?.options || ["", "", "", ""])];
      while (opts.length < 4) opts.push("");
      setEditMcqOptions(opts);
      setEditCorrectIndex(q.scoringConfig?.correctIndex ?? 0);
    } else if (q.moduleType === "SQL") {
      setEditSqlSchema(q.content?.schema || "");
      setEditSqlSeed(q.content?.seedData || "");
      setEditSqlExpectedQuery(q.content?.expectedQuery || "");
    } else if (q.moduleType === "NOSQL") {
      setEditNosqlCollections(q.content?.collections?.join(", ") || "");
      setEditNosqlAllowedOps(q.content?.allowedOperations || []);
      setEditNosqlValidatorType(q.content?.validatorType || "OUTPUT_COMPARISON");
      setEditNosqlExpectedOp(
        q.content?.expectedOperation ? JSON.stringify(q.content.expectedOperation, null, 2) : ""
      );
      setEditNosqlDatasetRef(q.content?.datasetRef || "");
    } else if (q.moduleType === "CODING" || q.moduleType === "DEBUGGING") {
      const code = typeof q.content?.starterCode === "object"
        ? (q.content.starterCode.javascript || q.content.starterCode.python || JSON.stringify(q.content.starterCode, null, 2))
        : (q.content?.starterCode || "");
      setEditStarterCode(code);
      setEditTestCasesInput(
        q.content?.testCases ? JSON.stringify(q.content.testCases, null, 2) : ""
      );
    } else if (q.moduleType === "AI_PROMPTING") {
      setEditAiSystemContext(q.content?.context || q.content?.systemContext || "");
      setEditAiTechStack(q.content?.techStack || "React/TypeScript");
      setEditAiIdealResponse(q.content?.idealResponseSummary || "");
    } else if (q.moduleType === "SIMULATION") {
      setEditSimTriggers(
        q.content?.triggers ? JSON.stringify(q.content.triggers, null, 2) : ""
      );
      setEditSimRubric(
        q.content?.rubric ? JSON.stringify(q.content.rubric, null, 2) : ""
      );
    }
  };

  const handleUpdate = async () => {
    if (!editingQuestion) return;
    const content: any = { prompt: editPromptText };
    const scoringConfig: any = {};

    try {
      if (editingQuestion.moduleType === "MCQ") {
        content.options = editMcqOptions.filter((o) => o.trim());
        if (content.options.length < 2) {
          toast.error("Please provide at least 2 options");
          return;
        }
        scoringConfig.correctIndex = editCorrectIndex;
      } else if (editingQuestion.moduleType === "SQL") {
        content.schema = editSqlSchema;
        content.seedData = editSqlSeed;
        content.expectedQuery = editSqlExpectedQuery;
      } else if (editingQuestion.moduleType === "NOSQL") {
        content.collections = editNosqlCollections.split(",").map((c) => c.trim()).filter(Boolean);
        content.allowedOperations = editNosqlAllowedOps;
        content.validatorType = editNosqlValidatorType;
        if (editNosqlExpectedOp.trim()) {
          try {
            content.expectedOperation = JSON.parse(editNosqlExpectedOp);
          } catch {
            toast.error("Invalid Expected Operation JSON format");
            return;
          }
        }
        content.datasetRef = editNosqlDatasetRef;
      } else if (editingQuestion.moduleType === "CODING" || editingQuestion.moduleType === "DEBUGGING") {
        content.starterCode = editStarterCode;
        if (editTestCasesInput.trim()) {
          try {
            content.testCases = JSON.parse(editTestCasesInput);
          } catch {
            toast.error("Invalid Test Cases JSON format");
            return;
          }
        }
      } else if (editingQuestion.moduleType === "AI_PROMPTING") {
        content.context = editAiSystemContext;
        content.techStack = editAiTechStack;
        content.idealResponseSummary = editAiIdealResponse;
      } else if (editingQuestion.moduleType === "SIMULATION") {
        content.title = editPromptText;
        content.triggers = editSimTriggers ? JSON.parse(editSimTriggers) : [];
        content.rubric = editSimRubric ? JSON.parse(editSimRubric) : [];
      }

      await updateQuestion(editingQuestion.id, {
        ...editingQuestion,
        difficulty: editDifficulty,
        targetLevel: editTargetLevel,
        tags: editTagsInput.split(",").map((t) => t.trim()).filter(Boolean),
        role: editRole,
        content,
      });
      toast.success("Question updated successfully");
      setEditingQuestion(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to update question");
    }
  };

  const handleCreate = async () => {
    const content: any = { prompt: promptText };
    const scoringConfig: any = {};

    try {
      if (moduleType === "MCQ") {
        content.options = mcqOptions.filter((o) => o.trim());
        if (content.options.length < 2) {
          toast.error("Please provide at least 2 options");
          return;
        }
        scoringConfig.correctIndex = correctIndex;
      } else if (moduleType === "SQL") {
        content.schema = sqlSchema;
        content.seedData = sqlSeed;
        content.expectedQuery = sqlExpectedQuery;
      } else if (moduleType === "NOSQL") {
        content.collections = nosqlCollections.split(",").map((c) => c.trim()).filter(Boolean);
        content.allowedOperations = nosqlAllowedOps;
        content.validatorType = nosqlValidatorType;
        if (nosqlExpectedOp.trim()) {
          try {
            content.expectedOperation = JSON.parse(nosqlExpectedOp);
          } catch {
            toast.error("Invalid Expected Operation JSON format");
            return;
          }
        }
        content.datasetRef = nosqlDatasetRef;
      } else if (moduleType === "CODING" || moduleType === "DEBUGGING") {
        content.starterCode = starterCode;
        content.testCases = testCasesInput ? JSON.parse(testCasesInput) : [];
      } else if (moduleType === "AI_PROMPTING") {
        content.context = aiSystemContext;
        content.techStack = aiTechStack;
        content.idealResponseSummary = aiIdealResponse;
      } else if (moduleType === "SIMULATION") {
        content.title = promptText;
        content.triggers = simTriggers ? JSON.parse(simTriggers) : [];
        content.rubric = simRubric ? JSON.parse(simRubric) : [];
      }

      await createQuestion({
        moduleType,
        content,
        scoringConfig,
        difficulty,
        targetLevel,
        role,
        tags: tagsInput
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      });

      setShowCreateModal(false);
      resetForm();
    } catch (err: any) {
      toast.error("Failed creating question: " + err.message);
    }
  };

  const resetForm = () => {
    setPromptText("");
    setTagsInput("");
    setRole("General");
    setMcqOptions(["", "", "", ""]);
    setCorrectIndex(0);
    setSqlSchema("");
    setSqlSeed("");
    setSqlExpectedQuery("");
    setNosqlCollections("");
    setNosqlAllowedOps([]);
    setNosqlValidatorType("OUTPUT_COMPARISON");
    setNosqlExpectedOp("");
    setNosqlDatasetRef("");
    setStarterCode("");
    setTestCasesInput("");
    setSimTriggers("");
    setSimRubric("");
    setAiSystemContext("");
    setAiTechStack("React/TypeScript");
    setAiIdealResponse("");
  };

  // CSV Parser Utility
  function parseCSV(text: string) {
    const lines = [];
    let row: string[] = [];
    let inQuotes = false;
    let val = "";
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      const next = text[i + 1];
      if (c === '"') {
        if (inQuotes && next === '"') {
          val += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c === "," && !inQuotes) {
        row.push(val.trim());
        val = "";
      } else if ((c === "\n" || c === "\r") && !inQuotes) {
        if (c === "\r" && next === "\n") i++;
        row.push(val.trim());
        if (row.length > 0 && row.some((x) => x)) {
          lines.push(row);
        }
        row = [];
        val = "";
      } else {
        val += c;
      }
    }
    if (val || row.length > 0) {
      row.push(val.trim());
      lines.push(row);
    }
    return lines;
  }

  // Dynamic CSV Template Download
  const handleDownloadSample = (mod: string) => {
    let headers = "";
    let sampleRow = "";
    if (mod === "MCQ") {
      headers = "prompt,difficulty,tags,role,targetLevel,option1,option2,option3,option4,correctIndex";
      sampleRow =
        '"What is the time complexity of binary search?",easy,"algorithms,binary search","Backend Engineer","0-1",O(n),O(log n),O(n log n),O(1),1';
    } else if (mod === "SQL") {
      headers = "prompt,difficulty,tags,role,targetLevel,schema,seedData";
      sampleRow =
        '"Select all employees from sales department",medium,"sql,databases","Data Engineer","2-5","CREATE TABLE employees (id SERIAL, name TEXT, department TEXT);","INSERT INTO employees (name, department) VALUES (\'John\', \'sales\');"';
    } else if (mod === "NOSQL") {
      headers = "prompt,difficulty,tags,role,targetLevel,collections,allowedOperations";
      sampleRow =
        '"Find all employees with salary over 50k",medium,"nosql,mongodb","Data Engineer","2-5","employees","find,aggregate"';
    } else if (mod === "CODING") {
      headers = "prompt,difficulty,tags,role,targetLevel,starterCode,testCasesJSON";
      sampleRow =
        '"Write a function to sum two numbers",easy,"basics,math","Backend Engineer","0-1","function sum(a, b) {\n  return a + b;\n}","[{\"input\": \"[1, 2]\", \"expected\": \"3\"}]"';
    } else if (mod === "AI_PROMPTING") {
      headers = "prompt,difficulty,tags,role,targetLevel,rubricJSON";
      sampleRow =
        '"Draft a prompt for an assistant to write professional emails",medium,"ai,prompting","AI Engineer","2-5","[{\\"criteria\\": \\"Tone\\", \\"maxScore\\": 5}]"';
    } else if (mod === "SIMULATION") {
      headers = "title,difficulty,tags,role,targetLevel,triggersJSON,rubricJSON";
      sampleRow =
        '"Handle a production outage call with client",hard,"communication,outage","Full-stack Engineer","6-10","[{\\"timeSeconds\\": 15, \\"message\\": \\"Client is asking for ETA.\\"}]","[{\\"criteria\\": \\"Transparency\\", \\"maxScore\\": 10}]"';
    }
    const csvContent =
      "data:text/csv;charset=utf-8," + encodeURIComponent(headers + "\n" + sampleRow);
    const link = document.createElement("a");
    link.setAttribute("href", csvContent);
    link.setAttribute("download", `sample_${mod.toLowerCase()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImport = () => {
    if (!csvFile) {
      toast.error("Please select a CSV file first.");
      return;
    }
    const searchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
    const fromDriveId = searchParams.get("fromDriveId");
    const driveNameParam = searchParams.get("driveName");

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        const rows = parseCSV(text);
        if (rows.length < 2) {
          toast.error("The CSV file must contain at least a header row and one data row.");
          return;
        }
        const headers = rows[0].map((h) => h.toLowerCase());
        const parsedQuestions = [];

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (row.length === 0 || (row.length === 1 && !row[0])) continue;

          const getVal = (headerName: string) => {
            const idx = headers.indexOf(headerName.toLowerCase());
            return idx !== -1 ? row[idx] : "";
          };

          const difficulty = getVal("difficulty") || "medium";
          const targetLvl = getVal("targetlevel") || "0-1";
          const roleVal = getVal("role") || "General";
          const tags = (getVal("tags") || "")
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean);

          if (driveNameParam) {
            const driveTag = `Drive: ${driveNameParam}`;
            if (!tags.some((t) => t.toLowerCase() === driveTag.toLowerCase())) {
              tags.push(driveTag);
            }
          }

          const content: any = {};
          const scoringConfig: any = {};

          if (importModuleType === "MCQ") {
            content.prompt = getVal("prompt");
            const opt1 = getVal("option1");
            const opt2 = getVal("option2");
            const opt3 = getVal("option3");
            const opt4 = getVal("option4");
            content.options = [opt1, opt2, opt3, opt4].filter(Boolean);
            scoringConfig.correctIndex = parseInt(getVal("correctIndex")) || 0;
          } else if (importModuleType === "SQL") {
            content.prompt = getVal("prompt");
            content.schema = getVal("schema");
            content.seedData = getVal("seedData");
          } else if (importModuleType === "NOSQL") {
            content.prompt = getVal("prompt");
            content.collections = (getVal("collections") || "").split(",").map((c) => c.trim()).filter(Boolean);
            content.allowedOperations = (getVal("allowedoperations") || "").split(",").map((c) => c.trim()).filter(Boolean);
          } else if (importModuleType === "CODING") {
            content.prompt = getVal("prompt");
            content.starterCode = getVal("starterCode");
            const tcVal = getVal("testCasesJSON");
            const tcParsed = tcVal ? JSON.parse(tcVal) : [];
            content.testCases = tcParsed;
            content.visibleTestCases = tcParsed;
          } else if (importModuleType === "AI_PROMPTING") {
            content.prompt = getVal("prompt");
            const rub = getVal("rubricJSON");
            content.rubric = rub ? JSON.parse(rub) : [];
          } else if (importModuleType === "SIMULATION") {
            content.title = getVal("title") || getVal("prompt");
            const trig = getVal("triggersJSON");
            const rubricVal = getVal("rubricJSON");
            content.triggers = trig ? JSON.parse(trig) : [];
            content.rubric = rubricVal ? JSON.parse(rubricVal) : [];
          }

          parsedQuestions.push({
            difficulty,
            targetLevel: targetLvl,
            tags,
            role: roleVal,
            content,
            scoringConfig,
          });
        }

        const created = await bulkUploadQuestions(importModuleType, parsedQuestions);
        toast.success(`Successfully imported ${parsedQuestions.length} questions!`);
        setCsvFile(null);
        setShowImportModal(false);

        if (fromDriveId) {
          try {
            const driveDetail = await useStore.getState().fetchDriveDetail(fromDriveId);
            const existingIds = driveDetail.questionIds || [];
            const newIds = Array.isArray(created) ? created.map((q: any) => q.id) : [];
            const combinedIds = Array.from(new Set([...existingIds, ...newIds]));
            await useStore.getState().saveDriveQuestions(fromDriveId, combinedIds);
            toast.success(`Linked imported questions to drive. Redirecting back to Drive Config...`);
          } catch (e) {
            console.error("Auto linking questions to drive failed", e);
          }
          navigate({ to: `/drives/${fromDriveId}` as any });
        }
      } catch (err: any) {
        toast.error("CSV Import failed: " + err.message);
      }
    };
    reader.readAsText(csvFile);
  };

  return (
    <AppShell
      title="Question Bank"
      count={questions.length}
      actions={
        <div className="flex items-center gap-2">
          <select
            value={modFilter}
            onChange={(e) => setModFilter(e.target.value)}
            className="px-2.5 py-1.5 border border-[#E6E6EA] rounded-md bg-white text-[12px] text-[#5B5B64] font-medium focus:outline-none focus:border-[#2F5CFF]"
          >
            <option value="all">All Modules</option>
            <option value="MCQ">MCQ</option>
            <option value="SQL">SQL</option>
            <option value="NOSQL">NoSQL</option>
            <option value="CODING">Coding</option>
            <option value="DEBUGGING">Debugging</option>
            <option value="AI_PROMPTING">AI Prompting</option>
            <option value="SIMULATION">Context Simulation</option>
            <option value="TEST_SCENARIOS">Test Scenarios</option>
          </select>

          {/* Difficulty Filter */}
          <select
            value={diffFilter}
            onChange={(e) => setDiffFilter(e.target.value)}
            className="px-2.5 py-1.5 border border-[#E6E6EA] rounded-md bg-white text-[12px] text-[#5B5B64] font-medium focus:outline-none focus:border-[#2F5CFF]"
          >
            <option value="all">All Difficulties</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>

          {/* Target Level Filter */}
          <select
            value={targetLevelFilter}
            onChange={(e) => setTargetLevelFilter(e.target.value)}
            className="px-2.5 py-1.5 border border-[#E6E6EA] rounded-md bg-white text-[12px] text-[#5B5B64] font-medium focus:outline-none focus:border-[#2F5CFF]"
          >
            <option value="all">All Levels</option>
            <option value="0-1">0-1 yrs (Fresher)</option>
            <option value="2-5">2-5 yrs (Level 1)</option>
            <option value="6-10">6-10 yrs (Level 2)</option>
            <option value="11-15">11+ yrs (Level 3)</option>
          </select>

          {/* Department / Role Filter */}
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-2.5 py-1.5 border border-[#E6E6EA] rounded-md bg-white text-[12px] text-[#5B5B64] font-medium focus:outline-none focus:border-[#2F5CFF]"
          >
            <option value="all">All Roles / Depts</option>
            <option value="SOFTWARE_ENGINEERING">Software Engineering</option>
            <option value="DATA_ENGINEERING">Data Engineering</option>
            <option value="QA">QA</option>
            <option value="SRE">SRE</option>
            <option value="SYSOPS">SysOps</option>
            <option value="ITOPS">ITOps</option>
            <option value="PMO">PMO</option>
            <option value="SECOPS">SecOps</option>
            <option value="General">General</option>
          </select>

          <div className="relative group">
            <button
              className="flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium text-white bg-[#2F5CFF] hover:bg-[#0037FF] cursor-pointer shadow-sm transition-colors rounded-md"
            >
              <Plus size={14} /> Add Question
            </button>
            <div className="absolute right-0 top-full w-44 pt-1.5 z-50 hidden group-hover:block hover:block">
              <div className="bg-white border border-[#E6E6EA] rounded-lg shadow-lg py-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="w-full text-left px-4 py-2 text-[12px] text-[#0B0B0D] hover:bg-[#F7F7F9] hover:text-[#2F5CFF] font-medium transition-colors cursor-pointer"
                >
                  Create Manually
                </button>
                <button
                  onClick={() => setShowImportModal(true)}
                  className="w-full text-left px-4 py-2 text-[12px] text-[#0B0B0D] hover:bg-[#F7F7F9] hover:text-[#2F5CFF] font-medium transition-colors cursor-pointer"
                >
                  Bulk Import CSV
                </button>
              </div>
            </div>
          </div>
        </div>
      }
    >
      {/* Single-Click Return Banner if navigated from a Drive */}
      {(() => {
        if (typeof window === "undefined") return null;
        const params = new URLSearchParams(window.location.search);
        const driveId = params.get("driveId") || params.get("fromDrive");
        if (!driveId) return null;
        return (
          <div className="mb-4 p-3 bg-[#EAF0FF] border border-[#2F5CFF]/30 rounded-xl flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2.5 text-[#15308F] text-[13px] font-medium">
              <Sparkles size={16} className="text-[#2F5CFF]" />
              <span>You are currently managing questions for an active Drive.</span>
            </div>
            <Link
              to="/drives/$id"
              params={{ id: driveId }}
              search={{ tab: "questions" } as any}
              className="px-3.5 py-1.5 bg-[#2F5CFF] hover:bg-[#0037FF] text-white text-[12px] font-semibold rounded-lg shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft size={14} />
              <span>Return to Drive Questions</span>
            </Link>
          </div>
        );
      })()}

      {/* Tag Directory Navigation */}
      {query.trim() !== "" ? (
        /* Search results list */
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-[#E6E6EA] pb-3">
            <h3 className="text-[13px] font-semibold text-[#0B0B0D]">
              Search Results for "{query}" ({questions.length})
            </h3>
            <div className="flex items-center gap-3">
              <div className="relative w-[280px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9C9CA5] pointer-events-none" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search questions or tags…"
                  className="w-full pl-9 pr-8 py-1.5 text-[13px] border border-[#E6E6EA] rounded-md bg-white focus:outline-none focus:border-[#2F5CFF] shadow-2xs"
                />
                {query && (
                  <button
                    onClick={() => setQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9C9CA5] hover:text-[#0B0B0D] cursor-pointer"
                    title="Clear search"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
              <button
                onClick={() => setQuery("")}
                className="text-[11px] text-[#2F5CFF] hover:underline cursor-pointer whitespace-nowrap"
              >
                Clear search
              </button>
            </div>
          </div>
          <div className="space-y-3">
            {questions.length === 0 ? (
              <div className="text-center py-12 bg-white border border-[#E6E6EA] rounded-xl p-8 space-y-3">
                <p className="text-[13px] text-[#8B8B93] font-mono">
                  No questions found matching "<strong className="text-[#0B0B0D]">{query}</strong>".
                </p>
                <button
                  onClick={() => setQuery("")}
                  className="px-3.5 py-1.5 bg-[#F7F7F9] hover:bg-[#EFF0F3] text-[#0B0B0D] text-[12px] font-medium rounded-lg border border-[#E6E6EA] cursor-pointer transition-colors"
                >
                  Clear Search Filter
                </button>
              </div>
            ) : (
              questions.map((q) => (
                <div
                  key={q.id}
                  className="bg-white border border-[#E6E6EA] rounded-[10px] p-4 shadow-sm hover:border-[#D6D7DC] transition-colors flex items-start justify-between"
                >
                  <div className="space-y-1.5 flex-1 min-w-0 pr-4">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-[#EFF0F3] text-[#5B5B64] font-mono text-[10px] uppercase font-semibold">
                        {q.moduleType}
                      </span>
                      <span className="text-[10px] text-[#8B8B93] font-mono">v{q.version}</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono capitalize ${
                          q.difficulty === "easy"
                            ? "bg-emerald-50 text-emerald-700"
                            : q.difficulty === "medium"
                              ? "bg-amber-50 text-amber-700"
                              : "bg-rose-50 text-rose-700"
                        }`}
                      >
                        {q.difficulty}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-[#EAF0FF] text-[#15308F] text-[10px] font-medium">
                        Role: {q.role || "General"}
                      </span>
                    </div>
                    <h4 className="text-[13px] font-medium text-[#0B0B0D] line-clamp-2">
                      {q.content?.prompt || q.content?.title || "Simulation Scenario"}
                    </h4>
                    {q.tags && q.tags.length > 0 && (() => {
                      const { displayTags, hiddenDriveCount } = processQuestionTags(q.tags, q.moduleType);
                      return (
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          {displayTags.map((tag) => (
                            <span
                              key={tag}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-[#E6E6EA] text-[10px] text-[#5B5B64] font-mono"
                            >
                              <Tag size={8} />
                              {tag}
                            </span>
                          ))}
                          {hiddenDriveCount > 0 && (
                            <span className="text-[10px] text-[#2F5CFF] bg-[#EAF0FF] px-2 py-0.5 rounded-full font-semibold">
                              +{hiddenDriveCount} more drives
                            </span>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                  <div className="flex items-center gap-6 shrink-0">
                    <div className="text-center font-mono">
                      <div className="text-[13px] font-semibold text-[#0B0B0D]">{q.usageCount}</div>
                      <div className="text-[9px] uppercase tracking-wider text-[#8B8B93]">Drives</div>
                    </div>
                    <div className="text-center font-mono">
                      <div className="text-[13px] font-semibold text-[#0B0B0D]">
                        {q.avgScore !== null ? `${q.avgScore}%` : "—"}
                      </div>
                      <div className="text-[9px] uppercase tracking-wider text-[#8B8B93]">Avg Score</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenEdit(q)}
                        className="p-2 text-[#2F5CFF] hover:bg-[#EFF4FF] rounded transition-colors cursor-pointer"
                        title="Preview & Edit"
                      >
                        <Edit3 size={14} />
                      </button>
                      <button
                        onClick={() => setConfirmArchiveQuestion(q)}
                        className="p-2 text-[#EF4444] hover:bg-[#FEF2F2] rounded transition-colors cursor-pointer"
                        title="Archive"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : selectedFolder !== null ? (
        /* Inside a folder */
        (() => {
          const currentSection = classifyTag(selectedFolder);
          const { title: displayTitle } = formatTagDisplayName(selectedFolder, currentSection);
          const allFolderQuestions = groupedQuestions[selectedFolder] || [];
          const currentList = folderQuery.trim()
            ? allFolderQuestions.filter((q) => {
                const fq = folderQuery.toLowerCase().trim();
                const prompt = (q.content?.prompt || q.content?.title || "").toLowerCase();
                const tags = (q.tags || []).join(" ").toLowerCase();
                const role = (q.role || "").toLowerCase();
                const diff = (q.difficulty || "").toLowerCase();
                const mod = (q.moduleType || "").toLowerCase();
                return prompt.includes(fq) || tags.includes(fq) || role.includes(fq) || diff.includes(fq) || mod.includes(fq);
              })
            : allFolderQuestions;

          return (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-[#E6E6EA] pb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => {
                      setSelectedFolder(null);
                      setFolderQuery("");
                    }}
                    className="flex items-center gap-1 text-[12px] font-medium text-[#2F5CFF] hover:underline cursor-pointer"
                  >
                    <ArrowLeft size={13} /> Back to Repositories
                  </button>
                  <span className="text-[#8B8B93]">/</span>
                  <span className="text-[13px] font-semibold text-[#0B0B0D] capitalize flex items-center gap-1.5">
                    <Folder size={14} className="text-[#2F5CFF]" />
                    {displayTitle} ({allFolderQuestions.length})
                  </span>
                </div>
                <div className="relative w-[280px]">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9C9CA5] pointer-events-none" />
                  <input
                    value={folderQuery}
                    onChange={(e) => setFolderQuery(e.target.value)}
                    placeholder="Filter in this folder…"
                    className="w-full pl-9 pr-8 py-1.5 text-[13px] border border-[#E6E6EA] rounded-md bg-white focus:outline-none focus:border-[#2F5CFF] shadow-2xs"
                  />
                  {folderQuery && (
                    <button
                      onClick={() => setFolderQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9C9CA5] hover:text-[#0B0B0D] cursor-pointer"
                      title="Clear filter"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
              </div>
              <div className="space-y-3">
                {currentList.length === 0 ? (
                  <div className="text-center py-10 bg-white border border-[#E6E6EA] rounded-xl p-6 space-y-2">
                    <p className="text-[12px] text-[#8B8B93] font-mono">
                      No questions in this folder match "{folderQuery}".
                    </p>
                    <button
                      onClick={() => setFolderQuery("")}
                      className="text-[12px] text-[#2F5CFF] hover:underline cursor-pointer font-medium"
                    >
                      Clear Filter
                    </button>
                  </div>
                ) : (
                  currentList.map((q) => (
                    <div
                      key={q.id}
                      className="bg-white border border-[#E6E6EA] rounded-[10px] p-4 shadow-sm hover:border-[#D6D7DC] transition-colors flex items-start justify-between"
                    >
                      <div className="space-y-1.5 flex-1 min-w-0 pr-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 rounded bg-[#EFF0F3] text-[#5B5B64] font-mono text-[10px] uppercase font-semibold">
                            {q.moduleType}
                          </span>
                          <span className="text-[10px] text-[#8B8B93] font-mono">v{q.version}</span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono capitalize ${
                              q.difficulty === "easy"
                                ? "bg-emerald-50 text-emerald-700"
                                : q.difficulty === "medium"
                                  ? "bg-amber-50 text-amber-700"
                                  : "bg-rose-50 text-rose-700"
                            }`}
                          >
                            {q.difficulty}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-300 text-[10px] font-medium">
                            Level: {q.targetLevel || "All"}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-[#EAF0FF] text-[#15308F] text-[10px] font-medium">
                            Role: {q.role || "General"}
                          </span>
                        </div>
                        <h4 className="text-[13px] font-medium text-[#0B0B0D] line-clamp-2">
                          {q.content?.prompt || q.content?.title || "Simulation Scenario"}
                        </h4>
                        {q.tags && q.tags.length > 0 && (() => {
                          const { displayTags, hiddenDriveCount } = processQuestionTags(q.tags, q.moduleType);
                          return (
                            <div className="flex flex-wrap items-center gap-1.5 pt-1">
                              {displayTags.map((tag) => (
                                <span
                                  key={tag}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-[#E6E6EA] text-[10px] text-[#5B5B64] font-mono"
                                >
                                  <Tag size={8} />
                                  {tag}
                                </span>
                              ))}
                              {hiddenDriveCount > 0 && (
                                <span className="text-[10px] text-[#2F5CFF] bg-[#EAF0FF] px-2 py-0.5 rounded-full font-semibold">
                                  +{hiddenDriveCount} more drives
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                      <div className="flex items-center gap-6 shrink-0">
                        <div className="text-center font-mono">
                          <div className="text-[13px] font-semibold text-[#0B0B0D]">{q.usageCount}</div>
                          <div className="text-[9px] uppercase tracking-wider text-[#8B8B93]">Drives</div>
                        </div>
                        <div className="text-center font-mono">
                          <div className="text-[13px] font-semibold text-[#0B0B0D]">
                            {q.avgScore !== null ? `${q.avgScore}%` : "—"}
                          </div>
                          <div className="text-[9px] uppercase tracking-wider text-[#8B8B93]">Avg Score</div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleOpenEdit(q)}
                            className="p-2 text-[#2F5CFF] hover:bg-[#EFF4FF] rounded transition-colors cursor-pointer"
                            title="Preview & Edit"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            onClick={() => setConfirmArchiveQuestion(q)}
                            className="p-2 text-[#EF4444] hover:bg-[#FEF2F2] rounded transition-colors cursor-pointer"
                            title="Archive"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })()
      ) : (
        /* Categorized Folder Grid directory list */
        <div className="space-y-6">
          {/* Header Bar */}
          <div className="flex items-center justify-between border-b border-[#E6E6EA] pb-3">
            <div>
              <h3 className="text-[14px] font-semibold text-[#0B0B0D]">Question Repositories</h3>
              <p className="text-[12px] text-[#5B5B64] mt-0.5">
                Browse questions organized by module format, seniority level, topic domains, and drive batches.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-[#8B8B93] font-mono whitespace-nowrap bg-[#F7F7F9] px-2.5 py-1 rounded-md border border-[#E6E6EA]">
                {Object.keys(groupedQuestions).length} total tags
              </span>
              <div className="relative w-[260px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9C9CA5] pointer-events-none" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search questions or tags…"
                  className="w-full pl-9 pr-8 py-1.5 text-[12px] border border-[#E6E6EA] rounded-md bg-white focus:outline-none focus:border-[#2F5CFF] shadow-2xs"
                />
                {query && (
                  <button
                    onClick={() => setQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9C9CA5] hover:text-[#0B0B0D] cursor-pointer"
                    title="Clear search"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Section 1: Module Types */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h4 className="text-[13px] font-semibold text-[#0B0B0D]">1. Module Types</h4>
                <span className="text-[11px] text-[#8B8B93] font-mono bg-[#F7F7F9] px-2 py-0.5 rounded-full border border-[#E6E6EA]">
                  {categorizedTagGroups.module.length} formats
                </span>
              </div>
            </div>
            {categorizedTagGroups.module.length === 0 ? (
              <p className="text-center py-4 text-[12px] text-[#8B8B93] font-mono border border-dashed border-[#E6E6EA] rounded-lg bg-white">
                No module categories found.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {categorizedTagGroups.module.map((item) => (
                  <div
                    key={item.tag}
                    onClick={() => setSelectedFolder(item.tag)}
                    className="p-3.5 bg-white border border-[#E6E6EA] rounded-xl shadow-2xs hover:border-[#2F5CFF] hover:shadow-xs transition-all cursor-pointer flex items-center justify-between group"
                  >
                    <div className="min-w-0 pr-2">
                      <h5 className="text-[13px] font-semibold text-[#0B0B0D] group-hover:text-[#2F5CFF] transition-colors truncate" title={item.title}>
                        {item.title}
                      </h5>
                      <p className="text-[11px] text-[#8B8B93] font-mono mt-0.5">
                        {item.questions.length} {item.questions.length === 1 ? "question" : "questions"}
                      </p>
                    </div>
                    <ChevronRight size={14} className="text-[#8B8B93] group-hover:text-[#2F5CFF] transition-colors shrink-0" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 2: Experience Levels */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h4 className="text-[13px] font-semibold text-[#0B0B0D]">2. Experience Levels</h4>
                <span className="text-[11px] text-[#8B8B93] font-mono bg-[#F7F7F9] px-2 py-0.5 rounded-full border border-[#E6E6EA]">
                  {categorizedTagGroups.level.length} levels
                </span>
              </div>
            </div>
            {categorizedTagGroups.level.length === 0 ? (
              <p className="text-center py-4 text-[12px] text-[#8B8B93] font-mono border border-dashed border-[#E6E6EA] rounded-lg bg-white">
                No level categories found.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {categorizedTagGroups.level.map((item) => (
                  <div
                    key={item.tag}
                    onClick={() => setSelectedFolder(item.tag)}
                    className="p-3.5 bg-white border border-[#E6E6EA] rounded-xl shadow-2xs hover:border-[#2F5CFF] hover:shadow-xs transition-all cursor-pointer flex items-center justify-between group"
                  >
                    <div className="min-w-0 pr-2">
                      <h5 className="text-[13px] font-semibold text-[#0B0B0D] group-hover:text-[#2F5CFF] transition-colors truncate" title={item.title}>
                        {item.title}
                      </h5>
                      <p className="text-[11px] text-[#8B8B93] font-mono mt-0.5">
                        {item.questions.length} {item.questions.length === 1 ? "question" : "questions"}
                      </p>
                    </div>
                    <ChevronRight size={14} className="text-[#8B8B93] group-hover:text-[#2F5CFF] transition-colors shrink-0" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 3: Topics */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h4 className="text-[13px] font-semibold text-[#0B0B0D]">3. Topics</h4>
                <span className="text-[11px] text-[#8B8B93] font-mono bg-[#F7F7F9] px-2 py-0.5 rounded-full border border-[#E6E6EA]">
                  {categorizedTagGroups.topic.length} topics
                </span>
              </div>

              {/* Domain Category Filter Tabs */}
              <div className="flex flex-wrap items-center gap-1.5 bg-[#F7F7F9] p-1 rounded-lg border border-[#E6E6EA]">
                {TOPIC_DOMAINS.map((domain) => {
                  const isActive = selectedTopicDomain === domain.id;
                  const count =
                    domain.id === "all"
                      ? categorizedTagGroups.topic.length
                      : categorizedTagGroups.topic.filter(
                          (t) => getTopicDomainId(t.title) === domain.id
                        ).length;

                  if (domain.id !== "all" && count === 0) return null;

                  return (
                    <button
                      key={domain.id}
                      onClick={() => setSelectedTopicDomain(domain.id)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                        isActive
                          ? "bg-white text-[#2F5CFF] shadow-2xs font-semibold"
                          : "text-[#5B5B64] hover:text-[#0B0B0D] hover:bg-white/60"
                      }`}
                    >
                      <span>{domain.label}</span>
                      <span
                        className={`px-1.5 py-0.2 text-[9px] font-mono rounded-full ${
                          isActive
                            ? "bg-[#EAF0FF] text-[#2F5CFF]"
                            : "bg-slate-200/60 text-[#5B5B64]"
                        }`}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {categorizedTagGroups.topic.length === 0 ? (
              <p className="text-center py-4 text-[12px] text-[#8B8B93] font-mono border border-dashed border-[#E6E6EA] rounded-lg bg-white">
                No topic tags found.
              </p>
            ) : (() => {
              const filteredTopics = categorizedTagGroups.topic.filter((item) => {
                if (selectedTopicDomain === "all") return true;
                return getTopicDomainId(item.title) === selectedTopicDomain;
              });

              if (filteredTopics.length === 0) {
                return (
                  <p className="text-center py-4 text-[12px] text-[#8B8B93] font-mono border border-dashed border-[#E6E6EA] rounded-lg bg-white">
                    No topics found in this category.
                  </p>
                );
              }

              return (
                <div className="flex flex-wrap gap-2.5 p-5 bg-white border border-[#E6E6EA] rounded-2xl shadow-2xs">
                  {filteredTopics.map((item) => (
                    <button
                      key={item.tag}
                      type="button"
                      onClick={() => setSelectedFolder(item.tag)}
                      className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-[#F7F7F9] hover:bg-[#EAF0FF] hover:text-[#2F5CFF] hover:border-[#B3C5FF] border border-[#E6E6EA] rounded-full text-[12px] font-medium text-[#0B0B0D] transition-all cursor-pointer group shadow-2xs hover:shadow-xs active:scale-98"
                      title={`${item.title} (${item.questions.length} questions)`}
                    >
                      <span className="group-hover:text-[#2F5CFF] transition-colors">{item.title}</span>
                      <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded-full bg-[#E6E6EA] group-hover:bg-[#2F5CFF] group-hover:text-white text-[#5B5B64] transition-colors">
                        {item.questions.length}
                      </span>
                    </button>
                  ))}
                </div>
              );
            })()}
          </div>

          {/* Section 4: Drives */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h4 className="text-[13px] font-semibold text-[#0B0B0D]">4. Drives</h4>
                <span className="text-[11px] text-[#8B8B93] font-mono bg-[#F7F7F9] px-2 py-0.5 rounded-full border border-[#E6E6EA]">
                  {categorizedTagGroups.drive.length} drive batches
                </span>
              </div>
            </div>
            {categorizedTagGroups.drive.length === 0 ? (
              <div className="text-center py-5 text-[12px] text-[#8B8B93] font-mono border border-dashed border-[#E6E6EA] rounded-xl bg-white">
                No drive-specific imported questions found. Questions imported during a Drive setup will appear here.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {categorizedTagGroups.drive.map((item) => (
                  <div
                    key={item.tag}
                    onClick={() => setSelectedFolder(item.tag)}
                    className="p-3.5 bg-white border border-[#E6E6EA] rounded-xl shadow-2xs hover:border-[#2F5CFF] hover:shadow-xs transition-all cursor-pointer flex items-center justify-between group"
                  >
                    <div className="min-w-0 pr-2">
                      <h5 className="text-[13px] font-semibold text-[#0B0B0D] group-hover:text-[#2F5CFF] transition-colors truncate" title={item.title}>
                        {item.title}
                      </h5>
                      <p className="text-[11px] text-[#8B8B93] font-mono mt-0.5">
                        {item.questions.length} {item.questions.length === 1 ? "question" : "questions"}
                      </p>
                    </div>
                    <ChevronRight size={14} className="text-[#8B8B93] group-hover:text-[#2F5CFF] transition-colors shrink-0" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Creation Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[12px] w-full max-w-[580px] shadow-2xl flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-[#E6E6EA] flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-[#0B0B0D]">
                Create Assessment Question
              </h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-[#8B8B93] hover:text-[#0B0B0D]"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                    Module Type
                  </label>
                  <select
                    value={moduleType}
                    onChange={(e) => setModuleType(e.target.value)}
                    className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[13px]"
                  >
                    <option value="MCQ">MCQ</option>
                    <option value="SQL">SQL</option>
                    <option value="NOSQL">NoSQL Queries</option>
                    <option value="CODING">Coding / DSA</option>
                    <option value="DEBUGGING">Debugging</option>
                    <option value="AI_PROMPTING">AI Prompting</option>
                    <option value="SIMULATION">Contextual Simulation</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                    Difficulty
                  </label>
                  <select
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value)}
                    className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[13px]"
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                    Target Level
                  </label>
                  <select
                    value={targetLevel}
                    onChange={(e) => setTargetLevel(e.target.value)}
                    className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[13px]"
                  >
                    <option value="0-1">0-1 yrs (Fresher)</option>
                    <option value="2-5">2-5 yrs (Level 1)</option>
                    <option value="6-10">6-10 yrs (Level 2)</option>
                    <option value="11-15">11+ yrs (Level 3)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                    Target Role
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[13px]"
                  >
                    <option value="General">General</option>
                    <option value="Backend Engineer">Backend Engineer</option>
                    <option value="Full-stack Engineer">Full-stack Engineer</option>
                    <option value="Data Engineer">Data Engineer</option>
                    <option value="ML Engineer">ML Engineer</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                  Tags (comma separated)
                </label>
                <input
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="e.g. recursion, arrays, medium"
                  className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[13px]"
                />
              </div>

              <div>
                <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                  {moduleType === "SIMULATION" ? "Scenario Description" : "Question Prompt"}
                </label>
                <textarea
                  value={promptText}
                  onChange={(e) => setPromptText(e.target.value)}
                  rows={4}
                  placeholder={
                    moduleType === "SIMULATION"
                      ? "Describe the simulation roleplay scenario context..."
                      : "Enter the question prompt here..."
                  }
                  className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[13px] focus:outline-none focus:border-[#2F5CFF]"
                />
              </div>

              {/* MCQ Fields */}
              {moduleType === "MCQ" && (
                <div className="space-y-2">
                  <label className="block text-[12px] font-medium text-[#5B5B64]">
                    MCQ Options
                  </label>
                  {mcqOptions.map((opt, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="radio"
                        checked={correctIndex === i}
                        onChange={() => setCorrectIndex(i)}
                        className="w-4 h-4 text-[#2F5CFF]"
                      />
                      <input
                        value={opt}
                        onChange={(e) => {
                          const list = [...mcqOptions];
                          list[i] = e.target.value;
                          setMcqOptions(list);
                        }}
                        placeholder={`Option ${i + 1}`}
                        className="flex-1 px-3 py-1.5 border border-[#E6E6EA] rounded text-[13px]"
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* SQL Fields */}
              {moduleType === "SQL" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                      Schema Definition SQL
                    </label>
                    <textarea
                      value={sqlSchema}
                      onChange={(e) => setSqlSchema(e.target.value)}
                      rows={3}
                      placeholder="CREATE TABLE users (id SERIAL, name VARCHAR(100));"
                      className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[12px] font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                      Seed Data SQL
                    </label>
                    <textarea
                      value={sqlSeed}
                      onChange={(e) => setSqlSeed(e.target.value)}
                      rows={3}
                      placeholder="INSERT INTO users (name) VALUES ('Alice');"
                      className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[12px] font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                      Expected Query SQL (Used for validation)
                    </label>
                    <textarea
                      value={sqlExpectedQuery}
                      onChange={(e) => setSqlExpectedQuery(e.target.value)}
                      rows={3}
                      placeholder="SELECT * FROM users ORDER BY name;"
                      className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[12px] font-mono"
                    />
                  </div>
                </div>
              )}

              {/* NoSQL Fields */}
              {moduleType === "NOSQL" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                      Collections (comma-separated, e.g. employees, departments)
                    </label>
                    <input
                      type="text"
                      value={nosqlCollections}
                      onChange={(e) => setNosqlCollections(e.target.value)}
                      placeholder="employees, departments"
                      className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[13px]"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                      Allowed Operations
                    </label>
                    <div className="flex flex-wrap gap-2 p-2 border border-[#E6E6EA] rounded-md bg-white">
                      {["find", "aggregate", "insertOne", "insertMany", "updateOne", "updateMany", "deleteOne", "deleteMany", "countDocuments"].map((op) => (
                        <label key={op} className="flex items-center gap-1 text-[11px] font-mono cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={nosqlAllowedOps.includes(op)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setNosqlAllowedOps([...nosqlAllowedOps, op]);
                              } else {
                                setNosqlAllowedOps(nosqlAllowedOps.filter((x) => x !== op));
                              }
                            }}
                          />
                          {op}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                      Validator Type
                    </label>
                    <select
                      value={nosqlValidatorType}
                      onChange={(e) => setNosqlValidatorType(e.target.value)}
                      className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[13px]"
                    >
                      <option value="OUTPUT_COMPARISON">OUTPUT_COMPARISON</option>
                      <option value="STATE_COMPARISON">STATE_COMPARISON</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                      Dataset Reference Path (MinIO object key)
                    </label>
                    <input
                      type="text"
                      value={nosqlDatasetRef}
                      onChange={(e) => setNosqlDatasetRef(e.target.value)}
                      placeholder="datasets/employees-seed.json"
                      className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[13px]"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                      Expected Operation (JSON format)
                    </label>
                    <textarea
                      value={nosqlExpectedOp}
                      onChange={(e) => setNosqlExpectedOp(e.target.value)}
                      rows={4}
                      placeholder={JSON.stringify({ collection: "employees", operator: "find", payload: { filter: { salary: { $gt: 50000 } } } }, null, 2)}
                      className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[12px] font-mono"
                    />
                  </div>
                </div>
              )}

              {/* Coding & Debugging Fields */}
              {(moduleType === "CODING" || moduleType === "DEBUGGING") && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                      Starter Code
                    </label>
                    <div className="h-40 border border-[#E6E6EA] rounded-md overflow-hidden">
                      <CodeEditor
                        value={starterCode}
                        onChange={(val) => setStarterCode(val)}
                        language="javascript"
                        theme="light"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                      Test Cases JSON (Array of input/expected)
                    </label>
                    <textarea
                      value={testCasesInput}
                      onChange={(e) => setTestCasesInput(e.target.value)}
                      rows={3}
                      placeholder='[{"input": "[1, 2]", "expected": "3"}]'
                      className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[12px] font-mono"
                    />
                  </div>
                </div>
              )}

              {/* AI Prompting Fields */}
              {moduleType === "AI_PROMPTING" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                      Primary Technology / Stack Selection
                    </label>
                    <select
                      value={aiTechStack}
                      onChange={(e) => setAiTechStack(e.target.value)}
                      className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[13px]"
                    >
                      <option value="React/TypeScript">React / TypeScript</option>
                      <option value="Node.js/Express">Node.js / Express</option>
                      <option value="Python/FastAPI">Python / FastAPI</option>
                      <option value="SQL/PostgreSQL">SQL / PostgreSQL</option>
                      <option value="Docker/Kubernetes">Docker / Kubernetes</option>
                      <option value="AWS/Cloud Infrastructure">AWS / Cloud Infrastructure</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                      AI System Context / Role Guidelines
                    </label>
                    <textarea
                      value={aiSystemContext}
                      onChange={(e) => setAiSystemContext(e.target.value)}
                      rows={3}
                      placeholder="Specify system instructions for the LLM assistant (e.g. You are an expert code reviewer evaluating Express middleware request signatures...)"
                      className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[12px]"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                      Expected Response Criteria / Ideal Summary
                    </label>
                    <textarea
                      value={aiIdealResponse}
                      onChange={(e) => setAiIdealResponse(e.target.value)}
                      rows={3}
                      placeholder="Outline key elements that the student's prompt should instruct the LLM to cover (e.g., must include error handling, TypeScript types, edge cases)..."
                      className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[12px]"
                    />
                  </div>
                </div>
              )}

              {/* Simulation Fields */}
              {moduleType === "SIMULATION" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                      Triggers JSON Array
                    </label>
                    <textarea
                      value={simTriggers}
                      onChange={(e) => setSimTriggers(e.target.value)}
                      rows={3}
                      placeholder='[{"timeSeconds": 10, "message": "Can you refactor this?"}]'
                      className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[12px] font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                      Rubric Criteria JSON Array
                    </label>
                    <textarea
                      value={simRubric}
                      onChange={(e) => setSimRubric(e.target.value)}
                      rows={3}
                      placeholder='[{"criterion": "Code Quality", "maxPoints": 5}]'
                      className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[12px] font-mono"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-[#E6E6EA] flex justify-end gap-2 bg-[#F7F7F9] rounded-b-[12px]">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-3.5 py-2 text-[13px] border border-[#E6E6EA] rounded hover:bg-white transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                className="px-4 py-2 text-[13px] text-white bg-[#2F5CFF] rounded hover:bg-[#0037FF] transition-colors cursor-pointer shadow-sm"
              >
                Create Question
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[12px] w-full max-w-[580px] shadow-2xl flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-[#E6E6EA] flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-[#0B0B0D]">
                Bulk Upload Questions
              </h2>
              <button
                onClick={() => {
                  setCsvFile(null);
                  setShowImportModal(false);
                }}
                className="text-[#8B8B93] hover:text-[#0B0B0D]"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <p className="text-[12px] text-[#5B5B64]">
                Select a module category and download the matched template layout to begin importing questions.
              </p>

              <div>
                <label className="block text-[12px] font-medium text-[#5B5B64] mb-1.5">
                  Module Category
                </label>
                <select
                  value={importModuleType}
                  onChange={(e) => setImportModuleType(e.target.value)}
                  className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[13px] focus:outline-none"
                >
                  <option value="MCQ">Multiple Choice (MCQ)</option>
                  <option value="SQL">SQL Database Evaluation</option>
                  <option value="NOSQL">NoSQL Database Evaluation</option>
                  <option value="CODING">Coding &amp; Algorithms</option>
                  <option value="DEBUGGING">Debugging</option>
                  <option value="AI_PROMPTING">AI Prompting</option>
                  <option value="SIMULATION">Contextual Simulation</option>
                </select>
              </div>

              {/* Template Downloader section */}
              <div className="p-4 bg-[#F7F7F9] rounded-lg border border-[#E6E6EA] flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="text-[12px] font-semibold text-[#0B0B0D]">CSV Template Ready</div>
                  <div className="text-[11px] text-[#8B8B93]">
                    Matches layout header schema precisely for {importModuleType}
                  </div>
                </div>
                <button
                  onClick={() => handleDownloadSample(importModuleType)}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-[#2F5CFF] text-[#2F5CFF] bg-white rounded hover:bg-[#2F5CFF] hover:text-white transition-all text-[12px] font-medium cursor-pointer shadow-sm"
                >
                  <Download size={13} />
                  Download template
                </button>
              </div>

              {/* Upload Area */}
              <div className="space-y-2">
                <label className="block text-[12px] font-medium text-[#5B5B64]">Select CSV File</label>
                <div className="border-2 border-dashed border-[#E6E6EA] rounded-lg p-6 flex flex-col items-center justify-center bg-[#FDFDFD] hover:bg-[#F9FBFD] transition-colors relative cursor-pointer">
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) setCsvFile(file);
                    }}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <UploadCloud size={32} className="text-[#8B8B93] mb-2" />
                  <span className="text-[12px] text-[#5B5B64] font-medium text-center px-4">
                    {csvFile ? csvFile.name : "Drag & drop your CSV file here, or click to browse"}
                  </span>
                  <span className="text-[10px] text-[#8B8B93] mt-1">Accepts .csv format</span>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-[#E6E6EA] flex justify-end gap-2 bg-[#F7F7F9] rounded-b-[12px]">
              <button
                onClick={() => {
                  setCsvFile(null);
                  setShowImportModal(false);
                }}
                className="px-3.5 py-2 text-[12px] border border-[#E6E6EA] rounded hover:bg-[#F7F7F9] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={!csvFile}
                className="flex items-center gap-1.5 px-4 py-2 text-[12px] font-semibold text-white bg-[#2F5CFF] rounded hover:bg-[#0037FF] disabled:bg-[#EFF0F3] disabled:text-[#8B8B93] disabled:cursor-not-allowed transition-colors shadow-sm cursor-pointer"
              >
                <Check size={14} />
                Import Questions
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview & Edit Modal */}
      {editingQuestion && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[12px] w-full max-w-[580px] shadow-2xl flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-[#E6E6EA] flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-[#0B0B0D]">
                Preview &amp; Edit Question (v{editingQuestion.version})
              </h2>
              <button
                onClick={() => setEditingQuestion(null)}
                className="text-[#8B8B93] hover:text-[#0B0B0D]"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                    Module Type (Read-Only)
                  </label>
                  <input
                    value={editingQuestion.moduleType}
                    disabled
                    className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-[#EFF0F3] text-[13px] text-[#5B5B64] cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                    Difficulty
                  </label>
                  <select
                    value={editDifficulty}
                    onChange={(e) => setEditDifficulty(e.target.value)}
                    className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[13px]"
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                    Target Level
                  </label>
                  <select
                    value={editTargetLevel}
                    onChange={(e) => setEditTargetLevel(e.target.value)}
                    className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[13px]"
                  >
                    <option value="0-1">0-1 yrs (Fresher)</option>
                    <option value="2-5">2-5 yrs (Level 1)</option>
                    <option value="6-10">6-10 yrs (Level 2)</option>
                    <option value="11-15">11+ yrs (Level 3)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                    Target Role
                  </label>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value)}
                    className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[13px]"
                  >
                    <option value="General">General</option>
                    <option value="Backend Engineer">Backend Engineer</option>
                    <option value="Full-stack Engineer">Full-stack Engineer</option>
                    <option value="Data Engineer">Data Engineer</option>
                    <option value="ML Engineer">ML Engineer</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                  Tags (comma separated)
                </label>
                <input
                  value={editTagsInput}
                  onChange={(e) => setEditTagsInput(e.target.value)}
                  placeholder="e.g. recursion, arrays, medium"
                  className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[13px]"
                />
              </div>

              <div>
                <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                  {editingQuestion.moduleType === "SIMULATION" ? "Scenario Description" : "Question Prompt"}
                </label>
                <textarea
                  value={editPromptText}
                  onChange={(e) => setEditPromptText(e.target.value)}
                  rows={4}
                  placeholder={
                    editingQuestion.moduleType === "SIMULATION"
                      ? "Describe the simulation roleplay scenario context..."
                      : "Enter the question prompt here..."
                  }
                  className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[13px] focus:outline-none focus:border-[#2F5CFF]"
                />
              </div>

              {/* MCQ Fields */}
              {editingQuestion.moduleType === "MCQ" && (
                <div className="space-y-2">
                  <label className="block text-[12px] font-medium text-[#5B5B64]">
                    MCQ Options
                  </label>
                  {editMcqOptions.map((opt, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="radio"
                        checked={editCorrectIndex === i}
                        onChange={() => setEditCorrectIndex(i)}
                        className="w-4 h-4 text-[#2F5CFF]"
                      />
                      <input
                        value={opt}
                        onChange={(e) => {
                          const list = [...editMcqOptions];
                          list[i] = e.target.value;
                          setEditMcqOptions(list);
                        }}
                        placeholder={`Option ${i + 1}`}
                        className="flex-1 px-3 py-1.5 border border-[#E6E6EA] rounded text-[13px]"
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* SQL Fields */}
              {editingQuestion.moduleType === "SQL" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                      Schema Definition SQL
                    </label>
                    <textarea
                      value={editSqlSchema}
                      onChange={(e) => setEditSqlSchema(e.target.value)}
                      rows={3}
                      placeholder="CREATE TABLE users (id SERIAL, name VARCHAR(100));"
                      className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[12px] font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                      Seed Data SQL
                    </label>
                    <textarea
                      value={editSqlSeed}
                      onChange={(e) => setEditSqlSeed(e.target.value)}
                      rows={3}
                      placeholder="INSERT INTO users (name) VALUES ('Alice');"
                      className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[12px] font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                      Expected Query SQL (Used for validation)
                    </label>
                    <textarea
                      value={editSqlExpectedQuery}
                      onChange={(e) => setEditSqlExpectedQuery(e.target.value)}
                      rows={3}
                      placeholder="SELECT * FROM users ORDER BY name;"
                      className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[12px] font-mono"
                    />
                  </div>
                </div>
              )}

              {/* NoSQL Fields */}
              {editingQuestion.moduleType === "NOSQL" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                      Collections (comma-separated, e.g. employees, departments)
                    </label>
                    <input
                      type="text"
                      value={editNosqlCollections}
                      onChange={(e) => setEditNosqlCollections(e.target.value)}
                      placeholder="employees, departments"
                      className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[13px]"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                      Allowed Operations
                    </label>
                    <div className="flex flex-wrap gap-2 p-2 border border-[#E6E6EA] rounded-md bg-white">
                      {["find", "aggregate", "insertOne", "insertMany", "updateOne", "updateMany", "deleteOne", "deleteMany", "countDocuments"].map((op) => (
                        <label key={op} className="flex items-center gap-1 text-[11px] font-mono cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={editNosqlAllowedOps.includes(op)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setEditNosqlAllowedOps([...editNosqlAllowedOps, op]);
                              } else {
                                setEditNosqlAllowedOps(editNosqlAllowedOps.filter((x) => x !== op));
                              }
                            }}
                          />
                          {op}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                      Validator Type
                    </label>
                    <select
                      value={editNosqlValidatorType}
                      onChange={(e) => setEditNosqlValidatorType(e.target.value)}
                      className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[13px]"
                    >
                      <option value="OUTPUT_COMPARISON">OUTPUT_COMPARISON</option>
                      <option value="STATE_COMPARISON">STATE_COMPARISON</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                      Dataset Reference Path (MinIO object key)
                    </label>
                    <input
                      type="text"
                      value={editNosqlDatasetRef}
                      onChange={(e) => setEditNosqlDatasetRef(e.target.value)}
                      placeholder="datasets/employees-seed.json"
                      className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[13px]"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                      Expected Operation (JSON format)
                    </label>
                    <textarea
                      value={editNosqlExpectedOp}
                      onChange={(e) => setEditNosqlExpectedOp(e.target.value)}
                      rows={4}
                      placeholder={JSON.stringify({ collection: "employees", operator: "find", payload: { filter: { salary: { $gt: 50000 } } } }, null, 2)}
                      className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[12px] font-mono"
                    />
                  </div>
                </div>
              )}

              {/* Coding & Debugging Fields */}
              {(editingQuestion.moduleType === "CODING" || editingQuestion.moduleType === "DEBUGGING") && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                      Starter Code
                    </label>
                    <div className="h-40 border border-[#E6E6EA] rounded-md overflow-hidden">
                      <CodeEditor
                        value={editStarterCode}
                        onChange={(val) => setEditStarterCode(val)}
                        language="javascript"
                        theme="light"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                      Test Cases JSON (Array of input/expected)
                    </label>
                    <textarea
                      value={editTestCasesInput}
                      onChange={(e) => setEditTestCasesInput(e.target.value)}
                      rows={3}
                      placeholder='[{"input": "[1, 2]", "expected": "3"}]'
                      className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[12px] font-mono"
                    />
                  </div>
                </div>
              )}

              {/* Simulation Fields */}
              {editingQuestion.moduleType === "SIMULATION" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                      Triggers JSON Array
                    </label>
                    <textarea
                      value={editSimTriggers}
                      onChange={(e) => setEditSimTriggers(e.target.value)}
                      rows={3}
                      placeholder='[{"timeSeconds": 10, "message": "Can you refactor this?"}]'
                      className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[12px] font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-[#5B5B64] mb-1">
                      Rubric Criteria JSON Array
                    </label>
                    <textarea
                      value={editSimRubric}
                      onChange={(e) => setEditSimRubric(e.target.value)}
                      rows={3}
                      placeholder='[{"criterion": "Code Quality", "maxPoints": 5}]'
                      className="w-full px-3 py-2 border border-[#E6E6EA] rounded-md bg-white text-[12px] font-mono"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-[#E6E6EA] flex justify-end gap-2 bg-[#F7F7F9] rounded-b-[12px]">
              <button
                onClick={() => setEditingQuestion(null)}
                className="px-3.5 py-2 text-[13px] border border-[#E6E6EA] rounded hover:bg-white transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdate}
                className="px-4 py-2 text-[13px] text-white bg-[#2F5CFF] rounded hover:bg-[#0037FF] transition-colors cursor-pointer shadow-sm"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Archive Question Confirmation Modal */}
      {confirmArchiveQuestion && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[12px] w-full max-w-[440px] shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3 border-b border-[#E6E6EA] pb-3">
              <div className="p-2 bg-red-50 text-red-500 rounded-full">
                <Trash2 size={18} />
              </div>
              <h3 className="text-[16px] font-semibold text-[#0B0B0D]">Archive Question?</h3>
            </div>
            
            <p className="text-[13px] text-[#5B5B64] leading-relaxed">
              Are you sure you want to archive this question? The question will be removed from active use and won't appear in new drive assignments.
            </p>

            <div className="flex justify-end gap-2.5 pt-2 text-[13px]">
              <button
                onClick={() => setConfirmArchiveQuestion(null)}
                className="px-3.5 py-2 border border-[#E6E6EA] rounded hover:bg-[#F7F7F9] text-[#5B5B64] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  archiveQuestion(confirmArchiveQuestion.id);
                  setConfirmArchiveQuestion(null);
                }}
                className="px-4 py-2 text-white bg-red-500 hover:bg-red-600 font-semibold cursor-pointer shadow-sm transition-colors rounded"
              >
                Archive Question
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Folder Confirmation Modal */}
      {confirmDeleteFolder && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[12px] w-full max-w-[440px] shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3 border-b border-[#E6E6EA] pb-3">
              <div className="p-2 bg-red-50 text-red-500 rounded-full">
                <Trash2 size={18} />
              </div>
              <h3 className="text-[16px] font-semibold text-[#0B0B0D]">Delete Question Folder?</h3>
            </div>
            
            <p className="text-[13px] text-[#5B5B64] leading-relaxed">
              Are you sure you want to delete the folder <strong className="text-[#0B0B0D]">"{confirmDeleteFolder}"</strong> containing{" "}
              <strong className="text-[#0B0B0D]">{groupedQuestions[confirmDeleteFolder]?.length || 0} questions</strong>? All questions in this repository will be archived.
            </p>

            <div className="flex justify-end gap-2.5 pt-2 text-[13px]">
              <button
                onClick={() => setConfirmDeleteFolder(null)}
                className="px-3.5 py-2 border border-[#E6E6EA] rounded hover:bg-[#F7F7F9] text-[#5B5B64] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const tag = confirmDeleteFolder;
                  const list = groupedQuestions[tag] || [];
                  try {
                    for (const q of list) {
                      await archiveQuestion(q.id);
                    }
                    toast.success(`Deleted folder "${tag}" and archived ${list.length} questions`);
                    setConfirmDeleteFolder(null);
                  } catch (err: any) {
                    toast.error("Failed deleting folder: " + (err.message || err));
                  }
                }}
                className="px-4 py-2 text-white bg-red-600 hover:bg-red-700 font-semibold cursor-pointer shadow-sm transition-colors rounded"
              >
                Delete Folder &amp; Questions
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
