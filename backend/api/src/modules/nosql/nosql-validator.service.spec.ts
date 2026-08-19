import { Test, TestingModule } from "@nestjs/testing";
import { NosqlValidatorService, MongoOperationObject } from "./nosql-validator.service";

describe("NosqlValidatorService", () => {
  let service: NosqlValidatorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [NosqlValidatorService],
    }).compile();

    service = module.get<NosqlValidatorService>(NosqlValidatorService);
  });

  it("should accept valid operations", () => {
    const question = {
      allowedOperations: ["find", "aggregate"],
    };
    const op: MongoOperationObject = {
      collection: "employees",
      operator: "find",
      payload: { filter: { salary: { $gt: 50000 } } },
    };
    const res = service.validateOperation(op, question);
    expect(res.valid).toBe(true);
  });

  it("should reject operators not in whitelist", () => {
    const question = {
      allowedOperations: ["find"],
    };
    const op: MongoOperationObject = {
      collection: "employees",
      operator: "insertOne" as any,
      payload: { document: { name: "Alice" } },
    };
    const res = service.validateOperation(op, question);
    expect(res.valid).toBe(false);
    expect(res.reason).toContain("not allowed");
  });

  it("should reject blocklisted operator keys (e.g. dropDatabase)", () => {
    const question = {
      allowedOperations: ["find"],
    };
    const op = {
      collection: "employees",
      operator: "find",
      payload: {
        filter: {
          $expr: { dropDatabase: 1 },
        },
      },
    };
    const res = service.validateOperation(op, question);
    expect(res.valid).toBe(false);
    expect(res.reason).toContain("Disallowed blocklisted key");
  });

  it("should reject payloads with javascript codes (recursively scanned)", () => {
    const question = {
      allowedOperations: ["find"],
    };
    const op = {
      collection: "employees",
      operator: "find",
      payload: {
        filter: {
          $where: "function() { return this.salary > 50000; }",
        },
      },
    };
    const res = service.validateOperation(op, question);
    expect(res.valid).toBe(false);
    expect(res.reason).toBeDefined();
  });

  it("should reject payloads with return keywords inside string fields", () => {
    const question = {
      allowedOperations: ["find"],
    };
    const op = {
      collection: "employees",
      operator: "find",
      payload: {
        filter: {
          name: "() => { return 'Alice'; }",
        },
      },
    };
    const res = service.validateOperation(op, question);
    expect(res.valid).toBe(false);
    expect(res.reason).toContain("potential JavaScript code");
  });

  it("should reject pipeline if aggregate stage count exceeds 10", () => {
    const question = {
      allowedOperations: ["aggregate"],
    };
    const pipeline = Array(11).fill({ $match: { salary: { $gt: 50000 } } });
    const op = {
      collection: "employees",
      operator: "aggregate",
      payload: { pipeline },
    };
    const res = service.validateOperation(op, question);
    expect(res.valid).toBe(false);
    expect(res.reason).toContain("exceeds maximum of 10 stages");
  });
});
