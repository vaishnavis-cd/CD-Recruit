import { Test, TestingModule } from "@nestjs/testing";
import { ResultComparatorService } from "./result-comparator.service";
import { ObjectId } from "mongodb";

describe("ResultComparatorService (Mongo extensions)", () => {
  let service: ResultComparatorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ResultComparatorService],
    }).compile();

    service = module.get<ResultComparatorService>(ResultComparatorService);
  });

  describe("normalizeMongoValue", () => {
    it("should transform ObjectId to string representation", () => {
      const id = new ObjectId();
      const res = service.normalizeMongoValue({ _id: id });
      expect(res._id).toBe(id.toString());
    });

    it("should transform Date object to ISO string", () => {
      const date = new Date("2026-08-06T12:00:00Z");
      const res = service.normalizeMongoValue({ date });
      expect(res.date).toBe(date.toISOString());
    });

    it("should sort arrays by _id deterministically to enable order-independent matching", () => {
      const arr = [
        { _id: "b", salary: 200 },
        { _id: "a", salary: 100 },
      ];
      const res = service.normalizeMongoValue(arr);
      expect(res[0]._id).toBe("a");
      expect(res[1]._id).toBe("b");
    });
  });

  describe("compareOutput", () => {
    it("should match identical documents even if keys are reordered", () => {
      const cand = { name: "Alice", salary: 50000 };
      const exp = { salary: 50000, name: "Alice" };
      expect(service.compareOutput(cand, exp)).toBe(true);
    });

    it("should match array outputs with elements in different order due to normalization sorting", () => {
      const cand = [
        { _id: "1", val: "A" },
        { _id: "2", val: "B" },
      ];
      const exp = [
        { _id: "2", val: "B" },
        { _id: "1", val: "A" },
      ];
      expect(service.compareOutput(cand, exp)).toBe(true);
    });
  });

  describe("compareState", () => {
    it("should match identical collection snapshots", () => {
      const cand = {
        employees: [{ _id: "1", name: "Alice" }],
      };
      const exp = {
        employees: [{ name: "Alice", _id: "1" }],
      };
      expect(service.compareState(cand, exp)).toBe(true);
    });
  });
});
