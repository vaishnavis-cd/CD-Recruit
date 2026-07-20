import { Module } from "@nestjs/common";
import { SimulationController } from "./simulation.controller";
import { SimulationService } from "./simulation.service";
import { SessionLogService } from "./session-log.service";
import { CompetencyEngine } from "./competency-engine";
import { EventGenerationService } from "./event-generation.service";
import { CorrelationEngineClient } from "../common/correlation-engine.client";

@Module({
  controllers: [SimulationController],
  providers: [
    SimulationService,
    SessionLogService,
    CompetencyEngine,
    EventGenerationService,
    CorrelationEngineClient,
  ],
  exports: [SimulationService, CorrelationEngineClient],
})
export class SimulationModule {}
