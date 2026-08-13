export type QuestionType = 'mcq' | 'sql' | 'coding' | 'prompting' | 'contextual'

export interface MCQOption {
  id: string
  text: string
}

export interface MCQQuestion {
  id: string
  moduleIndex: number
  type: 'mcq'
  text: string
  options: MCQOption[]
  allowMultiple: boolean
  correctIds: string[] // used by mock only, never shown to candidate
}

export interface SQLQuestion {
  id: string
  moduleIndex: number
  type: 'sql'
  text: string
  schema: string // DDL
  seed: string   // INSERT statements
  hint?: string
}

export interface CodingQuestion {
  id: string
  moduleIndex: number
  type: 'coding'
  title: string
  prompt?: string
  description: string
  starterCode: string | Record<string, string>
  language: string
  visibleTestCases: Array<{ input: string; expectedOutput: string; label: string }>
  hiddenTestCases?: Array<{ input: string; expectedOutput: string; label: string }>
}

export interface PromptingQuestion {
  id: string
  moduleIndex: number
  type: 'prompting'
  text: string
  systemContext: string
  suggestedResponse?: string
}

export interface ContextualQuestion {
  id: string
  moduleIndex: number
  type: 'contextual'
  scenarioId: string
  instructions: string
}

export type Question = MCQQuestion | SQLQuestion | CodingQuestion | PromptingQuestion | ContextualQuestion

// ─── Module 1: MCQ ───────────────────────────────────────────────────────────
export const MCQ_QUESTIONS: MCQQuestion[] = [
  {
    id: 'mcq-1',
    moduleIndex: 0,
    type: 'mcq',
    text: 'Which of the following best describes the CAP theorem in distributed systems?',
    allowMultiple: false,
    options: [
      { id: 'a', text: 'A system can simultaneously guarantee Consistency, Availability, and Partition tolerance.' },
      { id: 'b', text: 'A distributed system can only provide two of three guarantees: Consistency, Availability, or Partition tolerance.' },
      { id: 'c', text: 'Partition tolerance is optional in modern cloud architectures.' },
      { id: 'd', text: 'Consistency and Availability are always mutually exclusive.' },
    ],
    correctIds: ['b'],
  },
  {
    id: 'mcq-2',
    moduleIndex: 0,
    type: 'mcq',
    text: 'Which of the following HTTP status codes indicate a client-side error? (Select all that apply)',
    allowMultiple: true,
    options: [
      { id: 'a', text: '200 OK' },
      { id: 'b', text: '400 Bad Request' },
      { id: 'c', text: '403 Forbidden' },
      { id: 'd', text: '500 Internal Server Error' },
      { id: 'e', text: '422 Unprocessable Entity' },
    ],
    correctIds: ['b', 'c', 'e'],
  },
  {
    id: 'mcq-3',
    moduleIndex: 0,
    type: 'mcq',
    text: 'What is the primary advantage of using an event-driven architecture over a request-response model for high-throughput systems?',
    allowMultiple: false,
    options: [
      { id: 'a', text: 'Simpler debugging and tracing.' },
      { id: 'b', text: 'Producers and consumers are temporally decoupled, enabling independent scaling.' },
      { id: 'c', text: 'Guaranteed exactly-once message delivery without additional configuration.' },
      { id: 'd', text: 'Lower latency for individual requests.' },
    ],
    correctIds: ['b'],
  },
]

