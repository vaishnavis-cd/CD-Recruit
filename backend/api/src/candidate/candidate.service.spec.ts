import { CandidateService } from "./candidate.service";
import { CandidateRepository } from "./candidate.repository";
import { ConsentTypeEnum } from "./consent.dto";
import { NotFoundException } from "@nestjs/common";

async function runCandidateServiceTests() {
  console.log("================================================================================");
  console.log("Running Characterization & Regression Tests for CandidateService & Repository");
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

  // Mock DB Store
  const candidatesDb = new Map<string, any>();
  const sessionsDb = new Map<string, any>();
  const consentRecordsDb: any[] = [];

  // Seed sample session
  sessionsDb.set("sess-uuid-1", {
    id: "sess-uuid-1",
    candidateId: "cand-uuid-1",
  });

  const mockPrisma: any = {
    candidate: {
      findMany: async (args: any) => {
        const emails = args.where?.email?.in || [];
        return Array.from(candidatesDb.values()).filter((c) => emails.includes(c.email));
      },
      findUnique: async (args: any) => {
        if (args.where?.id) return candidatesDb.get(args.where.id) || null;
        if (args.where?.email) {
          return Array.from(candidatesDb.values()).find((c) => c.email === args.where.email) || null;
        }
        return null;
      },
      upsert: async (args: any) => {
        const existing = Array.from(candidatesDb.values()).find((c) => c.email === args.where.email);
        if (existing) {
          existing.name = args.update.name || existing.name;
          return existing;
        }
        const created = {
          id: `cand-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          email: args.create.email,
          name: args.create.name,
        };
        candidatesDb.set(created.id, created);
        return created;
      },
    },
    session: {
      findUnique: async (args: any) => {
        return sessionsDb.get(args.where?.id) || null;
      },
    },
    consentRecord: {
      findFirst: async (args: any) => {
        const { candidateId, consentType, version } = args.where;
        return (
          consentRecordsDb.find(
            (r) =>
              r.candidateId === candidateId &&
              r.consentType === consentType &&
              r.version === version,
          ) || null
        );
      },
      create: async (args: any) => {
        const record = {
          id: `consent-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          candidateId: args.data.candidateId,
          consentType: args.data.consentType,
          version: args.data.version,
          ipAddress: args.data.ipAddress,
          consentedAt: new Date(),
        };
        consentRecordsDb.push(record);
        return record;
      },
    },
  };

  const repository = new CandidateRepository(mockPrisma);
  const service = new CandidateService(repository);

  // ---------------------------------------------------------------------------
  // TEST 1: CandidateService.findOrCreate (Implicit provisioning)
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 1] Testing candidate findOrCreate provisioning...");
    const cand1 = await service.findOrCreate("alice@example.com", "Alice Tester");
    assert(!!cand1.id, "Candidate ID must be generated");
    assert(cand1.email === "alice@example.com", "Candidate email must match");
    assert(cand1.name === "Alice Tester", "Candidate name must match");

    // Repeat with same email -> must return same candidate
    const cand1Repeat = await service.findOrCreate("alice@example.com", "Alice Updated");
    assert(cand1Repeat.id === cand1.id, "Repeated findOrCreate must return existing candidate ID");
    assert(cand1Repeat.name === "Alice Updated", "Name must be updated on repeat findOrCreate");
  }

  // ---------------------------------------------------------------------------
  // TEST 2: CandidateService.recordConsent (First-time recording)
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 2] Testing first-time consent recording...");
    const res = await service.recordConsent(
      "sess-uuid-1",
      ConsentTypeEnum.TERMS,
      "1.0.0",
      "192.168.1.100",
    );

    assert(!!res.id, "Consent record ID must be returned");
    assert(typeof res.consentedAt === "string", "consentedAt must be ISO timestamp string");
    assert(consentRecordsDb.length === 1, "Database must have exactly 1 consent record");
  }

  // ---------------------------------------------------------------------------
  // TEST 3: CandidateService.recordConsent Idempotency (Duplicate submission)
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 3] Testing consent recording idempotency...");
    const resDuplicate = await service.recordConsent(
      "sess-uuid-1",
      ConsentTypeEnum.TERMS,
      "1.0.0",
      "192.168.1.100",
    );

    assert(consentRecordsDb.length === 1, "Database must still have exactly 1 consent record (no duplicates)");
    assert(!!resDuplicate.id, "Duplicate call must return valid consent record ID");
  }

  // ---------------------------------------------------------------------------
  // TEST 4: CandidateService.recordConsent Multi-Step Consent
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 4] Testing distinct consent steps recording...");
    const resBio = await service.recordConsent(
      "sess-uuid-1",
      ConsentTypeEnum.BIOMETRIC,
      "1.0.0",
      "192.168.1.100",
    );
    const resSelfie = await service.recordConsent(
      "sess-uuid-1",
      ConsentTypeEnum.SELFIE,
      "1.0.0",
      "192.168.1.100",
    );

    assert(!!resBio.id, "Biometric consent must be recorded");
    assert(!!resSelfie.id, "Selfie consent must be recorded");
    assert(consentRecordsDb.length === 3, "Database must have 3 distinct consent step records");
  }

  // ---------------------------------------------------------------------------
  // TEST 5: CandidateService.recordConsent Non-Existent Session Error
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 5] Testing non-existent session error handling...");
    let threwNotFound = false;
    try {
      await service.recordConsent(
        "invalid-non-existent-session-id",
        ConsentTypeEnum.TERMS,
        "1.0.0",
        "127.0.0.1",
      );
    } catch (err: any) {
      if (err instanceof NotFoundException) {
        threwNotFound = true;
      }
    }
    assert(threwNotFound, "Non-existent session must throw NotFoundException");
  }

  // ---------------------------------------------------------------------------
  // TEST 6: CandidateRepository Direct Lookup Methods
  // ---------------------------------------------------------------------------
  {
    console.log("\n[TEST 6] Testing CandidateRepository query methods...");
    const candidates = await repository.findCandidatesByEmails(["alice@example.com"]);
    assert(candidates.length === 1, "findCandidatesByEmails must return matching candidate");
    assert(candidates[0].email === "alice@example.com", "Email must match alice@example.com");

    const candById = await repository.findCandidateById(candidates[0].id);
    assert(!!candById, "findCandidateById must return candidate");
    assert(candById?.id === candidates[0].id, "Candidate ID must match");

    const emptyEmails = await repository.findCandidatesByEmails([]);
    assert(emptyEmails.length === 0, "Empty emails array must immediately return empty array");
  }

  console.log("\n================================================================================");
  console.log(`Summary: ${testPassed}/${testTotal} tests passed successfully!`);
  console.log("================================================================================");
}

runCandidateServiceTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
