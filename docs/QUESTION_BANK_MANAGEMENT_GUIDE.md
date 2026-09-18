# CD-Recruit Question Bank & Role Templates Management Guide

This guide details how to manage, validate, and replace the assessment Question Bank across all **32 Role Templates** and **8 Assessment Modules** with zero downtime and complete data integrity.

---

## 1. Architecture Overview

In CD-Recruit, questions are decoupled from live candidate assessment attempts using an immutable reference model:

```
                  ┌────────────────────────────────────────┐
                  │          Global Question Bank          │
                  │              (Question)                │
                  └──────────────────┬─────────────────────┘
                                     │
                 ┌───────────────────┴───────────────────┐
                 ▼                                       ▼
    ┌─────────────────────────┐             ┌─────────────────────────┐
    │   32 Role Templates     │             │    Scheduled Drives     │
    │ (RoleTemplateQuestion)  │             │     (DriveQuestion)     │
    └─────────────────────────┘             └─────────────────────────┘
                 │                                       │
                 ▼                                       ▼
    Default Blueprint for                   Pinned Question Pool for
    All 8 Departments x 4 Tiers             Candidate Sessions
```

### The 32 Role Templates Matrix
Role Templates represent 8 Departments across 4 Experience Tiers:
- **8 Departments**: `SOFTWARE_ENGINEERING`, `DATA_ENGINEERING`, `PMO`, `QA`, `SYSOPS`, `ITOPS`, `SECOPS`, `SRE`
- **4 Experience Tiers**:
  - `0-1` years: Fresher / Graduate
  - `2-5` years: Level 1 (L1)
  - `6-10` years: Level 2 (L2)
  - `11-15` years: Level 3 (L3)

### The 8 Assessment Modules
1. **MCQ**: Multiple-choice technical reasoning (8–10 questions per template)
2. **CODING**: Algorithmic problem solving with automated Judge0 test cases (2 questions)
3. **DEBUGGING**: Broken code snippets with logic/edge bugs to diagnose and fix (1 question)
4. **SQL**: Database querying against seeded schema with result set verification (2 questions)
5. **NOSQL**: Document and key-value store querying (1 question)
6. **AI_PROMPTING**: AI prompt engineering and prompt refinement tasks (1 question)
7. **SIMULATION**: Real-time contextual corporate crisis/workflow simulations (1 question)
8. **TEST_SCENARIOS**: QA and edge case design specifications (1 question)

---

## 2. Question Data Schemas

Questions can be organized into JSON files by module (e.g. `mcq.json`, `coding.json`, `sql.json`) or in a single consolidated folder.

### 2.1 MCQ (Multiple Choice)
```json
{
  "moduleType": "MCQ",
  "department": "SOFTWARE_ENGINEERING",
  "difficulty": "medium",
  "targetLevel": "2-5",
  "tags": ["software_engineering", "mcq", "l1", "data-structures"],
  "content": {
    "prompt": "Which data structure provides O(1) amortized insertion time and O(1) lookup time?",
    "options": [
      "Hash Table",
      "Binary Search Tree",
      "Array List",
      "Linked List"
    ],
    "correctAnswer": "Hash Table",
    "explanation": "A hash table with good hashing and dynamic rehashing achieves amortized O(1) complexity."
  },
  "scoringConfig": {
    "correctIndex": 0,
    "points": 2
  }
}
```

### 2.2 CODING (Judge0 Algorithmic Challenge)
```json
{
  "moduleType": "CODING",
  "department": "SOFTWARE_ENGINEERING",
  "difficulty": "medium",
  "targetLevel": "2-5",
  "tags": ["software_engineering", "coding", "l1", "arrays"],
  "content": {
    "title": "Two Sum Target",
    "prompt": "Given an array of integers and a target sum, return the 0-based indices of the two numbers that add up to target.",
    "functionName": "twoSum",
    "starterCode": {
      "python": "import sys, json\n\ndef twoSum(nums, target):\n    # TODO: Implement solution\n    return []\n\nif __name__ == '__main__':\n    data = json.loads(sys.stdin.read().strip())\n    print(json.dumps(twoSum(data['nums'], data['target'])))\n",
      "javascript": "const fs = require('fs');\n\nfunction twoSum(nums, target) {\n  // TODO: Implement solution\n  return [];\n}\n\nconst input = JSON.parse(fs.readFileSync(0, 'utf-8').trim());\nconsole.log(JSON.stringify(twoSum(input.nums, input.target)));\n"
    },
    "testCases": [
      {
        "input": "{\"nums\": [2, 7, 11, 15], \"target\": 9}",
        "expectedOutput": "[0, 1]",
        "isHidden": false
      },
      {
        "input": "{\"nums\": [3, 2, 4], \"target\": 6}",
        "expectedOutput": "[1, 2]",
        "isHidden": true
      }
    ]
  },
  "scoringConfig": {
    "points": 20
  }
}
```