// ─── Module 2: SQL ───────────────────────────────────────────────────────────
export const SQL_QUESTIONS: SQLQuestion[] = [
  {
    id: 'sql-1',
    moduleIndex: 1,
    type: 'sql',
    text: `You have a database for a small e-commerce platform. Write a query that returns the top 3 customers by total order value, showing their name, email, and total spend. Only include customers who have placed at least 2 orders.`,
    schema: `
CREATE TABLE customers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL
);

CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE TABLE order_items (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id)
);
    `.trim(),
    seed: `
INSERT INTO customers VALUES (1, 'Alice Chen', 'alice@example.com');
INSERT INTO customers VALUES (2, 'Bob Okafor', 'bob@example.com');
INSERT INTO customers VALUES (3, 'Carol Díaz', 'carol@example.com');
INSERT INTO customers VALUES (4, 'David Kim', 'david@example.com');

INSERT INTO orders VALUES (1, 1, 320.00, '2024-01-10');
INSERT INTO orders VALUES (2, 1, 150.00, '2024-01-20');
INSERT INTO orders VALUES (3, 2, 500.00, '2024-02-01');
INSERT INTO orders VALUES (4, 2, 200.00, '2024-02-15');
INSERT INTO orders VALUES (5, 2, 100.00, '2024-02-20');
INSERT INTO orders VALUES (6, 3, 75.00, '2024-03-01');
INSERT INTO orders VALUES (7, 4, 1200.00, '2024-03-05');
INSERT INTO orders VALUES (8, 4, 300.00, '2024-03-10');

INSERT INTO order_items VALUES (1, 1, 'Widget A', 2, 100.00);
INSERT INTO order_items VALUES (2, 1, 'Widget B', 1, 120.00);
INSERT INTO order_items VALUES (3, 2, 'Widget C', 3, 50.00);
INSERT INTO order_items VALUES (4, 3, 'Gadget X', 1, 500.00);
INSERT INTO order_items VALUES (5, 4, 'Widget A', 4, 50.00);
    `.trim(),
    hint: 'Consider using GROUP BY with HAVING to filter by order count, then ORDER BY total spend.',
  },
  {
    id: 'sql-2',
    moduleIndex: 1,
    type: 'sql',
    text: `Using the same schema, write a query that finds all products (by name) that appear in more than one order, along with the total quantity sold across all orders. Order results by total quantity descending.`,
    schema: `
CREATE TABLE customers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL
);

CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE TABLE order_items (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id)
);
    `.trim(),
    seed: `
INSERT INTO customers VALUES (1, 'Alice Chen', 'alice@example.com');
INSERT INTO customers VALUES (2, 'Bob Okafor', 'bob@example.com');
INSERT INTO customers VALUES (3, 'Carol Díaz', 'carol@example.com');
INSERT INTO customers VALUES (4, 'David Kim', 'david@example.com');

INSERT INTO orders VALUES (1, 1, 320.00, '2024-01-10');
INSERT INTO orders VALUES (2, 1, 150.00, '2024-01-20');
INSERT INTO orders VALUES (3, 2, 500.00, '2024-02-01');
INSERT INTO orders VALUES (4, 2, 200.00, '2024-02-15');
INSERT INTO orders VALUES (5, 2, 100.00, '2024-02-20');
INSERT INTO orders VALUES (6, 3, 75.00, '2024-03-01');
INSERT INTO orders VALUES (7, 4, 1200.00, '2024-03-05');
INSERT INTO orders VALUES (8, 4, 300.00, '2024-03-10');

INSERT INTO order_items VALUES (1, 1, 'Widget A', 2, 100.00);
INSERT INTO order_items VALUES (2, 1, 'Widget B', 1, 120.00);
INSERT INTO order_items VALUES (3, 2, 'Widget C', 3, 50.00);
INSERT INTO order_items VALUES (4, 3, 'Gadget X', 1, 500.00);
INSERT INTO order_items VALUES (5, 4, 'Widget A', 4, 50.00);
    `.trim(),
  },
]

