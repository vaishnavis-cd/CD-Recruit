import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";

/**
 * SessionOwnerGuard — verifies that the :sessionId route param belongs to
 * the authenticated candidate making the request.
 *
 * Stubbed for Phase 1 scaffold.  Implementation in Phase 1:
 *   1. Extract sessionId from request.params
 *   2. Extract candidateId from the verified JWT on request.user
 *   3. Query Prisma: session.candidateId === candidateId
 *   4. Return false (→ 403) if mismatch
 *
 * Applied with @UseGuards(SessionOwnerGuard) on any route that addresses a
 * session by ID — heartbeat, resume, progress, close, responses, events.
 */
@Injectable()
export class SessionOwnerGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    // TODO Phase 1: implement ownership check
    return true;
  }
}
