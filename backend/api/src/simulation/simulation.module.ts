import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { SimulationController } from "./simulation.controller";
import { SimulationService } from "./simulation.service";
import { SessionLogService } from "./session-log.service";
import { CompetencyEngine } from "./competency-engine";
import { EventGenerationService } from "./event-generation.service";
import { CorrelationEngineClient } from "../common/correlation-engine.client";
import { CorrelationGradingService } from "./correlation-grading.service";
import {
  CorrelationGradingProcessor,
  CORRELATION_GRADING_QUEUE,
} from "./correlation-grading.processor";

const infraMode = process.env.INFRA_MODE ?? "local";
const isFull = infraMode === "full";

@Module({
  imports: [
    ...(isFull
      ? [BullModule.registerQueue({ name: CORRELATION_GRADING_QUEUE })]
      : []),
  ],
  controllers: [SimulationController],
  providers: [
    SimulationService,
    SessionLogService,
    CompetencyEngine,
    EventGenerationService,
    CorrelationEngineClient,
    CorrelationGradingService,
    ...(isFull ? [CorrelationGradingProcessor] : []),
  ],
  exports: [SimulationService, CorrelationEngineClient, CorrelationGradingService],
})
export class SimulationModule {}
