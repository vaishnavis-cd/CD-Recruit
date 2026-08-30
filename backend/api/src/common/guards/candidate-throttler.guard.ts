import { Injectable, ExecutionContext } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";

/**
 * CandidateThrottlerGuard — Rate-limits candidate actions (e.g. Run Code, Submit).
 *
 * Overrides default IP-based tracking to track by candidate sessionId or authenticated user ID.
 * This prevents candidates sharing a physical network/NAT (such as a college lab or walk-in drive)
 * from exhausting each other's rate limit budget.
 */
@Injectable()
export class CandidateThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    let key = "unknown";
    // 1. Prefer sessionId from request body or headers
    if (req.body?.sessionId) {
      key = `session:${req.body.sessionId}`;
    } else if (req.headers && req.headers["x-session-id"]) {
      key = `session:${req.headers["x-session-id"]}`;
    } else if (req.user?.sessionId) {
      key = `session:${req.user.sessionId}`;
    } else if (req.user?.sub || req.user?.id) {
      key = `user:${req.user.sub || req.user.id}`;
    } else {
      key = `ip:${req.ip || req.socket?.remoteAddress || "unknown"}`;
    }

    return key;
  }
}
