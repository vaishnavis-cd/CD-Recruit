/**
 * cd-recruit Unified CSV Parser & Strategy A Weight Calculator
 * Single-format, human-tolerant parsing for Direct Drive Question Ingestion
 */

export interface ParsedCSVQuestion {
  moduleType: string;
  difficulty: string;
  targetLevel: string;
  tags: string[];
  role: string;
  durationMinutes: number;
  points: number;
  content: Record<string, any>;
  scoringConfig: Record<string, any>;
}

export interface CSVParseResult {
  questions: ParsedCSVQuestion[];
  detectedModules: string[];
  totalDurationMinutes: number;
  totalPoints: number;
  modulePoints: Record<string, number>;
  moduleDurations: Record<string, number>;
  moduleWeights: Record<string, number>; // Strategy A normalized weights summing to 100
  errors: string[];
}

export const CSV_DEFAULT_TIME_MATRIX: Record<string, Record<string, number>> = {
  MCQ: { EASY: 1, MEDIUM: 2, HARD: 3 },
  SQL: { EASY: 3, MEDIUM: 6, HARD: 12 },
  CODING: { EASY: 6, MEDIUM: 12, HARD: 22 },
  DEBUGGING: { EASY: 5, MEDIUM: 10, HARD: 18 },
  TEST_SCENARIOS: { EASY: 3, MEDIUM: 6, HARD: 12 },
  AI_PROMPTING: { EASY: 4, MEDIUM: 7, HARD: 12 },
  SIMULATION: { EASY: 6, MEDIUM: 12, HARD: 22 },
  NOSQL: { EASY: 3, MEDIUM: 6, HARD: 12 },
};

/**
 * Standard CSV line-by-line parser supporting quoted strings with newlines and commas
 */
export function parseCSV(text: string): string[][] {
  const lines: string[][] = [];
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

/**
 * Parses pipe-separated or comma-separated lists into an array of strings
 */
export function parseDelimitedList(val: string): string[] {
  if (!val) return [];
  const trimmed = val.trim();
  if (trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed);
    } catch { }
  }
  if (val.includes("|")) {
    return val.split("|").map((s) => s.trim()).filter(Boolean);
  }
  return val.split(",").map((s) => s.trim()).filter(Boolean);
}

/**
 * Human-tolerant parser for unit test cases:
 * Accepts: "input: [2, 7], 9, expected: [0, 1] | input: [3, 2], 6, expected: [1, 2]"
 * Or raw JSON array
 */
export function parseTestCasesHuman(val: string): Array<{ input: string; expectedOutput: string; label: string }> {
  if (!val) return [];
  const trimmed = val.trim();
  if (trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed);
    } catch { }
  }

  const chunks = val.includes("|") ? val.split("|") : [val];
  const results: Array<{ input: string; expectedOutput: string; label: string }> = [];

  chunks.forEach((chunk, idx) => {
    const cTrim = chunk.trim();
    if (!cTrim) return;

    let input = "";
    let expectedOutput = "";
    let label = `Case ${idx + 1}`;

    const inputMatch = cTrim.match(/input:\s*(.+?)(?:,\s*expected(?:output)?:|$)/i);
    const expectedMatch = cTrim.match(/expected(?:output)?:\s*(.+?)(?:,\s*label:|$)/i);
    const labelMatch = cTrim.match(/label:\s*(.+?)$/i);

    if (inputMatch) input = inputMatch[1].trim();
    if (expectedMatch) expectedOutput = expectedMatch[1].trim();
    if (labelMatch) label = labelMatch[1].trim();

    if (!input && !expectedOutput) {
      input = cTrim;
    }

    results.push({ input, expectedOutput, label });
  });

  return results;
}

/**
 * Human-tolerant parser for Simulation multi-file codebases:
 * Accepts formatted blocks separated by ---:
 * [src/service.py]
 * # Read-only code
 * ---
 * [config/app.yaml]
 * port: 8080
 */
