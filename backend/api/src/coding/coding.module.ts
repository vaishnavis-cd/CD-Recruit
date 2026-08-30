import { Module } from "@nestjs/common";
import { CodingController } from "./coding.controller";
import { CodingService } from "./coding.service";
import { PrismaModule } from "../prisma/prisma.module";
import { Judge0Module } from "../integrations/judge0/judge0.module";
import { QaAutomationSandboxService } from "../execution/qa-automation-sandbox.service";

import { CandidateThrottlerGuard } from "../common/guards/candidate-throttler.guard";

@Module({
  imports: [PrismaModule, Judge0Module],
  controllers: [CodingController],
  providers: [CodingService, QaAutomationSandboxService, CandidateThrottlerGuard],
  exports: [CodingService, QaAutomationSandboxService],
})
export class CodingModule {}
