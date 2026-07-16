import { Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";

/**
 * InviteTokenRateLimitGuard — rate-limits POST /sessions/start.
 *
 * Extends ThrottlerGuard (from @nestjs/throttler) so ThrottlerModule's
 * global configuration (ttl + limit) applies automatically.
 *
 * Applied with @UseGuards(InviteTokenRateLimitGuard) on SessionController.start().
 *
 * The same pattern is reused in Phase 5 on POST /sessions/:id/events to
 * prevent a buggy client from flooding the EventLog table.
 */
@Injectable()
export class InviteTokenRateLimitGuard extends ThrottlerGuard {}