### 2.3 DEBUGGING (Defect Diagnosis)
```json
{
  "moduleType": "DEBUGGING",
  "department": "SOFTWARE_ENGINEERING",
  "difficulty": "medium",
  "targetLevel": "2-5",
  "tags": ["software_engineering", "debugging", "l1", "off-by-one"],
  "content": {
    "title": "Off-by-One Binary Search Bug",
    "prompt": "The binary search implementation contains a boundary check defect causing infinite loops on missing elements. Correct the loop condition.",
    "buggyCode": "function binarySearch(arr, target) {\n  let left = 0;\n  let right = arr.length; // BUG: out of bounds\n  while (left <= right) {\n    let mid = Math.floor((left + right) / 2);\n    if (arr[mid] === target) return mid;\n    if (arr[mid] < target) left = mid;\n    else right = mid;\n  }\n  return -1;\n}",
    "testCases": [
      {
        "input": "{\"arr\": [1, 3, 5, 7, 9], \"target\": 5}",
        "expectedOutput": "2",
        "isHidden": false
      },
      {
        "input": "{\"arr\": [1, 3, 5, 7, 9], \"target\": 4}",
        "expectedOutput": "-1",
        "isHidden": true
      }
    ]
  },
  "scoringConfig": {
    "points": 10
  }
}
```

### 2.4 SQL (Query Execution)
```json
{
  "moduleType": "SQL",
  "department": "DATA_ENGINEERING",
  "difficulty": "medium",
  "targetLevel": "2-5",
  "tags": ["data_engineering", "sql", "l1", "aggregations"],
  "content": {
    "prompt": "Write a query to retrieve employees whose salary is above the average salary of their department.",
    "schema": "CREATE TABLE employees (id INT PRIMARY KEY, name VARCHAR(50), salary DECIMAL(10,2), dept_id INT);",
    "seedData": "INSERT INTO employees VALUES (1, 'Alice', 95000, 1), (2, 'Bob', 80000, 1), (3, 'Carol', 60000, 2);",
    "expectedQuery": "SELECT e.name FROM employees e WHERE e.salary > (SELECT AVG(sub.salary) FROM employees sub WHERE sub.dept_id = e.dept_id);",
    "explanation": "Correlated subquery filtering by department average."
  },
  "scoringConfig": {
    "points": 15
  }
}
```

### 2.5 SIMULATION (Contextual Workflow)
```json
{
  "moduleType": "SIMULATION",
  "department": "SOFTWARE_ENGINEERING",
  "difficulty": "hard",
  "targetLevel": "6-10",
  "tags": ["software_engineering", "simulation", "l2", "incident-management"],
  "content": {
    "title": "Production Outage: High Latency & Database Deadlocks",
    "description": "At 14:02 UTC, alert PagerDuty fired indicating 99th percentile API latency exceeded 12 seconds. Formulate an incident response, identify the locking query, and communicate updates.",
    "triggers": [
      {
        "type": "alert",
        "title": "CRITICAL: Database connection pool exhausted (98/100)",
        "timestamp": "2026-08-01T14:02:00Z"
      },
      {
        "type": "email",
        "from": "VP of Engineering",
        "subject": "Checkout service degraded - ETA?",
        "timestamp": "2026-08-01T14:05:00Z"
      }
    ],
    "rubric": [
      { "criterion": "Initial Triage & Communication", "weight": 0.25 },
      { "criterion": "Root Cause Identification", "weight": 0.50 },
      { "criterion": "Remediation & Post-Mortem Action", "weight": 0.25 }
    ]
  },
  "scoringConfig": {
    "points": 20
  }
}
```

