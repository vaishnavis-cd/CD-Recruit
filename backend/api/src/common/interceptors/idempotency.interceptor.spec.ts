import { IdempotencyInterceptor } from "./idempotency.interceptor";
import { of, firstValueFrom } from "rxjs";
import assert from "node:assert";

async function runIdempotencyInterceptorTests() {
  console.log("Running characterization tests for IdempotencyInterceptor...");

  const store: Record<string, string> = {};
  const mockRedisService: any = {
    get: async (key: string) => store[key] || null,
    set: async (key: string, value: string, _mode?: string, _ttl?: number) => {
      store[key] = value;
    },
  };

  const interceptor = new IdempotencyInterceptor(mockRedisService);

  const createMockContext = (headers: Record<string, string>, partnerId: string = "partner-123") => {
    const req: any = { headers, partner: { id: partnerId } };
    return {
      switchToHttp: () => ({
        getRequest: () => req,
      }),
      req,
    };
  };

  // Test 1: Bypasses interceptor when Idempotency-Key header is missing
  let handlerCalledCount = 0;
  const mockHandler1: any = {
    handle: () => {
      handlerCalledCount++;
      return of({ status: "processed", count: handlerCalledCount });
    },
  };

  const ctx1 = createMockContext({});
  const result1Obs = await interceptor.intercept(ctx1 as any, mockHandler1);
  const result1 = await firstValueFrom(result1Obs);

  assert.strictEqual(handlerCalledCount, 1);
  assert.strictEqual(result1.status, "processed");
  console.log("  ✔ Bypasses interceptor when Idempotency-Key header is missing");

  // Test 2: Processes request and caches response when Idempotency-Key is new
  const idempotencyKey = "key_abc_12345";
  const mockHandler2: any = {
    handle: () => {
      handlerCalledCount++;
      return of({ status: "success", inviteId: "inv-999" });
    },
  };

  const ctx2 = createMockContext({ "idempotency-key": idempotencyKey }, "partner-456");
  const result2Obs = await interceptor.intercept(ctx2 as any, mockHandler2);
  const result2 = await firstValueFrom(result2Obs);

  assert.strictEqual(result2.inviteId, "inv-999");
  assert.strictEqual(handlerCalledCount, 2);
  assert.strictEqual(
    store["idempotency:partner-456:key_abc_12345"],
    JSON.stringify({ status: "success", inviteId: "inv-999" }),
  );
  console.log("  ✔ Processes request and caches response in Redis under idempotency:partner-456:key_abc_12345");

  // Test 3: Short-circuits and returns cached response when Idempotency-Key is reused
  const mockHandler3: any = {
    handle: () => {
      handlerCalledCount++;
      return of({ status: "should_not_run" });
    },
  };

  const ctx3 = createMockContext({ "idempotency-key": idempotencyKey }, "partner-456");
  const result3Obs = await interceptor.intercept(ctx3 as any, mockHandler3);
  const result3 = await firstValueFrom(result3Obs);

  // Handler count MUST remain 2 (handler was NOT called again!)
  assert.strictEqual(handlerCalledCount, 2, "Handler should NOT be called on cache hit");
  assert.strictEqual(result3.inviteId, "inv-999");
  console.log("  ✔ Short-circuits with cached response on Idempotency-Key reuse without calling handler");

  console.log("✅ All IdempotencyInterceptor characterization tests passed successfully!");
}

runIdempotencyInterceptorTests().catch((err) => {
  console.error("❌ IdempotencyInterceptor tests failed:", err);
  process.exit(1);
});
