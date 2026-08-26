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
import { SimulationModule } from "../simulation/simulation.module";
import { SettingsModule } from "../settings/settings.module";
import { QueueModule } from "../queue/queue.module";
import { SessionStatusPort } from "@app/common/ports/session-status.port";
import { InviteTokenRateLimitGuard } from "@app/common/guards/invite-token-rate-limit.guard";
import { FaceVerifyOnnxModule } from "@app/integrations/face-verify-onnx/face-verify-onnx.module";
import { OcrModule } from "@app/integrations/ocr/ocr.module";

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 10 }]),
    AuthModule,
    CandidateModule,
    forwardRef(() => QueueModule),
    SimulationModule,
    SettingsModule,
    FaceVerifyOnnxModule,
    OcrModule,
  ],
  controllers: [SessionController],
  providers: [
    Reflector,
    InviteTokenRateLimitGuard,
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
