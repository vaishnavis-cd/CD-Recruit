import { ProctoringService } from "./proctoring.service";
import { ProctoringEventType, ProctoringUploadStatus } from "./proctoring.types";
import { NotFoundException } from "@nestjs/common";
import assert from "node:assert";

async function runProctoringTests() {
  console.log("================================================================================");
  console.log("Running Characterization & Regression Tests for Proctoring Subsystem");
  console.log("================================================================================");

  let testPassed = 0;
  let testTotal = 0;

  function pass(msg: string) {
    testTotal++;
    testPassed++;
    console.log(`✅ PASS: ${msg}`);
  }

  const eventsDb: any[] = [];
  const flagsDb: any[] = [];
  const evidenceClipsDb: any[] = [];
  const eventLogsDb: any[] = [];

  const mockSession = {
    id: "sess-proctor-1",
    status: "IN_PROGRESS",
    candidateId: "cand-1",
    candidate: {
      id: "cand-1",
      name: "Priya Sharma",
      organization: { slug: "acme-corp" },
    },
    drive: {
      questions: [
        {
          question: {
            content: {
              prompt: "Given an array nums, find the contiguous subarray with largest sum.",
            },
          },
        },
      ],
    },
  };

  const mockPrisma: any = {
    session: {
      findUnique: async ({ where }: any) => (where.id === "sess-proctor-1" ? mockSession : null),
      findFirst: async () => mockSession,
      upsert: async ({ create }: any) => ({ ...create, candidate: mockSession.candidate }),
    },
    invite: {
      findFirst: async () => null,
    },
    proctoringEvent: {
      findMany: async ({ where }: any) => {
        let res = eventsDb.filter((e) => e.sessionId === where.sessionId);
        if (where.eventType) {
          res = res.filter((e) => e.eventType === where.eventType);
        }
        return res;
      },
      findFirst: async ({ where }: any) => {
        return eventsDb.find((e) => e.sessionId === where.sessionId && e.eventType === where.eventType) || null;
      },
      create: async ({ data }: any) => {
        const id = data.id || `evt-${eventsDb.length + 1}`;
        const item = { ...data, id };
        eventsDb.push(item);
        return item;
      },
      update: async ({ where, data }: any) => {
        const item = eventsDb.find((e) => e.id === where.id);
        if (item) Object.assign(item, data);
        return item || data;
      },
      upsert: async ({ where, create, update }: any) => {
        let item = eventsDb.find((e) => e.id === where.id);
        if (item) {
          Object.assign(item, update);
        } else {
          const id = where.id || create.id || `evt-${eventsDb.length + 1}`;
          item = { ...create, id };
          eventsDb.push(item);
        }
        return item;
      },
    },
    integrityFlag: {
      create: async ({ data }: any) => {
        const item = { id: `flag-${flagsDb.length + 1}`, ...data };
        flagsDb.push(item);
        return item;
      },
    },
    evidenceClip: {
      create: async ({ data }: any) => {
        const item = { id: `clip-${evidenceClipsDb.length + 1}`, ...data };
        evidenceClipsDb.push(item);
        return item;
      },
    },
    eventLog: {
      findFirst: async ({ where }: any) => {
        return eventLogsDb.find((el) => el.sessionId === where.sessionId && el.eventType === where.eventType) || null;
      },
    },
  };

  const mockStorage: any = {
    putObject: async () => true,
    getSignedUrl: async (_bucket: string, key: string) => `http://minio:9000/cd-recruit-biometric/${key}?sig=valid`,
    deleteObject: async () => true,
    getObjectStream: async () => ({ pipe: () => {} }),
  };

  const mockConfig: any = {
    get: (key: string) => (key.includes("bucket") ? "cd-recruit-biometric" : null),
  };

  const service = new ProctoringService(mockPrisma, mockStorage, mockConfig);

  // ---------------------------------------------------------------------------
  // TEST 1: createEvent with Sliding Window Cooldown Deduplication
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 1] Testing event creation and sliding cooldown deduplication...");

    const t0 = new Date("2026-08-31T10:00:00.000Z");

    // 1.1 First Phone Detection
    const evt1 = await service.createEvent({
      sessionId: "sess-proctor-1",
      eventType: ProctoringEventType.PHONE_DETECTED,
      severity: "HIGH",
      timestamp: t0.toISOString(),
    });
    assert.strictEqual(evt1.eventType, ProctoringEventType.PHONE_DETECTED);
    pass("First PHONE_DETECTED event created successfully");

    // 1.2 Duplicate Phone Detection 5 seconds later (within 30s cooldown)
    const t1 = new Date(t0.getTime() + 5000);
    const evt2 = await service.createEvent({
      sessionId: "sess-proctor-1",
      eventType: ProctoringEventType.PHONE_DETECTED,
      severity: "HIGH",
      timestamp: t1.toISOString(),
    });
    assert.strictEqual(evt2.id, evt1.id, "Duplicate event within cooldown must return existing event");
    pass("Duplicate PHONE_DETECTED within 30s cooldown is deduplicated");

    // 1.3 MULTIPLE_FACES has cooldown = 0 (never deduplicated)
    const mf1 = await service.createEvent({
      sessionId: "sess-proctor-1",
      eventType: ProctoringEventType.MULTIPLE_FACES,
      severity: "HIGH",
      timestamp: t0.toISOString(),
    });
    const mf2 = await service.createEvent({
      sessionId: "sess-proctor-1",
      eventType: ProctoringEventType.MULTIPLE_FACES,
      severity: "HIGH",
      timestamp: new Date(t0.getTime() + 1000).toISOString(),
    });
    assert.notStrictEqual(mf1.id, mf2.id, "MULTIPLE_FACES events with 0s cooldown must both be recorded");
    pass("Events with 0s cooldown (MULTIPLE_FACES) are recorded without suppression");
  }

  // ---------------------------------------------------------------------------
  // TEST 2: uploadEvidenceAndCreateEvent Atomic Persistence
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 2] Testing atomic evidence upload and event upsert...");

    const dummyBuffer = Buffer.from("mock-webm-video-bytes");
    const uploadRes = await service.uploadEvidenceAndCreateEvent(
      "sess-proctor-1",
      { originalname: "phone_evidence.webm", buffer: dummyBuffer },
      {
        sessionId: "sess-proctor-1",
        eventType: ProctoringEventType.PHONE_DETECTED,
        severity: "HIGH",
        timestamp: "2026-08-31T11:00:00.000Z",
      },
    );

    assert.strictEqual(uploadRes.uploadStatus, ProctoringUploadStatus.UPLOADED);
    assert(uploadRes.clipUrl?.includes("http://minio:9000"), "Must return signed MinIO URL");
    pass("uploadEvidenceAndCreateEvent uploads clip to storage and upserts ProctoringEvent atomically");
  }

  // ---------------------------------------------------------------------------
  // TEST 3: getSessionEvents and getSessionSummary
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 3] Testing getSessionEvents and getSessionSummary aggregation...");

    const eventsList = await service.getSessionEvents("sess-proctor-1");
    assert(eventsList.length >= 3, "Should return all session proctoring events");
    pass("getSessionEvents returns formatted review list with presigned URLs");

    const summary = await service.getSessionSummary("sess-proctor-1");
    assert(summary.phoneDetected >= 1, "Summary must aggregate phoneDetected count");
    assert(summary.multipleFaces >= 2, "Summary must aggregate multipleFaces count");
    pass("getSessionSummary dynamically aggregates counts across violation categories");
  }

  // ---------------------------------------------------------------------------
  // TEST 4: evaluateEvent Behavioral Correlation & Provenance Tagging
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 4] Testing correlation engine (Tab Switch + Paste vs Self-Copy)...");

    // 4.1 Correlated Paste Anomaly (Tab switch within 40s)
    eventLogsDb.push({
      sessionId: "sess-proctor-1",
      eventType: "TAB_SWITCH",
      occurredAt: new Date(Date.now() - 10000), // 10s ago
    });

    const flag1 = await service.evaluateEvent("sess-proctor-1", "PASTE", {
      text: "https://cheat-code-solution.org",
    });
    assert.strictEqual(flag1?.category, "CORRELATED_PASTE_ANOMALY");
    assert.strictEqual(flag1?.severity, "CRITICAL");
    assert.strictEqual(flag1?.confidence, 0.95);
    pass("evaluateEvent flags CORRELATED_PASTE_ANOMALY when preceded by recent TAB_SWITCH");

    // 4.2 Self-Copy Insert (Copied from question prompt)
    eventLogsDb.length = 0; // Clear recent tab switches
    eventsDb.length = 0;

    const flag2 = await service.evaluateEvent("sess-proctor-1", "PASTE", {
      text: "find the contiguous subarray with largest sum",
    });
    assert.strictEqual(flag2?.category, "SELF_COPY_INSERT");
    assert.strictEqual(flag2?.severity, "LOW");
    assert.strictEqual(flag2?.confidence, 0.3);
    pass("evaluateEvent recognizes SELF_COPY_INSERT and demotes severity to LOW");
  }

  // ---------------------------------------------------------------------------
  // TEST 5: Production Data Hygiene & 404 Gating
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 5] Testing production session resolution gating...");

    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    delete process.env.ALLOW_SYNTHETIC_SESSIONS;

    let threw404 = false;
    try {
      await service.createEvent({
        sessionId: "00000000-0000-0000-0000-000000000099",
        eventType: ProctoringEventType.PHONE_DETECTED,
        severity: "HIGH",
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      if (err instanceof NotFoundException) {
        threw404 = true;
      }
    } finally {
      process.env.NODE_ENV = origEnv;
    }

    assert.strictEqual(threw404, true, "Invalid session in production must throw NotFoundException");
    pass("Production hygiene blocks synthetic session auto-creation for unknown session UUIDs");
  }

  console.log("\n================================================================================");
  console.log(`Summary: ${testPassed}/${testTotal} tests passed successfully!`);
  console.log("================================================================================");
}

runProctoringTests().catch((err) => {
  console.error("❌ Proctoring tests failed:", err);
  process.exit(1);
});
