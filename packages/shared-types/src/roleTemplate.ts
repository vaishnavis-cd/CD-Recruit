// Mirrors the RoleTemplate Prisma model.
// Kept separate from session.ts so it can be imported by seeding utilities
// and the admin panel without pulling in session-lifecycle types.

export interface RoleTemplate {
  id: string;
  roleName: string;
  /**
   * Weights keyed by ModuleType string value, e.g. { MCQ: 0.15, CODING: 0.30, ... }.
   * Values sum to 1.0. Used by the Correlation Engine (Phase 10) to compute compositeScore.
   */
  weightingPreset: Record<string, number>;
  /**
   * Maximum assessment duration in minutes.
   * Session.deadlineAt = Session.startedAt + durationMinutes.
   */
  durationMinutes: number;
}
