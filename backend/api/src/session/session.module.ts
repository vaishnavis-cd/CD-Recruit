import { Module } from "@nestjs/common";
import { SessionController } from "./session.controller";
import { SessionService } from "./session.service";
import { SessionLifecycleService } from "./session-lifecycle.service";
import { SessionStateMachine } from "./session-state-machine";
import { SessionScoringService } from "./session-scoring.service";
import { AuthModule } from "@app/auth/auth.module";
import { CandidateModule } from "@app/candidate/candidate.module";
import { SimulationModule } from "../simulation/simulation.module";
import { SettingsModule } from "../settings/settings.module";
import { SessionStatusPort } from "@app/common/ports/session-status.port";

@Module({
  imports: [AuthModule, CandidateModule, SimulationModule, SettingsModule],
  controllers: [SessionController],
  providers: [
    SessionService,
    {
      provide: SessionStatusPort,
      useExisting: SessionService,
    },
    SessionLifecycleService,
    SessionStateMachine,
    SessionScoringService,
  ],
  exports: [
    SessionService,
    SessionStatusPort,
    SessionLifecycleService,
    SessionStateMachine,
    SessionScoringService,
  ],
})
export class SessionModule {}
