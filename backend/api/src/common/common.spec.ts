import { SessionOwnerGuard } from "./guards/session-owner.guard";
import { IdempotencyInterceptor } from "./interceptors/idempotency.interceptor";
import { HttpExceptionFilter } from "./filters/http-exception.filter";
import { AppException, GoneException } from "./exceptions/app.exceptions";
import { NameMatchService } from "./services/name-match.service";
import { BadRequestException, ForbiddenException, NotFoundException, HttpStatus } from "@nestjs/common";
import { of, firstValueFrom } from "rxjs";

async function runCommonTests() {
  console.log("================================================================================");
  console.log("Running Characterization & Regression Tests for Common Kernel Subsystem");
  console.log("================================================================================");

  let testPassed = 0;
  let testTotal = 0;

  function assert(condition: boolean, message: string) {
    testTotal++;
    if (!condition) {
      console.error(`❌ FAIL: ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    } else {
      console.log(`✅ PASS: ${message}`);
      testPassed++;
    }
  }

  // ---------------------------------------------------------------------------
  // TEST 1: SessionOwnerGuard Resolution & Production Hygiene
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 1] Testing SessionOwnerGuard resolution & production hygiene...");

    const sessionsDb = new Map<string, any>();
    const candidatesDb = new Map<string, any>();
    const executionsDb = new Map<string, any>();
    const invitesDb = new Map<string, any>();

    sessionsDb.set("sess-active", { id: "sess-active", status: "IN_PROGRESS", candidateId: "c-1" });
    sessionsDb.set("sess-closed", { id: "sess-closed", status: "CLOSED", candidateId: "c-2" });
    executionsDb.set("exec-100", { id: "exec-100", session: { id: "sess-active", status: "IN_PROGRESS" } });
    invitesDb.set("tok-xyz", { token: "tok-xyz", session: { id: "sess-active", status: "IN_PROGRESS" } });

    const mockPrisma: any = {
      session: {
        findUnique: async (args: any) => sessionsDb.get(args.where.id) || null,
        upsert: async (args: any) => {
          const created = { id: args.where.id, status: "IN_PROGRESS" };
          sessionsDb.set(args.where.id, created);
          return created;
        },
      },
      codingExecution: {
        findUnique: async (args: any) => executionsDb.get(args.where.id) || null,
      },
      invite: {
        findFirst: async (args: any) => {
          const tok = args.where.OR?.[0]?.token;
          return invitesDb.get(tok) || null;
        },
      },
      roleTemplate: {
        findFirst: async () => ({ id: "role-1", roleName: "SE" }),
        create: async () => ({ id: "role-1", roleName: "SE" }),
      },
      candidate: {
        findFirst: async (args: any) => candidatesDb.get(args.where.email) || null,
        create: async (args: any) => {
          const created = { id: "c-gen", email: args.data.email };
          candidatesDb.set(args.data.email, created);
          return created;
        },
      },
      drive: {
        findFirst: async () => null,
      },
    };

    const guard = new SessionOwnerGuard(mockPrisma);

    const makeCtx = (params: any = {}, body: any = {}, query: any = {}) => ({
      switchToHttp: () => ({
        getRequest: () => ({ params, body, query }),
      }),
    });

    // 1.1 Valid active session
    const canActive = await guard.canActivate(makeCtx({ sessionId: "sess-active" }) as any);
    assert(canActive === true, "Active session in DB must pass guard");

    // 1.2 Resolution via execution ID
    const canExec = await guard.canActivate(makeCtx({ id: "exec-100" }) as any);
    assert(canExec === true, "Session resolved via CodingExecution ID must pass guard");

    // 1.3 Resolution via invite token
    const canInvite = await guard.canActivate(makeCtx({ sessionId: "tok-xyz" }) as any);
    assert(canInvite === true, "Session resolved via Invite Token must pass guard");

    // 1.4 Closed session must throw ForbiddenException
    let threwClosed = false;
    try {
      await guard.canActivate(makeCtx({ sessionId: "sess-closed" }) as any);
    } catch (err: any) {
      if (err instanceof ForbiddenException && err.message.includes("closed")) {
        threwClosed = true;
      }
    }
    assert(threwClosed, "Closed session must throw ForbiddenException");

    // 1.5 Non-existent session UUID in production must throw NotFoundException without writing to DB
    const countBefore = sessionsDb.size;
    let threwNotFound = false;
    try {
      await guard.canActivate(makeCtx({ sessionId: "random-non-existent-uuid" }) as any);
    } catch (err: any) {
      if (err instanceof NotFoundException) {
        threwNotFound = true;
      }
    }
    assert(threwNotFound, "Unknown session UUID must throw NotFoundException");
    assert(sessionsDb.size === countBefore, "Unknown session UUID must NOT pollute database with synthetic records");

    // 1.6 Demo session auto-provisioning
    const canDemo = await guard.canActivate(makeCtx({ sessionId: "demo-session" }) as any);
    assert(canDemo === true, "demo-session must be auto-provisioned safely");
  }

  // ---------------------------------------------------------------------------
  // TEST 2: IdempotencyInterceptor Multi-Tenant Scoping
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 2] Testing IdempotencyInterceptor cache key scoping...");

    const cacheStore = new Map<string, string>();
    const mockRedis: any = {
      get: async (key: string) => cacheStore.get(key) || null,
      set: async (key: string, val: string) => {
        cacheStore.set(key, val);
      },
    };

    const interceptor = new IdempotencyInterceptor(mockRedis);

    const makeHandler = (payload: any) => ({
      handle: () => of(payload),
    });

    // 2.1 Partner Scoped
    const reqPartner: any = {
      headers: { "idempotency-key": "req-1" },
      partner: { id: "p-abc" },
      params: {},
      body: {},
    };
    const obsP = interceptor.intercept(
      { switchToHttp: () => ({ getRequest: () => reqPartner }) } as any,
      makeHandler({ ok: true, source: "partner" }),
    );
    await firstValueFrom(obsP);
    assert(cacheStore.has("idempotency:partner:p-abc:req-1"), "Partner request must scope cache key under partner:p-abc");

    // 2.2 User Scoped
    const reqUser: any = {
      headers: { "idempotency-key": "req-1" },
      user: { id: "u-xyz" },
      params: {},
      body: {},
    };
    const obsU = interceptor.intercept(
      { switchToHttp: () => ({ getRequest: () => reqUser }) } as any,
      makeHandler({ ok: true, source: "user" }),
    );
    await firstValueFrom(obsU);
    assert(cacheStore.has("idempotency:user:u-xyz:req-1"), "Staff user request must scope cache key under user:u-xyz");

    // 2.3 Session Scoped
    const reqSession: any = {
      headers: { "idempotency-key": "req-1" },
      params: { sessionId: "sess-999" },
      body: {},
    };
    const obsS = interceptor.intercept(
      { switchToHttp: () => ({ getRequest: () => reqSession }) } as any,
      makeHandler({ ok: true, source: "session" }),
    );
    await firstValueFrom(obsS);
    assert(cacheStore.has("idempotency:session:sess-999:req-1"), "Candidate session request must scope cache key under session:sess-999");
  }

  // ---------------------------------------------------------------------------
  // TEST 3: HttpExceptionFilter Standard Envelope Formatting
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 3] Testing HttpExceptionFilter response normalization...");

    const filter = new HttpExceptionFilter();

    function captureFilterResponse(exception: any) {
      let resStatus = 0;
      let resJson: any = null;
      const mockHost: any = {
        switchToHttp: () => ({
          getResponse: () => ({
            status: (s: number) => {
              resStatus = s;
              return {
                json: (j: any) => {
                  resJson = j;
                },
              };
            },
          }),
          getRequest: () => ({
            url: "/api/v1/test",
          }),
        }),
      };
      filter.catch(exception, mockHost);
      return { status: resStatus, json: resJson };
    }

    // 3.1 AppException
    const appEx = new AppException("INVALID_DATA", "Custom domain failure", HttpStatus.UNPROCESSABLE_ENTITY);
    const r1 = captureFilterResponse(appEx);
    assert(r1.status === 422, "AppException status must be 422");
    assert(r1.json.code === "INVALID_DATA", "AppException code must be INVALID_DATA");
    assert(r1.json.message === "Custom domain failure", "Message must match");

    // 3.2 GoneException (HTTP 410)
    const goneEx = new GoneException({ code: "INVITE_TOKEN_EXPIRED", message: "Token has expired." });
    const r2 = captureFilterResponse(goneEx);
    assert(r2.status === 410, "GoneException status must be 410");
    assert(r2.json.code === "INVITE_TOKEN_EXPIRED", "GoneException code must be INVITE_TOKEN_EXPIRED");

    // 3.3 Standard BadRequestException with validation error array
    const valEx = new BadRequestException(["email must be an email", "name is required"]);
    const r3 = captureFilterResponse(valEx);
    assert(r3.status === 400, "Validation exception status must be 400");
    assert(r3.json.message === "email must be an email, name is required", "Array validation messages must be joined");

    // 3.4 Runtime unexpected Error
    const runtimeErr = new Error("Database connection lost");
    const r4 = captureFilterResponse(runtimeErr);
    assert(r4.status === 500, "Unhandled error status must be 500");
    assert(r4.json.code === "INTERNAL_SERVER_ERROR", "Unhandled error code must be INTERNAL_SERVER_ERROR");
  }

  // ---------------------------------------------------------------------------
  // TEST 4: NameMatchService Fuzzy Identity Verification
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 4] Testing NameMatchService fuzzy matching and honorific stripping...");

    const nameMatcher = new NameMatchService();

    // 4.1 Exact Match
    const res1 = nameMatcher.compareNames("Priya Sharma", "Priya Sharma");
    assert(res1.matched === true, "Exact name match must return matched: true");
    assert(res1.similarity === 1.0, "Exact match similarity must be 1.0");

    // 4.2 Word Reordering (Token Sort Ratio)
    const res2 = nameMatcher.compareNames("Vaishnavi S", "S Vaishnavi");
    assert(res2.matched === true, "Reordered names ('Vaishnavi S' vs 'S Vaishnavi') must match");
    assert(res2.similarity >= 0.9, "Reordered names similarity must be >= 0.9");

    // 4.3 Honorifics Stripping
    const res3 = nameMatcher.compareNames("Rahul Sharma", "Shri Rahul Sharma");
    assert(res3.matched === true, "Indian honorific 'Shri' must be stripped and matched");

    const res4 = nameMatcher.compareNames("Abdul Kalam", "Dr. A. P. J. Abdul Kalam", 0.6);
    assert(res4.matched === true, "Title 'Dr.' must be stripped");

    // 4.4 Mismatch
    const res5 = nameMatcher.compareNames("John Doe", "Alice Walker");
    assert(res5.matched === false, "Different names must return matched: false");
    assert(res5.similarity < 0.4, "Different names similarity must be low");
  }

  console.log("\n================================================================================");
  console.log(`Summary: ${testPassed}/${testTotal} tests passed successfully!`);
  console.log("================================================================================");
}

runCommonTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