export function parseSupportingFilesHuman(val: string): Record<string, string> {
  if (!val) return {};
  const trimmed = val.trim();
  if (trimmed.startsWith("{")) {
    try {
      return JSON.parse(trimmed);
    } catch { }
  }

  const files: Record<string, string> = {};
  const blocks = val.split(/---+/);

  blocks.forEach((block) => {
    const match = block.match(/\[([a-zA-Z0-9_\-\.\/]+)\]([\s\S]*)/);
    if (match) {
      const filename = match[1].trim();
      const content = match[2].trim();
      files[filename] = content;
    }
  });

  return files;
}

/**
 * Human-tolerant parser for evaluation rubric:
 * Accepts "Root Cause: 30 | Code Fix: 40 | Unit Tests: 30"
 * Or JSON array
 */
export function parseRubricHuman(val: string): Array<{ criterion: string; weight: number; maxScore: number; description: string }> {
  if (!val) return [];
  const trimmed = val.trim();
  if (trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed);
    } catch { }
  }

  const items = val.includes("|") ? val.split("|") : [val];
  return items
    .map((item) => {
      const parts = item.split(":");
      if (parts.length >= 2) {
        const criterion = parts[0].trim();
        const weight = parseInt(parts[1].trim(), 10) || 10;
        return { criterion, weight, maxScore: weight, description: criterion };
      }
      return { criterion: item.trim(), weight: 10, maxScore: 10, description: item.trim() };
    })
    .filter((r) => r.criterion);
}

/**
 * Strategy A: Proportional Points Share with Integer Remainder Balancing
 * Guaranteed: sum(moduleWeights) === 100
 */
export function calculateStrategyAWeights(
  modulePoints: Record<string, number>,
  detectedModules: string[]
): Record<string, number> {
  const totalPoints = detectedModules.reduce((sum, m) => sum + (modulePoints[m] || 0), 0);
  const weights: Record<string, number> = {};

  if (detectedModules.length === 0) return weights;

  if (totalPoints === 0) {
    const base = Math.floor(100 / detectedModules.length);
    const rem = 100 - base * detectedModules.length;
    detectedModules.forEach((m, idx) => {
      weights[m] = base + (idx < rem ? 1 : 0);
    });
    return weights;
  }

  let runningSum = 0;
  const sorted = [...detectedModules].sort((a, b) => (modulePoints[b] || 0) - (modulePoints[a] || 0));

  detectedModules.forEach((m) => {
    const pts = modulePoints[m] || 0;
    const w = Math.max(1, Math.round((pts / totalPoints) * 100));
    weights[m] = w;
    runningSum += w;
  });

  const diff = 100 - runningSum;
  if (diff !== 0 && sorted.length > 0) {
    const topMod = sorted[0];
    weights[topMod] = Math.max(1, weights[topMod] + diff);
  }

  return weights;
}

/**
 * Core Parser: Transforms CSV text into validated questions, detected modules,
 * duration breakdown, and Strategy A normalized weights.
 */
