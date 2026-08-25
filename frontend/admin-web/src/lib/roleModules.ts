export const ALL_MODULE_KEYS = [
  "MCQ",
  "SQL",
  "NOSQL",
  "CODING",
  "DEBUGGING",
  "AI_PROMPTING",
  "SIMULATION",
  "TEST_SCENARIOS",
] as const;

export type ModuleKey = (typeof ALL_MODULE_KEYS)[number];

export const MODULE_LABEL_MAP: Record<string, string> = {
  MCQ: "MCQ",
  SQL: "SQL",
  NOSQL: "NoSQL",
  CODING: "Coding",
  DEBUGGING: "Debugging",
  AI_PROMPTING: "AI Prompting",
  SIMULATION: "Context Simulation",
  TEST_SCENARIOS: "Test Scenarios",
};

export const DEPARTMENT_ALLOWED_MODULES: Record<string, string[]> = {
  SOFTWARE_ENGINEERING: ["MCQ", "SQL", "CODING", "DEBUGGING", "AI_PROMPTING", "SIMULATION", "TEST_SCENARIOS"],
  SDE: ["MCQ", "SQL", "CODING", "DEBUGGING", "AI_PROMPTING", "SIMULATION", "TEST_SCENARIOS"],
  DATA_ENGINEERING: ["MCQ", "SQL", "CODING"],
  QA: ["MCQ", "SQL", "CODING", "DEBUGGING", "TEST_SCENARIOS"],
  SRE: ["MCQ", "TEST_SCENARIOS"],
  SYSOPS: ["MCQ", "TEST_SCENARIOS"],
  ITOPS: ["MCQ", "TEST_SCENARIOS"],
  PMO: ["MCQ", "TEST_SCENARIOS"],
  SECOPS: ["MCQ", "TEST_SCENARIOS"],
};

export function getDepartmentAllowedModules(department?: string | null): string[] {
  if (!department) return [...ALL_MODULE_KEYS];
  const deptUpper = department.toUpperCase().trim();

  if (deptUpper.includes("SECOPS") || deptUpper.includes("SECURITY")) return DEPARTMENT_ALLOWED_MODULES.SECOPS;
  if (deptUpper.includes("DATA")) return DEPARTMENT_ALLOWED_MODULES.DATA_ENGINEERING;
  if (deptUpper.includes("QA") || deptUpper.includes("QUALITY") || deptUpper.includes("TEST")) return DEPARTMENT_ALLOWED_MODULES.QA;
  if (deptUpper.includes("SRE") || deptUpper.includes("RELIABILITY")) return DEPARTMENT_ALLOWED_MODULES.SRE;
  if (deptUpper.includes("SYSOPS")) return DEPARTMENT_ALLOWED_MODULES.SYSOPS;
  if (deptUpper.includes("ITOPS")) return DEPARTMENT_ALLOWED_MODULES.ITOPS;
  if (deptUpper.includes("PMO") || deptUpper.includes("PROJECT")) return DEPARTMENT_ALLOWED_MODULES.PMO;
  if (deptUpper.includes("SOFTWARE") || deptUpper.includes("SDE") || deptUpper.includes("DEVELOPER")) return DEPARTMENT_ALLOWED_MODULES.SOFTWARE_ENGINEERING;

  return DEPARTMENT_ALLOWED_MODULES[deptUpper] || [...ALL_MODULE_KEYS];
}
