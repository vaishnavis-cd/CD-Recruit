import { Module, forwardRef } from "@nestjs/common";
import { SessionController } from "./session.controller";
import { SessionService } from "./session.service";
import { AuthModule } from "@app/auth/auth.module";
import { CandidateModule } from "@app/candidate/candidate.module";
import { QueueModule } from "@app/queue/queue.module";

/**
 * SessionModule — owns the full session lifecycle.
 *
 * Imports:
 *   AuthModule      — provides JwtService for invite-token verification
 *   CandidateModule — provides CandidateService for findOrCreate on token redemption
 *   QueueModule     — exports BullModule tokens; SessionService injects grace-window queue
 *
 * Circular dependency: QueueModule imports SessionModule for its processors.
 * Resolved via forwardRef.
 *
 * PrismaService and ConfigService are global — no explicit import needed.
 */
@Module({
  imports: [AuthModule, CandidateModule, forwardRef(() => QueueModule)],
  controllers: [SessionController],
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}
