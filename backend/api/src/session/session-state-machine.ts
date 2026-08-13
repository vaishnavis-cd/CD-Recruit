import { Injectable, ConflictException, UnprocessableEntityException } from "@nestjs/common";
import { SessionStatus } from "@prisma/client";

export type SessionState = SessionStatus;

@Injectable()
export class SessionStateMachine {
  /**
   * Validate state transition and return new target state.
   */
  transition(currentStatus: SessionStatus, targetStatus: SessionStatus): SessionStatus {
    const validTransitions: Record<SessionStatus, SessionStatus[]> = {
      [SessionStatus.NOT_STARTED]: [SessionStatus.IN_PROGRESS, SessionStatus.CLOSED],
      [SessionStatus.IN_PROGRESS]: [SessionStatus.DISCONNECTED, SessionStatus.SUBMITTED, SessionStatus.AUTO_SUBMITTED, SessionStatus.CLOSED],
      [SessionStatus.DISCONNECTED]: [SessionStatus.IN_PROGRESS, SessionStatus.AUTO_SUBMITTED, SessionStatus.CLOSED],
      [SessionStatus.SUBMITTED]: [SessionStatus.CLOSED],
      [SessionStatus.AUTO_SUBMITTED]: [SessionStatus.CLOSED],
      [SessionStatus.ABANDONED]: [SessionStatus.CLOSED],
      [SessionStatus.CLOSED]: [],
    };

    const allowed = validTransitions[currentStatus] || [];
    if (!allowed.includes(targetStatus)) {
      throw new ConflictException({
        code: "INVALID_STATE_TRANSITION",
        message: `Cannot transition session state from ${currentStatus} to ${targetStatus}.`,
      });
    }

    return targetStatus;
  }

  assertCanSubmit(currentStatus: SessionStatus) {
    if (currentStatus !== SessionStatus.IN_PROGRESS && currentStatus !== SessionStatus.DISCONNECTED) {
      throw new UnprocessableEntityException({
        code: "SESSION_NOT_IN_PROGRESS",
        message: `Session cannot accept submissions in status: ${currentStatus}.`,
      });
    }
  }
}
