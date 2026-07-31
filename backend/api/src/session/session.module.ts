import { Module, forwardRef } from "@nestjs/common";
import { SessionController } from "./session.controller";
import { SessionService } from "./session.service";
import { SessionLifecycleService } from "./session-lifecycle.service";
import { SessionStateMachine } from "./session-state-machine";
import { SessionScoringService } from "./session-scoring.service";
import { AuthModule } from "@app/auth/auth.module";
import { CandidateModule } from "@app/candidate/candidate.module";
import { QueueModule } from "@app/queue/queue.module";
import { SimulationModule } from "../simulation/simulation.module";

import { SettingsModule } from "../settings/settings.module";

@Module({
  imports: [AuthModule, CandidateModule, forwardRef(() => QueueModule), SimulationModule, SettingsModule],
  controllers: [SessionController],
  providers: [
    SessionService,
    SessionLifecycleService,
    SessionStateMachine,
    SessionScoringService,
  ],
  exports: [
    SessionService,
    SessionLifecycleService,
    SessionStateMachine,
    SessionScoringService,
  ],
})
export class SessionModule {}
