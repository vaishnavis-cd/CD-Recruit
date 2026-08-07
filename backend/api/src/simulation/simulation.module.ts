import { Module } from "@nestjs/common";
import { SimulationController } from "./simulation.controller";
import { SimulationService } from "./simulation.service";
import { SessionLogService } from "./session-log.service";
import { CompetencyEngine } from "./competency-engine";
import { EventGenerationService } from "./event-generation.service";
import { SandboxOrchestratorService } from "./sandbox/sandbox-orchestrator.service";
import { ScenarioOrchestratorService } from "./scenario-orchestrator.service";
import { SimulationTelemetryService } from "./simulation-telemetry.service";
import { ContextSimulationEvaluatorService } from "./context-simulation-evaluator.service";
import { AIScenarioGeneratorService } from "./scenario-generator.service";
import { AiEvaluationModule } from "../integrations/ai/ai-evaluation.module";

@Module({
  imports: [AiEvaluationModule],
  controllers: [SimulationController],
  providers: [
    SimulationService,
    SessionLogService,
    CompetencyEngine,
    EventGenerationService,
    SandboxOrchestratorService,
    ScenarioOrchestratorService,
    SimulationTelemetryService,
    ContextSimulationEvaluatorService,
    AIScenarioGeneratorService,
  ],
  exports: [
    SimulationService,
    SandboxOrchestratorService,
    ScenarioOrchestratorService,
    SimulationTelemetryService,
    ContextSimulationEvaluatorService,
    AIScenarioGeneratorService,
  ],
})
export class SimulationModule {}