---

## 3. Step-by-Step Production Replacement Workflow

Follow these steps to replace questions in staging or production:

### Step 1: Prepare Question Files
Place your high-quality question JSON files into a designated folder (e.g. `backend/prisma/data/` or a custom directory such as `production_questions/`).

### Step 2: Validate Questions (Pre-Flight Check)
Run the automated schema validator. It checks every question for missing fields, invalid types, and malformed Judge0 test cases:

```bash
# Validate default question folder (backend/prisma/data/)
npm run questions:validate

# Validate a custom question folder
npx tsx backend/prisma/scripts/validate-question-bank.ts --dir ./my-production-questions/
```

**Expected Output:**
```
🔍 Validating Question Bank from: .../backend/prisma/data
📂 Discovered 8 question files with 348 total question definitions.

=======================================================
📊 QUESTION BANK INVENTORY SUMMARY
=======================================================
Total Questions: 348
...
✅ ALL QUESTIONS PASSED VALIDATION! READY FOR PRODUCTION.
=======================================================
```
If any question has a syntax error or missing test case, the script pinpoints the file, question index, and field with an actionable error.

### Step 3: Run Dry-Run Replacement (Safety Simulation)
Run the replacement tool in `--dry-run` mode to preview what will happen **without modifying the database**:

```bash
# Preview replacement from default folder
npx tsx backend/prisma/scripts/replace-question-bank.ts --dry-run

# Preview replacement from custom folder
npx tsx backend/prisma/scripts/replace-question-bank.ts --dir ./my-production-questions/ --dry-run
```

### Step 4: Execute Live Atomic Replacement
Execute the live cutover. The script runs inside an ACID database transaction:
1. Detaches old questions from the 32 Role Templates.
2. Removes unpinned questions (while preserving questions pinned to existing Drives).
3. Ingests all new questions into the Question repository.
4. Auto-wires and balances all 32 Role Templates (8 departments x 4 seniority tiers).

```bash
# Live cutover with drive preservation (default)
npm run questions:replace

# Live cutover from custom directory
npx tsx backend/prisma/scripts/replace-question-bank.ts --dir ./my-production-questions/

# Live cutover with total wipe (replaces ALL questions including inactive drives)
npx tsx backend/prisma/scripts/replace-question-bank.ts --force-all
```

**Output:**
```
=======================================================
🚀 CD-RECRUIT QUESTION BANK CUTOVER & REPLACEMENT
Mode: ⚡ LIVE PRODUCTION UPDATE
Source Folder: ...
Preserve Drive-Pinned Questions: YES
=======================================================

  🧹 Detaching existing RoleTemplateQuestion links...
  🗑 Deleted 320 unpinned questions (preserved 28 drive questions).
  📥 Ingesting 350 questions into Question repository...
  ✔ Successfully ingested 350 questions.
  🔗 Auto-wiring questions to all 32 Role Templates...
  ✔ Linked 512 questions across 32 Role Templates.

=======================================================
🎉 QUESTION BANK REPLACEMENT COMPLETED SUCCESSFULLY!
=======================================================
```

---

## 4. Hosting & Deployment Checklist

When deploying to a hosted cloud environment (AWS, GCP, Railway, DigitalOcean):

- [ ] **Environment Variables**: Ensure `DATABASE_URL` is configured in your production environment.
- [ ] **Database Migrations**: Ensure `npm run db:migrate` has run to create all tables.
- [ ] **Run Pre-Flight Validation**: `npm run questions:validate` exits with code `0`.
- [ ] **Perform Cutover**: Run `npm run questions:replace`.
- [ ] **Verify in Admin Portal**:
  1. Open Admin Web -> **Question Bank** -> Confirm questions appear with correct module badges and difficulty tags.
  2. Open Admin Web -> **Assessment Modules** / **Role Templates** -> Confirm all 32 role templates show populated question pools.
  3. Create a test Drive -> Confirm questions are auto-selected and balanced across all modules.
