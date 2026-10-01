import { SessionOwnerGuard } from "./session-owner.guard";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import assert from "node:assert";

async function runSessionOwnerGuardTests() {
  console.log("================================================================================");
  console.log("Running Characterization & Regression Tests for SessionOwnerGuard");
  console.log("================================================================================");

  let testPassed = 0;
  let testTotal = 0;

  function pass(msg: string) {
    testTotal++;
    testPassed++;
    console.log(`✅ PASS: ${msg}`);
  }

  const sessionsDb = new Map<string, any>();
  sessionsDb.set("sess-valid-not-started", {
    id: "sess-valid-not-started",
    status: "NOT_STARTED",
    drive: { scheduleEnd: null, status: "ACTIVE" },
  });
  sessionsDb.set("sess-valid-in-progress", {
    id: "sess-valid-in-progress",
    status: "IN_PROGRESS",
    drive: { scheduleEnd: null, status: "ACTIVE" },
  });
  sessionsDb.set("sess-closed", {
    id: "sess-closed",
    status: "CLOSED",
  });
  sessionsDb.set("sess-submitted", {
    id: "sess-submitted",
    status: "SUBMITTED",
  });

  const mockPrisma: any = {
    session: {
      findUnique: async ({ where }: any) => sessionsDb.get(where.id) || null,
      upsert: async ({ where, create }: any) => {
        const item = { id: where.id, ...create };
        sessionsDb.set(where.id, item);
        return item;
      },
      update: async ({ where, data }: any) => {
        const item = sessionsDb.get(where.id);
        if (item) Object.assign(item, data);
        return item;
      },
    },
    invite: {
      findFirst: async () => null,
    },
    codingExecution: {
      findUnique: async () => null,
    },
    roleTemplate: {
      findFirst: async () => ({ id: "role-dev", roleName: "Software Engineer", durationMinutes: 60 }),
      create: async () => ({ id: "role-dev", roleName: "Software Engineer", durationMinutes: 60 }),
    },
    candidate: {
      findFirst: async () => null,
      create: async ({ data }: any) => ({ id: "cand-dev", ...data }),
    },
    drive: {
      findFirst: async () => null,
    },
  };

  const guard = new SessionOwnerGuard(mockPrisma);

  const createMockContext = (params: any = {}, body: any = {}, query: any = {}) => {
    const req: any = { params, body, query };
    return {
      switchToHttp: () => ({
        getRequest: () => req,
      }),
      req,
    };
  };

  // Test 1: Missing session ID throws ForbiddenException
  {
    let threw = false;
    try {
      const ctx = createMockContext();
      await guard.canActivate(ctx as any);
    } catch (err: any) {
      if (err instanceof ForbiddenException && err.message.includes("Session ID is required")) {
        threw = true;
      }
    }
    assert.strictEqual(threw, true);
    pass("Throws ForbiddenException when session ID is missing");
  }

  // Test 2: Allows NOT_STARTED and IN_PROGRESS sessions
  {
    const ctx1 = createMockContext({ sessionId: "sess-valid-not-started" });
    const res1 = await guard.canActivate(ctx1 as any);
    assert.strictEqual(res1, true);
    assert.strictEqual(ctx1.req.session.status, "NOT_STARTED");
    pass("Allows access to NOT_STARTED session and attaches session to request");

    const ctx2 = createMockContext({ sessionId: "sess-valid-in-progress" });
    const res2 = await guard.canActivate(ctx2 as any);
    assert.strictEqual(res2, true);
    assert.strictEqual(ctx2.req.session.status, "IN_PROGRESS");
    pass("Allows access to IN_PROGRESS session and attaches session to request");
  }

  // Test 3: Rejects SUBMITTED / CLOSED sessions
  {
    let threwClosed = false;
    try {
      const ctx = createMockContext({ sessionId: "sess-closed" });
      await guard.canActivate(ctx as any);
    } catch (err: any) {
      if (err instanceof ForbiddenException && err.message.includes("closed")) {
        threwClosed = true;
      }
    }
    assert.strictEqual(threwClosed, true);
    pass("Rejects CLOSED session with ForbiddenException");

    let threwSubmitted = false;
    try {
      const ctx = createMockContext({ sessionId: "sess-submitted" });
      await guard.canActivate(ctx as any);
    } catch (err: any) {
      if (err instanceof ForbiddenException && err.message.includes("submitted")) {
        threwSubmitted = true;
      }
    }
    assert.strictEqual(threwSubmitted, true);
    pass("Rejects SUBMITTED session with ForbiddenException");
  }

  // Test 4: Development fallback creation creates session with NOT_STARTED
  {
    const ctx = createMockContext({ sessionId: "demo-session-guard-test" });
    const res = await guard.canActivate(ctx as any);
    assert.strictEqual(res, true);
    const createdSession = sessionsDb.get("demo-session-guard-test");
    assert(createdSession, "Fallback session must exist");
    assert.strictEqual(
      createdSession.status,
      "NOT_STARTED",
      "Fallback session must be created with NOT_STARTED status, never IN_PROGRESS",
    );
    assert.strictEqual(ctx.req.session.status, "NOT_STARTED");
    pass("Development fallback session creation sets status to NOT_STARTED (never IN_PROGRESS)");
  }

  // Test 5: Unknown session in production throws NotFoundException
  {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    delete process.env.ALLOW_SYNTHETIC_SESSIONS;
    let threw404 = false;
    try {
      const ctx = createMockContext({ sessionId: "prod-unknown-session-1234" });
      await guard.canActivate(ctx as any);
    } catch (err: any) {
      if (err instanceof NotFoundException) {
        threw404 = true;
      }
    } finally {
      process.env.NODE_ENV = origEnv;
    }
    assert.strictEqual(threw404, true);
    pass("Unknown session in production throws NotFoundException");
  }

  console.log("\n================================================================================");
  console.log(`Summary: ${testPassed}/${testTotal} tests passed successfully!`);
  console.log("================================================================================");
}

runSessionOwnerGuardTests().catch((err) => {
  console.error("❌ SessionOwnerGuard tests failed:", err);
  process.exit(1);
});
