import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger, Inject } from "@nestjs/common";
import { Job } from "bullmq";

import { SessionStatusPort } from "@app/common/ports/session-status.port";

/**
 * GraceWindowProcessor — auto-submits a session after the grace window expires.
 *
 * Each job carries { sessionId: string } and is enqueued by SessionService.markDisconnected()
 * with:
 *   delay: GRACE_WINDOW_SECONDS * 1000
 *   jobId: `grace-${sessionId}`   ← deterministic, prevents duplicates
 *
 * On execution, the processor calls SessionStatusPort.autoSubmit(), which:
 *   - Is a no-op if the session is no longer DISCONNECTED (candidate resumed)
 *   - Transitions to AUTO_SUBMITTED if still DISCONNECTED
 *   - Writes an AUTO_SUBMITTED EventLog entry
 *
 * Idempotency is guaranteed by autoSubmit()'s status check — re-running this
 * job after the session is already AUTO_SUBMITTED or SUBMITTED does nothing.
 */
@Processor("grace-window")
export class GraceWindowProcessor extends WorkerHost {
  private readonly logger = new Logger(GraceWindowProcessor.name);

  constructor(
    @Inject(SessionStatusPort)
    private readonly sessionStatusPort: SessionStatusPort,
  ) {
    super();
  }

  async process(job: Job<{ sessionId: string }>): Promise<void> {
    const { sessionId } = job.data;
    this.logger.log(
      `grace-window job ${job.id}: auto-submit check for session ${sessionId}`,
    );

    await this.sessionStatusPort.autoSubmit(sessionId);
  }
}
