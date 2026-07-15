import { Controller, Get, HttpCode, HttpStatus } from "@nestjs/common";

/**
 * HealthController — lightweight liveness probe.
 *
 * GET /api/v1/health
 *
 * Used by Docker healthchecks, CI pipelines, and Phase 0 smoke-testing.
 * Returns 200 as long as the NestJS process is alive and the DI graph
 * bootstrapped without errors.
 *
 * Deep readiness checks (Prisma connectivity, Redis reachability) are
 * deferred to a later phase — this endpoint intentionally stays trivial
 * so a boot failure is obvious without noise from dependency checks.
 */
@Controller("health")
export class HealthController {
  @Get()
  @HttpCode(HttpStatus.OK)
  check(): { status: string; timestamp: string } {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
    };
  }
}