export function parseQuestionsFromCSV(
  csvText: string,
  customTimeMatrix?: Record<string, Record<string, number>>,
  driveTag?: string
): CSVParseResult {
  const rows = parseCSV(csvText);
  const errors: string[] = [];

  if (rows.length < 2) {
    return {
      questions: [],
      detectedModules: [],
      totalDurationMinutes: 0,
      totalPoints: 0,
      modulePoints: {},
      moduleDurations: {},
      moduleWeights: {},
      errors: ["The CSV file must contain at least a header row and one question row."],
    };
  }

  const headers = rows[0].map((h) => h.toLowerCase().trim());
  const questions: ParsedCSVQuestion[] = [];
  const modulePoints: Record<string, number> = {};
  const moduleDurations: Record<string, number> = {};
  const detectedModulesSet = new Set<string>();

  const timeMatrix = customTimeMatrix || CSV_DEFAULT_TIME_MATRIX;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length === 0 || (row.length === 1 && !row[0])) continue;

    const getVal = (headerName: string) => {
      const idx = headers.indexOf(headerName.toLowerCase());
      return idx !== -1 ? row[idx] : "";
    };

    const rawModule = getVal("moduletype") || getVal("module") || "MCQ";
    const targetModuleType = rawModule.toUpperCase();
    const difficulty = (getVal("difficulty") || "medium").toLowerCase();
    const targetLvl = getVal("targetlevel") || "0-1";
    const roleVal = getVal("role") || "General";

    // Timing Hierarchy Precedence:
    // 1. Explicit CSV durationMinutes
    // 2. Settings timeMatrix fallback
    const rawDuration = getVal("durationminutes") || getVal("duration");
    let durationMinutes = rawDuration ? parseInt(rawDuration, 10) : 0;
    if (!durationMinutes || isNaN(durationMinutes) || durationMinutes <= 0) {
      const diffKey = difficulty.toUpperCase();
      const modTimes = timeMatrix[targetModuleType] || CSV_DEFAULT_TIME_MATRIX[targetModuleType] || { EASY: 5, MEDIUM: 5, HARD: 5 };
      durationMinutes = modTimes[diffKey] || modTimes.MEDIUM || 5;
    }

    // Points extraction
    const rawPoints = getVal("points") || getVal("score") || getVal("marks");
    let points = rawPoints ? parseFloat(rawPoints) : 0;
    if (!points || isNaN(points) || points <= 0) {
      points = difficulty === "hard" ? 3 : difficulty === "medium" ? 2 : 1;
    }

    // Tags
    const tags = parseDelimitedList(getVal("tags"));
    if (!tags.includes(targetModuleType.toLowerCase())) {
      tags.push(targetModuleType.toLowerCase());
    }
    if (driveTag && !tags.some((t) => t.toLowerCase() === driveTag.toLowerCase())) {
      tags.push(driveTag);
    }

    const content: any = {
      durationMinutes,
      points,
    };
    const scoringConfig: any = {
      points,
    };

    const prompt = getVal("prompt") || getVal("title") || getVal("question") || "Assessment Question";
    content.prompt = prompt;
    content.explanation = getVal("explanation") || "";

    if (targetModuleType === "MCQ") {
      let options: string[] = [];
      const rawOptions = getVal("options");
      if (rawOptions) {
        options = parseDelimitedList(rawOptions);
      }
      if (options.length === 0) {
        const opt1 = getVal("option1") || getVal("optiona");
        const opt2 = getVal("option2") || getVal("optionb");
        const opt3 = getVal("option3") || getVal("optionc");
        const opt4 = getVal("option4") || getVal("optiond");
        options = [opt1, opt2, opt3, opt4].filter(Boolean);
      }
      if (options.length === 0) {
        options = ["Option A", "Option B", "Option C", "Option D"];
      }
      content.options = options;

      const correctAns = getVal("correctanswer") || getVal("correctanswertext");
      const rawIdx = getVal("correctindex");
      let cIndex = rawIdx !== "" ? parseInt(rawIdx, 10) : 0;
      if (correctAns && options.indexOf(correctAns) >= 0) {
        cIndex = options.indexOf(correctAns);
      }
      content.correctAnswer = options[cIndex] || options[0];
      scoringConfig.correctIndex = cIndex;
      scoringConfig.correctAnswer = content.correctAnswer;
    } else if (targetModuleType === "SQL") {
      content.schema = getVal("schema") || "CREATE TABLE records (id SERIAL PRIMARY KEY, title TEXT);";
      content.seedData = getVal("seeddata") || "INSERT INTO records (title) VALUES ('Sample Record');";
      content.expectedQuery = getVal("expectedquery") || getVal("correctanswer") || "SELECT * FROM records;";
    } else if (targetModuleType === "NOSQL") {
      content.collections = parseDelimitedList(getVal("collections") || "documents");
      content.allowedOperations = parseDelimitedList(getVal("allowedoperations") || "find,aggregate");
      content.validatorType = getVal("validatortype") || "OUTPUT_COMPARISON";
      const expOp = getVal("expectedoperation") || getVal("seeddata");
      if (expOp) {
        try {
          content.expectedOperation = JSON.parse(expOp);
        } catch {
          content.expectedOperation = expOp;
        }
      }
    } else if (targetModuleType === "CODING" || targetModuleType === "DEBUGGING") {
      content.functionName = getVal("functionname") || "solution";
      content.parameters = getVal("parameters") || "";
      content.returnType = getVal("returntype") || "";
      content.language = getVal("language") || "javascript";
      content.starterCode = getVal("startercode") || "function solution() {\n  // Write your code here\n}";
      content.constraints = parseDelimitedList(getVal("constraints"));

      const sampleTcVal = getVal("sampletestcases") || getVal("visibletestcases") || getVal("testcasesjson");
      const hiddenTcVal = getVal("hiddentestcases");

      const visibleTestCases = parseTestCasesHuman(sampleTcVal);
      const hiddenTestCases = parseTestCasesHuman(hiddenTcVal);

      content.visibleTestCases = visibleTestCases;
      content.hiddenTestCases = hiddenTestCases;
      content.testCases = [
        ...visibleTestCases.map((tc: any) => ({ ...tc, isHidden: false })),
        ...hiddenTestCases.map((tc: any) => ({ ...tc, isHidden: true })),
      ];
    } else if (targetModuleType === "AI_PROMPTING") {
      const rub = getVal("rubric") || getVal("rubricjson") || getVal("sampletestcases");
      content.rubric = parseRubricHuman(rub);
      content.systemContext = getVal("systemcontext") || getVal("context") || "";
      content.techStack = getVal("techstack") || "React/TypeScript";
    } else if (targetModuleType === "SIMULATION") {
      content.title = prompt;
      content.starterCode = getVal("startercode") || "";
      content.supportingFiles = parseSupportingFilesHuman(getVal("supportingfiles"));
      content.readonlyFiles = Object.keys(content.supportingFiles);
      const trig = getVal("triggers") || getVal("triggersjson") || getVal("seeddata");
      content.triggers = parseDelimitedList(trig);
      const rub = getVal("rubric") || getVal("rubricjson");
      content.rubric = parseRubricHuman(rub);
      const sampleTcVal = getVal("sampletestcases") || getVal("visibletestcases");
      content.sampleTestCases = parseTestCasesHuman(sampleTcVal);
      content.testCases = content.sampleTestCases;
      content.language = getVal("language") || "python";
    } else if (targetModuleType === "TEST_SCENARIOS") {
      const scVal = getVal("sampletestcases") || getVal("testcases");
      content.testScenarios = parseTestCasesHuman(scVal);
      content.expectedAnswer = getVal("correctanswer") || getVal("expectedanswer") || "";
      const rub = getVal("rubric");
      if (rub) {
        content.rubric = parseRubricHuman(rub);
      }
    }

    questions.push({
      moduleType: targetModuleType,
      difficulty,
      targetLevel: targetLvl,
      tags,
      role: roleVal,
      durationMinutes,
      points,
      content,
      scoringConfig,
    });

    detectedModulesSet.add(targetModuleType);
    modulePoints[targetModuleType] = (modulePoints[targetModuleType] || 0) + points;
    moduleDurations[targetModuleType] = (moduleDurations[targetModuleType] || 0) + durationMinutes;
  }

  const detectedModules = Array.from(detectedModulesSet);
  const totalDurationMinutes = detectedModules.reduce((sum, m) => sum + (moduleDurations[m] || 0), 0);
  const totalPoints = detectedModules.reduce((sum, m) => sum + (modulePoints[m] || 0), 0);
  const moduleWeights = calculateStrategyAWeights(modulePoints, detectedModules);

  return {
    questions,
    detectedModules,
    totalDurationMinutes,
    totalPoints,
    modulePoints,
    moduleDurations,
    moduleWeights,
    errors,
  };
}