// ─── Module 3: Coding/DSA ─────────────────────────────────────────────────────
export const CODING_QUESTIONS: CodingQuestion[] = [
  {
    id: 'code-1',
    moduleIndex: 2,
    type: 'coding',
    title: 'Sum of Two Numbers',
    prompt: 'Write a program that reads two comma-separated numbers on each line from standard input (stdin) and prints their sum to standard output (stdout).',
    description: 'Write a program that reads two comma-separated numbers on each line from standard input (stdin) and prints their sum to standard output (stdout).',
    language: 'cpp',
    starterCode: {
      cpp: `#include <iostream>\n#include <string>\nusing namespace std;\n\nint sum(int a, int b) {\n    // Write your code here\n    return a + b;\n}\n\nint main() {\n    string line;\n    while (getline(cin, line)) {\n        if (line.empty()) continue;\n        size_t comma = line.find(',');\n        int a = stoi(line.substr(0, comma));\n        int b = stoi(line.substr(comma + 1));\n        cout << sum(a, b) << endl;\n    }\n    return 0;\n}`,
      python: `import sys\n\ndef sum(a: int, b: int) -> int:\n    # Write your code here\n    return a + b\n\nfor line in sys.stdin:\n    if not line.strip():\n        continue\n    parts = line.strip().split(',')\n    a = int(parts[0].strip())\n    b = int(parts[1].strip())\n    print(sum(a, b))`,
      javascript: `const fs = require('fs');\n\nfunction sum(a, b) {\n  // Write your code here\n  return a + b;\n}\n\nconst input = fs.readFileSync(0, 'utf-8').trim();\nif (input) {\n  const lines = input.split('\\n');\n  for (const line of lines) {\n    if (!line.trim()) continue;\n    const parts = line.trim().split(',');\n    const a = parseInt(parts[0].trim(), 10);\n    const b = parseInt(parts[1].trim(), 10);\n    console.log(sum(a, b));\n  }\n}`,
      java: `import java.util.Scanner;\n\npublic class Main {\n    public static int sum(int a, int b) {\n        // Write your code here\n        return a + b;\n    }\n\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        while (sc.hasNextLine()) {\n            String line = sc.nextLine();\n            if (line.trim().isEmpty()) continue;\n            String[] parts = line.split(\",\");\n            int a = Integer.parseInt(parts[0].trim());\n            int b = Integer.parseInt(parts[1].trim());\n            System.out.println(sum(a, b));\n        }\n    }\n}`
    },
    visibleTestCases: [
      { input: '1, 2', expectedOutput: '3', label: 'Example 1' },
      { input: '-1, 5', expectedOutput: '4', label: 'Example 2' },
    ],
    hiddenTestCases: [
      { input: '10, 20', expectedOutput: '30', label: 'Hidden Case 1' },
      { input: '100, 200', expectedOutput: '300', label: 'Hidden Case 2' },
    ],
  },
  {
    id: 'code-2',
    moduleIndex: 2,
    type: 'coding',
    title: 'Valid Parentheses',
    description: `Given a string \`s\` containing just the characters \`(\`, \`)\`, \`{\`, \`}\`, \`[\` and \`]\`, determine if the input string is valid.

An input string is valid if:
- Open brackets must be closed by the same type of brackets.
- Open brackets must be closed in the correct order.
- Every close bracket has a corresponding open bracket of the same type.`,
    language: 'python',
    starterCode: `def is_valid(s: str) -> bool:
    # Your solution here
    pass
`,
    visibleTestCases: [
      { input: 's="()"', expectedOutput: 'True', label: 'Simple valid' },
      { input: 's="()[]{}"', expectedOutput: 'True', label: 'Multiple types' },
      { input: 's="(]"', expectedOutput: 'False', label: 'Mismatched' },
    ],
  },
]

