import { Module } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { CodingController } from "./coding.controller";
import { CodingService } from "./coding.service";
import { PrismaModule } from "../prisma/prisma.module";
import { PistonModule } from "../integrations/piston/piston.module";
import { SessionModule } from "../session/session.module";
import { QaAutomationSandboxService } from "../execution/qa-automation-sandbox.service";

import { CandidateThrottlerGuard } from "../common/guards/candidate-throttler.guard";

@Module({
  imports: [PrismaModule, PistonModule, SessionModule],
  controllers: [CodingController],
  providers: [CodingService, QaAutomationSandboxService, CandidateThrottlerGuard, Reflector],
  exports: [CodingService, QaAutomationSandboxService],
})
export class CodingModule {}
