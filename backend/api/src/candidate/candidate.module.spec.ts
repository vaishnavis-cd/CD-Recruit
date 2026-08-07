import { Test, TestingModule } from "@nestjs/testing";
import { CandidateModule } from "./candidate.module";
import { CandidateController } from "./candidate.controller";
import { CandidateService } from "./candidate.service";
import { CandidateRepository } from "./candidate.repository";
import { PrismaService } from "@app/prisma/prisma.service";

describe("CandidateModule Wiring Regression Test", () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [CandidateModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();
  });

  it("should have CandidateController registered in controllers", () => {
    const controller = moduleRef.get<CandidateController>(CandidateController);
    expect(controller).toBeDefined();
    expect(controller).toBeInstanceOf(CandidateController);
  });
});