// ─── Module 4: AI Prompting ───────────────────────────────────────────────────
export const PROMPTING_QUESTIONS: PromptingQuestion[] = [
  {
    id: 'prompt-1',
    moduleIndex: 3,
    type: 'prompting',
    text: `You're helping a junior developer on your team who is struggling with understanding async/await in JavaScript. They've asked: "I keep getting undefined when I try to use the result of an async function. What am I doing wrong?"

Write a prompt to an AI assistant that would generate a genuinely helpful, clear explanation with a concrete example. Your prompt should be specific enough to get a high-quality, actionable response.`,
    systemContext: 'You are a technical mentor helping a junior developer understand JavaScript async patterns.',
    suggestedResponse: `Here's a clear explanation with a working example:\n\nThe issue is almost certainly that you're calling the async function without \`await\`. When you call an async function, it immediately returns a **Promise**, not the resolved value.\n\n**The problem:**\n\`\`\`javascript\nasync function fetchUser() {\n  return { name: "Alice" };\n}\n\nconst user = fetchUser(); // ❌ user is a Promise, not { name: "Alice" }\nconsole.log(user.name); // undefined!\n\`\`\`\n\n**The fix — use await:**\n\`\`\`javascript\nasync function main() {\n  const user = await fetchUser(); // ✅ wait for the Promise to resolve\n  console.log(user.name); // "Alice"\n}\n\nmain();\n\`\`\`\n\n**Key rule:** You can only use \`await\` inside an \`async\` function (or at the top level of a module). Think of \`await\` as "pause here until this Promise resolves, then give me the value."`,
  },
  {
    id: 'prompt-2',
    moduleIndex: 3,
    type: 'prompting',
    text: `A product manager has sent you this requirement: "The dashboard should load faster." 

Write a prompt to an AI assistant that would help you break this vague requirement into concrete, measurable engineering tasks. Your prompt should guide the AI to produce output that's immediately actionable for a sprint planning session.`,
    systemContext: 'You are a senior engineer helping translate product requirements into technical tasks.',
    suggestedResponse: `**Actionable engineering tasks for dashboard performance:**\n\n**1. Baseline measurement (Day 1)**\n- Instrument with Core Web Vitals (LCP, FID, CLS)\n- Run Lighthouse audit, record current scores\n- Identify the 3 slowest network requests in DevTools\n\n**2. Quick wins (Sprint 1)**\n- Lazy-load below-the-fold chart components\n- Add HTTP cache headers to static assets (target: 1yr for hashed bundles)\n- Compress images to WebP, add \`width\`/\`height\` attrs to eliminate layout shift\n\n**3. Data fetching (Sprint 2)**\n- Identify N+1 queries in dashboard API calls\n- Add pagination or virtualization to any table with >100 rows\n- Cache expensive aggregation queries with a 5-minute TTL\n\n**4. Bundle size (Sprint 2)**\n- Run \`npm run build -- --analyze\` to find large dependencies\n- Replace moment.js with date-fns (saves ~200KB)\n\n**Measurable targets:** LCP < 2.5s, TTI < 3.5s on a mid-tier device on 4G.`,
  },
]

// ─── Module 5: Contextual Simulation ─────────────────────────────────────────
export const CONTEXTUAL_QUESTIONS: ContextualQuestion[] = [
  {
    id: 'ctx-1',
    moduleIndex: 4,
    type: 'contextual',
    scenarioId: 'api-incident',
    instructions: `You've just joined the on-call rotation. A production incident is developing. Respond to incoming messages as they arrive — you'll need to triage the issue, communicate clearly with stakeholders, and propose a path forward.

There is no single "correct" answer — assessors are evaluating your communication style, prioritization, and technical reasoning under pressure.`,
  },
  {
    id: 'ctx-2',
    moduleIndex: 4,
    type: 'contextual',
    scenarioId: 'feature-handoff',
    instructions: `You're taking over a feature from a colleague who is going on leave. A series of messages will arrive from different stakeholders. Respond appropriately to each, asking for clarification where needed and making decisions where you have enough context.`,
  },
]

export const ALL_QUESTIONS: Question[] = [
  ...MCQ_QUESTIONS,
  ...SQL_QUESTIONS,
  ...CODING_QUESTIONS,
  ...PROMPTING_QUESTIONS,
  ...CONTEXTUAL_QUESTIONS,
]

export const MODULES = [
  { index: 0, name: 'Multiple Choice', type: 'mcq' as const, suggestedMinutes: 15, questionIds: MCQ_QUESTIONS.map(q => q.id) },
  { index: 1, name: 'SQL', type: 'sql' as const, suggestedMinutes: 20, questionIds: SQL_QUESTIONS.map(q => q.id) },
  { index: 2, name: 'Coding & DSA', type: 'coding' as const, suggestedMinutes: 30, questionIds: CODING_QUESTIONS.map(q => q.id) },
  { index: 3, name: 'Debugging', type: 'debugging' as const, suggestedMinutes: 15, questionIds: [] },
  { index: 4, name: 'AI Prompting', type: 'prompting' as const, suggestedMinutes: 15, questionIds: PROMPTING_QUESTIONS.map(q => q.id) },
  { index: 5, name: 'Contextual Simulation', type: 'contextual' as const, suggestedMinutes: 20, questionIds: CONTEXTUAL_QUESTIONS.map(q => q.id) },
]

export const TOTAL_ASSESSMENT_MINUTES = MODULES.reduce((sum, m) => sum + m.suggestedMinutes, 0)
