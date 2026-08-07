import { Module, forwardRef } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ThrottlerModule } from "@nestjs/throttler";
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
import { InviteTokenRateLimitGuard } from "@app/common/guards/invite-token-rate-limit.guard";

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 10 }]),
    AuthModule,
    CandidateModule,
    forwardRef(() => QueueModule),
    SimulationModule,
    SettingsModule,
  ],
  controllers: [SessionController],
  providers: [
    Reflector,
    InviteTokenRateLimitGuard,
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
