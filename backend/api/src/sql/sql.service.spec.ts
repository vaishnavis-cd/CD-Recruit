import { SqlService } from "./sql.service";
import { SqlValidatorService } from "./sql-validator.service";
import { ResultComparatorService } from "./result-comparator.service";
import { SqlSandboxService } from "./sql-sandbox.service";
import { AssessmentEngineRegistry } from "../assessment/assessment-engine-registry.service";
import { ModuleType, SessionStatus, SqlExecutionStatus, SubmissionType } from "@cd-recruit/shared-types";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import assert from "node:assert";

async function runSqlSubsystemTests() {
  console.log("================================================================================");
  console.log("Running Characterization & Regression Tests for SQL Subsystem");
  console.log("================================================================================");

  let testPassed = 0;
  let testTotal = 0;

  function pass(msg: string) {
    testTotal++;
    testPassed++;
    console.log(`✅ PASS: ${msg}`);
  }

  const sqlExecutionsDb: any[] = [];
  const moduleResponsesDb: any[] = [];
  const sessionsDb: any[] = [
    {
      id: "sess-sql-1",
      status: SessionStatus.IN_PROGRESS,
      startedAt: new Date(),
    },
  ];
  const questionsDb: any[] = [
    {
      id: "q-sql-1",
      moduleType: ModuleType.SQL,
      questionType: "SELECT_ONLY",
      content: {
        prompt: "Find all active employees with salary > 50000",
        schema: "CREATE TABLE employees (id INT, name VARCHAR(50), salary INT, active BOOLEAN);",
        seedData: "INSERT INTO employees VALUES (1, 'Alice', 60000, true), (2, 'Bob', 40000, true);",
        expectedQuery: "SELECT id, name FROM employees WHERE salary > 50000 AND active = true;",
      },
    },
  ];

  const mockPrisma: any = {
    session: {
      findUnique: async ({ where }: any) => sessionsDb.find((s) => s.id === where.id) || null,
      update: async ({ where, data }: any) => {
        const item = sessionsDb.find((s) => s.id === where.id);
        if (item) Object.assign(item, data);
        return item;
      },
    },
    question: {
      findUnique: async ({ where }: any) => questionsDb.find((q) => q.id === where.id) || null,
    },
    sQLExecution: {
      create: async ({ data }: any) => {
        const record = { id: `sqlexec-${sqlExecutionsDb.length + 1}`, ...data };
        sqlExecutionsDb.push(record);
        return record;
      },
    },
    moduleResponse: {
      upsert: async ({ where, create, update }: any) => {
        let item = moduleResponsesDb.find(
          (m) => m.sessionId === where.sessionId_questionId?.sessionId && m.questionId === where.sessionId_questionId?.questionId,
        );
        if (item) {
          Object.assign(item, update);
        } else {
          item = { id: `mr-${moduleResponsesDb.length + 1}`, ...create };
          moduleResponsesDb.push(item);
        }
        return item;
      },
    },
  };

  const validatorService = new SqlValidatorService();
  const comparatorService = new ResultComparatorService();
  const mockSandboxService: any = {
    executeQuery: async ({ query }: any) => {
      // Mock execution results based on query
      if (query.includes("salary > 50000")) {
        return {
          queryResult: {
            columns: ["id", "name"],
            rows: [{ id: 1, name: "Alice" }],
            rowCount: 1,
          },
          executionTimeMs: 12,
          poolWaitTimeMs: 2,
        };
      }
      return {
        queryResult: {
          columns: ["id", "name"],
          rows: [
            { id: 1, name: "Alice" },
            { id: 2, name: "Bob" },
          ],
          rowCount: 2,
        },
        executionTimeMs: 15,
        poolWaitTimeMs: 2,
      };
    },
  };
  const engineRegistry = new AssessmentEngineRegistry();

  const service = new SqlService(
    mockPrisma,
    mockSandboxService,
    comparatorService,
    validatorService,
    engineRegistry,
  );

  // ---------------------------------------------------------------------------
  // TEST 1: AssessmentModuleEngine Dynamic Registration
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 1] Testing dynamic engine registration with AssessmentEngineRegistry...");

    assert.strictEqual(service.moduleType, ModuleType.SQL);
    service.onModuleInit();

    const registered = engineRegistry.getEngine(ModuleType.SQL);
    assert.strictEqual(registered, service, "SqlService must be registered in AssessmentEngineRegistry");
    pass("SqlService dynamically registers under AssessmentEngineRegistry on onModuleInit");
  }

  // ---------------------------------------------------------------------------
  // TEST 2: Static SQL Safety Gate (SqlValidatorService)
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 2] Testing SqlValidatorService fast-fail safety rules...");

    // 2.1 Valid SELECT passes
    assert.doesNotThrow(() => {
      validatorService.validateCandidateQuery("SELECT id, name FROM employees WHERE active = true;");
    });
    pass("Valid single SELECT query passes validator");

    // 2.2 Reject empty query
    assert.throws(
      () => validatorService.validateCandidateQuery("   "),
      BadRequestException,
      "Empty query must throw BadRequestException",
    );
    pass("Empty query throws BadRequestException");

    // 2.3 Reject multi-statement queries (SQL injection / statement stacking)
    assert.throws(
      () => validatorService.validateCandidateQuery("SELECT 1; DROP TABLE employees;"),
      BadRequestException,
      "Multi-statement query must throw BadRequestException",
    );
    pass("Multi-statement query is rejected by fast-fail validator");

    // 2.4 Reject non-SELECT/WITH queries for SELECT_ONLY questions
    assert.throws(
      () => validatorService.validateCandidateQuery("UPDATE employees SET salary = 100000;", "SELECT_ONLY"),
      BadRequestException,
      "DML queries must throw BadRequestException on SELECT_ONLY questions",
    );
    pass("Non-SELECT statement on SELECT_ONLY question is rejected");

    // 2.5 Reject forbidden system & administration functions
    assert.throws(
      () => validatorService.validateCandidateQuery("SELECT pg_sleep(10);"),
      BadRequestException,
      "pg_sleep call must throw BadRequestException",
    );
    assert.throws(
      () => validatorService.validateCandidateQuery("SELECT * FROM dblink('dbname=foo', 'SELECT 1');"),
      BadRequestException,
      "dblink call must throw BadRequestException",
    );
    pass("Disallowed administration functions (pg_sleep, dblink) are blocked");
  }

  // ---------------------------------------------------------------------------
  // TEST 3: ResultComparatorService Canonical Equivalence
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 3] Testing ResultComparatorService canonical SQL comparison...");

    // 3.1 Identical datasets match
    const cand1 = { columns: ["id", "name"], rows: [{ id: 1, name: "Alice" }], rowCount: 1 };
    const exp1 = { columns: ["id", "name"], rows: [{ id: 1, name: "Alice" }], rowCount: 1 };
    assert.strictEqual(comparatorService.compare(cand1, exp1), true);
    pass("Identical query results match");

    // 3.2 Order-insensitive row matching
    const cand2 = {
      columns: ["id", "name"],
      rows: [
        { id: 2, name: "Bob" },
        { id: 1, name: "Alice" },
      ],
      rowCount: 2,
    };
    const exp2 = {
      columns: ["id", "name"],
      rows: [
        { id: 1, name: "Alice" },
        { id: 2, name: "Bob" },
      ],
      rowCount: 2,
    };
    assert.strictEqual(comparatorService.compare(cand2, exp2), true);
    pass("Order-insensitive row permutations match");

    // 3.3 Case-insensitive column names
    const cand3 = { columns: ["ID", "Name"], rows: [{ id: 1, name: "Alice" }], rowCount: 1 };
    const exp3 = { columns: ["id", "name"], rows: [{ id: 1, name: "Alice" }], rowCount: 1 };
    assert.strictEqual(comparatorService.compare(cand3, exp3), true);
    pass("Case-insensitive column names match");

    // 3.4 Type normalization (numeric strings, ISO dates)
    const cand4 = { columns: ["val"], rows: [{ val: "100.0" }], rowCount: 1 };
    const exp4 = { columns: ["val"], rows: [{ val: 100 }], rowCount: 1 };
    assert.strictEqual(comparatorService.compare(cand4, exp4), true);
    pass("Numeric values and normalized representations match");

    // 3.5 Mismatch detection
    const cand5 = { columns: ["id", "name"], rows: [{ id: 1, name: "Alice" }], rowCount: 1 };
    const exp5 = { columns: ["id", "name"], rows: [{ id: 2, name: "Bob" }], rowCount: 1 };
    assert.strictEqual(comparatorService.compare(cand5, exp5), false);
    pass("Value mismatches correctly return false");
  }

  // ---------------------------------------------------------------------------
  // TEST 4: SqlService.run() Execution & Audit Persistence
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 4] Testing SqlService.run() execution and SQLExecution persistence...");

    const runRes = await service.run({
      sessionId: "sess-sql-1",
      questionId: "q-sql-1",
      query: "SELECT id, name FROM employees WHERE salary > 50000 AND active = true;",
    });

    assert.strictEqual(runRes.passed, true);
    assert.strictEqual(runRes.status, SqlExecutionStatus.COMPLETED);
    assert.strictEqual(runRes.resultRows, 1);
    assert(sqlExecutionsDb.some((e) => e.submissionType === SubmissionType.RUN && e.passed === true));
    pass("run() executes candidate query, compares output, and creates SQLExecution log");
  }

  // ---------------------------------------------------------------------------
  // TEST 5: SqlService.submit() & SqlService.draft() Responses
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 5] Testing SqlService.submit() and draft() workflows...");

    // Draft autosave
    const draftRes = await service.draft({
      sessionId: "sess-sql-1",
      questionId: "q-sql-1",
      query: "SELECT * FROM employees;",
      timeSpentSeconds: 45,
    });
    assert.strictEqual(draftRes.success, true);
    const draftResp = moduleResponsesDb.find((m) => m.sessionId === "sess-sql-1" && m.questionId === "q-sql-1");
    assert.strictEqual(draftResp?.isDraft, true);
    pass("draft() saves candidate query as draft response");

    // Final submit
    const submitRes = await service.submit({
      sessionId: "sess-sql-1",
      questionId: "q-sql-1",
      query: "SELECT id, name FROM employees WHERE salary > 50000 AND active = true;",
      timeSpentSeconds: 90,
    });
    assert.strictEqual(submitRes.passed, true);
    const finalResp = moduleResponsesDb.find((m) => m.sessionId === "sess-sql-1" && m.questionId === "q-sql-1");
    assert.strictEqual(finalResp?.isDraft, false);
    assert(sqlExecutionsDb.some((e) => e.submissionType === SubmissionType.SUBMIT && e.passed === true));
    pass("submit() finalizes answer in ModuleResponse and records completed SQLExecution");
  }

  // ---------------------------------------------------------------------------
  // TEST 6: AssessmentModuleEngine Contract & Partial-Credit Grading
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 6] Testing AssessmentModuleEngine validateSubmission & evaluateSubmission...");

    // 6.1 Validate submission
    const isValid = await service.validateSubmission({ sql: "SELECT 1;" });
    assert.strictEqual(isValid, true);
    const isInvalid = await service.validateSubmission({});
    assert.strictEqual(isInvalid, false);
    pass("validateSubmission validates presence of sql payload");

    // 6.2 Full credit evaluation (1.0)
    const fullCreditRes = await service.evaluateSubmission("sess-sql-1", "q-sql-1", {
      sql: "SELECT id, name FROM employees WHERE salary > 50000 AND active = true;",
    });
    assert.strictEqual(fullCreditRes.score, 1.0);
    pass("evaluateSubmission awards 1.0 (100%) for exact output match");

    // 6.3 Partial credit evaluation (0.2)
    const partialCreditRes = await service.evaluateSubmission("sess-sql-1", "q-sql-1", {
      sql: "SELECT * FROM employees WHERE id = 1;",
    });
    assert.strictEqual(partialCreditRes.score, 0.2);
    pass("evaluateSubmission awards 0.2 (20% partial credit) for valid query referencing schema tables");
  }

  console.log("\n================================================================================");
  console.log(`Summary: ${testPassed}/${testTotal} tests passed successfully!`);
  console.log("================================================================================");
}

runSqlSubsystemTests().catch((err) => {
  console.error("❌ SQL subsystem tests failed:", err);
  process.exit(1);
});