/**
 * Downloads the single unified multi-module 20-column CSV template
 */
export function downloadUnifiedSampleCSV(): void {
  const headers = [
    "moduleType",
    "prompt",
    "difficulty",
    "durationMinutes",
    "points",
    "tags",
    "role",
    "targetLevel",
    "options",
    "correctAnswer",
    "language",
    "parameters",
    "starterCode",
    "sampleTestCases",
    "hiddenTestCases",
    "schema",
    "seedData",
    "supportingFiles",
    "rubric",
    "explanation",
  ].join(",");

  const rows = [
    // 1. MCQ
    [
      "MCQ",
      '"What is the time complexity of searching in a balanced Binary Search Tree?"',
      "easy",
      "1",
      "1",
      '"algorithms,binary-search-tree,data-structures"',
      '"Backend Engineer"',
      '"0-1"',
      '"O(1) | O(log n) | O(n) | O(n log n)"',
      '"O(log n)"',
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      '"A balanced BST halves the search space at each step, yielding logarithmic search time."',
    ].join(","),

    // 2. SQL
    [
      "SQL",
      '"Retrieve the top 3 highest-earning employees in the Engineering department with their salary."',
      "medium",
      "6",
      "5",
      '"sql,joins,aggregates,analytics"',
      '"Data Engineer"',
      '"2-5"',
      "",
      '"SELECT e.name, e.salary FROM employees e JOIN departments d ON e.dept_id = d.id WHERE d.name = \'Engineering\' ORDER BY e.salary DESC LIMIT 3;"',
      "",
      "",
      "",
      "",
      "",
      '"CREATE TABLE departments (id INT PRIMARY KEY, name VARCHAR(50)); CREATE TABLE employees (id INT PRIMARY KEY, name VARCHAR(50), dept_id INT, salary NUMERIC);"',
      '"INSERT INTO departments VALUES (1, \'Engineering\'); INSERT INTO employees VALUES (1, \'Alice\', 1, 95000), (2, \'Bob\', 1, 105000), (3, \'Charlie\', 1, 88000), (4, \'Diana\', 1, 115000);"',
      "",
      "",
      '"Join employees and departments, filter by Engineering department name, order descending by salary, and limit to 3 records."',
    ].join(","),

    // 3. CODING
    [
      "CODING",
      '"Write a function twoSum(nums, target) that returns the indices of the two numbers such that they add up to target."',
      "easy",
      "8",
      "10",
      '"dsa,hash-map,arrays"',
      '"Backend Engineer"',
      '"0-1"',
      "",
      "",
      "javascript",
      '"nums: number[], target: number"',
      '"function twoSum(nums, target) {\\n  const map = new Map();\\n  for (let i = 0; i < nums.length; i++) {\\n    const diff = target - nums[i];\\n    if (map.has(diff)) return [map.get(diff), i];\\n    map.set(nums[i], i);\\n  }\\n  return [];\\n}"',
      '"input: [2, 7, 11, 15], 9, expected: [0, 1] | input: [3, 2, 4], 6, expected: [1, 2]"',
      '"input: [3, 3], 6, expected: [0, 1] | input: [-1, -2, -3, -4, -5], -8, expected: [2, 4]"',
      "",
      "",
      "",
      "",
      '"Use a Map to track visited number indices in O(n) single-pass lookup time."',
    ].join(","),

    // 4. DEBUGGING
    [
      "DEBUGGING",
      '"Fix off-by-one index error in binary search loop condition."',
      "medium",
      "10",
      "10",
      '"debugging,algorithms,search"',
      '"Software Engineer"',
      '"2-5"',
      "",
      "",
      "javascript",
      '"arr: number[], target: number"',
      '"function binarySearch(arr, target) {\\n  let left = 0;\\n  let right = arr.length; // BUG: should be arr.length - 1\\n  while (left <= right) {\\n    let mid = Math.floor((left + right) / 2);\\n    if (arr[mid] === target) return mid;\\n    if (arr[mid] < target) left = mid + 1;\\n    else right = mid - 1;\\n  }\\n  return -1;\\n}"',
      '"input: [1, 3, 5, 7, 9], 9, expected: 4"',
      '"input: [1, 3, 5], 2, expected: -1"',
      "",
      "",
      "",
      "",
      '"Ensure upper bound right is initialized to arr.length - 1 to prevent out of bounds inspection."',
    ].join(","),

    // 5. NOSQL
    [
      "NOSQL",
      '"Find all active customer accounts with a balance greater than 1000 and return name and balance."',
      "medium",
      "6",
      "5",
      '"nosql,mongodb,query"',
      '"Data Engineer"',
      '"2-5"',
      "",
      '"{ status: \'active\', balance: { $gt: 1000 } }"',
      "",
      "",
      "",
      "",
      "",
      "",
      '"{ name: \'Alice\', status: \'active\', balance: 1200 }, { name: \'Bob\', status: \'pending\', balance: 800 }"',
      "",
      "",
      '"Use MongoDB query filtering on status and $gt comparison operator on the balance field."',
    ].join(","),

    // 6. AI_PROMPTING
    [
      "AI_PROMPTING",
      '"Formulate a production-grade system prompt for an LLM coding assistant to review pull requests for concurrency hazards and race conditions."',
      "medium",
      "8",
      "10",
      '"ai,prompt-engineering,code-review"',
      '"AI/ML Engineer"',
      '"2-5"',
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      '"Precision & Specificity: 30 | Concurrency Flaw Identification: 40 | Formatting & Actionability: 30"',
      '"Prompt must instruct the LLM to verify atomic mutations, locks, mutex scopes, channel deadlocks, and idempotency."',
    ].join(","),

    // 7. SIMULATION
    [
      "SIMULATION",
      '"Triage and fix connection pool exhaustion during sudden traffic spikes in microservice"',
      "hard",
      "20",
      "25",
      '"architecture,distributed-systems,simulation"',
      '"Senior Backend Architect"',
      '"6-10"',
      "",
      "",
      "python",
      "",
      '"def acquire_connection():\\n    # Candidate modifies this connection acquire function\\n    pass"',
      '"input: acquire_connection, expected: success"',
      "",
      "",
      '"slack: Alert: PostgreSQL connection starvation on replica pool. | jira: INC-402: 500 errors spiking"',
      '"[src/db/pool_manager.py]\\n# Read-only lifecycle manager\\nclass PoolManager:\\n    pass\\n---\\n[config/database.yaml]\\npool_size: 10\\nmax_overflow: 5"',
      '"Root Cause Triage: 30 | Pool Resource Leak Fix: 40 | Regression Test Execution: 30"',
      '"Identify orphaned connections, unclosed cursors, and configure proper connection eviction timeouts."',
    ].join(","),

    // 8. TEST_SCENARIOS
    [
      "TEST_SCENARIOS",
      '"Design comprehensive integration test scenarios for an OAuth2 / OpenID Connect authorization code flow."',
      "medium",
      "12",
      "15",
      '"qa,testing,security,oauth2"',
      '"QA Engineer"',
      '"2-5"',
      "",
      "",
      "",
      "",
      "",
      '"scenario: Happy Path Token Exchange, expected: 200 OK | scenario: Expired Auth Code, expected: 400 Bad Request"',
      "",
      "",
      "",
      "",
      '"Security Edge Cases: 10 | Token Lifecycle Coverage: 10"',
      '"Validate authorization grants, token refresh, expired authorization codes, invalid client secrets, and PKCE verification."',
    ].join(","),
  ];

  const csvContent = "data:text/csv;charset=utf-8," + encodeURIComponent(headers + "\n" + rows.join("\n"));
  const link = document.createElement("a");
  link.setAttribute("href", csvContent);
  link.setAttribute("download", "cd_recruit_assessment_template.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
