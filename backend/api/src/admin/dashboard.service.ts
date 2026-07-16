import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  InviteStatus,
  SessionStatus,
  FlagSeverity,
  ReviewDecision,
} from "@cd-recruit/shared-types";
import { DashboardStats } from "@cd-recruit/shared-types";

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboardStats(query: any = {}): Promise<DashboardStats> {
    const { driveId, roleTemplateId, reviewerStaffId, startDate, endDate } = query;
    const now = new Date();

    const invitesWhere: any = {};
    if (driveId) invitesWhere.driveId = driveId;
    if (roleTemplateId) invitesWhere.roleTemplateId = roleTemplateId;
    if (startDate && endDate) {
      invitesWhere.createdAt = { gte: new Date(startDate), lte: new Date(endDate) };
    }

    const sessionsWhere: any = {};
    if (driveId) sessionsWhere.driveId = driveId;
    if (roleTemplateId) sessionsWhere.roleTemplateId = roleTemplateId;
    if (startDate && endDate) {
      sessionsWhere.startedAt = { gte: new Date(startDate), lte: new Date(endDate) };
    }

    const scoresWhere: any = { session: {} };
    if (driveId) scoresWhere.session.driveId = driveId;
    if (roleTemplateId) scoresWhere.session.roleTemplateId = roleTemplateId;
    if (startDate && endDate) {
      scoresWhere.session.startedAt = { gte: new Date(startDate), lte: new Date(endDate) };
    }

    const flagsWhere: any = { session: {} };
    if (driveId) flagsWhere.session.driveId = driveId;
    if (roleTemplateId) flagsWhere.session.roleTemplateId = roleTemplateId;

    const decisionsWhere: any = {};
    if (reviewerStaffId) decisionsWhere.staffId = reviewerStaffId;
    if (driveId || roleTemplateId || (startDate && endDate)) {
      decisionsWhere.session = {};
      if (driveId) decisionsWhere.session.driveId = driveId;
      if (roleTemplateId) decisionsWhere.session.roleTemplateId = roleTemplateId;
      if (startDate && endDate) {
        decisionsWhere.session.startedAt = { gte: new Date(startDate), lte: new Date(endDate) };
      }
    }

    const responsesWhere: any = { session: {} };
    if (driveId) responsesWhere.session.driveId = driveId;
    if (roleTemplateId) responsesWhere.session.roleTemplateId = roleTemplateId;

    // Fetch baseline metrics
    const [
      totalSessions,
      totalCandidates,
      invites,
      sessions,
      scores,
      flags,
      decisions,
      responses,
    ] = await Promise.all([
      this.prisma.session.count({ where: sessionsWhere }),
      this.prisma.candidate.count(),
      this.prisma.invite.findMany({
        where: invitesWhere,
        include: { roleTemplate: true },
      }),
      this.prisma.session.findMany({
        where: sessionsWhere,
        include: { roleTemplate: true, score: true },
      }),
      this.prisma.score.findMany({
        where: scoresWhere,
        include: {
          session: {
            include: {
              reviewerDecision: true,
            },
          },
        },
      }),
      this.prisma.integrityFlag.findMany({
        where: flagsWhere,
        include: {
          evidenceClip: true,
          session: true,
        },
      }),
      this.prisma.reviewerDecision.findMany({
        where: decisionsWhere,
      }),
      this.prisma.moduleResponse.findMany({
        where: responsesWhere,
        include: { question: true },
      }),
    ]);

    // ── 1. Funnel / Pipeline Metrics ─────────────────────────────────────
    const invitesByStatus = {
      [InviteStatus.PENDING]: 0,
      [InviteStatus.REDEEMED]: 0,
      [InviteStatus.EXPIRED]: 0,
      [InviteStatus.REVOKED]: 0,
    };

    invites.forEach((inv) => {
      // Check if pending has expired
      let status = inv.status as InviteStatus;
      if (status === InviteStatus.PENDING && inv.expiresAt < now) {
        status = InviteStatus.EXPIRED;
      }
      invitesByStatus[status] = (invitesByStatus[status] || 0) + 1;
    });

    const totalInvites = invites.length;
    const startedSessionsCount = sessions.filter(
      (s) => s.status !== SessionStatus.NOT_STARTED,
    ).length;
    const completedSessionsCount = sessions.filter((s) =>
      [
        SessionStatus.SUBMITTED,
        SessionStatus.CLOSED,
        SessionStatus.AUTO_SUBMITTED,
      ].includes(s.status as SessionStatus),
    ).length;

    const conversionRates = {
      invitedToStarted:
        totalInvites > 0
          ? Math.round((startedSessionsCount / totalInvites) * 100)
          : 0,
      startedToCompleted:
        startedSessionsCount > 0
          ? Math.round((completedSessionsCount / startedSessionsCount) * 100)
          : 0,
      overall:
        totalInvites > 0
          ? Math.round((completedSessionsCount / totalInvites) * 100)
          : 0,
    };

    // Completion rate by role template
    const roleStats: Record<string, { total: number; completed: number }> = {};
    sessions.forEach((s) => {
      const name = s.roleTemplate.roleName;
      if (!roleStats[name]) {
        roleStats[name] = { total: 0, completed: 0 };
      }
      roleStats[name].total += 1;
      const isCompleted = [
        SessionStatus.SUBMITTED,
        SessionStatus.CLOSED,
        SessionStatus.AUTO_SUBMITTED,
      ].includes(s.status as SessionStatus);
      if (isCompleted) {
        roleStats[name].completed += 1;
      }
    });

    const completionByRole = Object.entries(roleStats).map(
      ([roleTemplateName, stat]) => ({
        roleTemplateName,
        total: stat.total,
        completionRate:
          stat.total > 0 ? Math.round((stat.completed / stat.total) * 100) : 0,
      }),
    );

    // Avg time to start in hours
    const startTimes = invites
      .filter((inv) => inv.redeemedAt !== null)
      .map(
        (inv) =>
          (inv.redeemedAt!.getTime() - inv.createdAt.getTime()) /
          (1000 * 60 * 60),
      );
    const avgTimeToStartHours =
      startTimes.length > 0
        ? Math.round(
            (startTimes.reduce((a, b) => a + b, 0) / startTimes.length) * 10,
          ) / 10
        : null;

    // ── 2. Score Distribution & Calibration ──────────────────────────────
    const compositeHistogramBuckets = Array.from({ length: 10 }, (_, i) => ({
      bucket: `${i * 10}-${(i + 1) * 10}%`,
      count: 0,
    }));

    let totalCompositeScore = 0;
    let scoredCount = 0;
    let passedCount = 0;
    const moduleScoresSum: Record<string, number> = {};
    const moduleScoresCount: Record<string, number> = {};

    scores.forEach((sc) => {
      const scorePct = sc.compositeScore * 100;
      totalCompositeScore += scorePct;
      scoredCount += 1;

      // Histogram
      const bucketIdx = Math.min(Math.floor(scorePct / 10), 9);
      compositeHistogramBuckets[bucketIdx].count += 1;

      // Pass rate (threshold 70%)
      if (scorePct >= 70) {
        passedCount += 1;
      }

      // Modules
      const modScores = sc.moduleScores as Record<string, number>;
      if (modScores && typeof modScores === "object") {
        Object.entries(modScores).forEach(([mod, val]) => {
          moduleScoresSum[mod] = (moduleScoresSum[mod] ?? 0) + val;
          moduleScoresCount[mod] = (moduleScoresCount[mod] ?? 0) + 1;
        });
      }
    });

    const compositeHistogram = compositeHistogramBuckets;
    const avgCompositeScore =
      scoredCount > 0 ? Math.round(totalCompositeScore / scoredCount) : null;
    const passRate =
      scoredCount > 0 ? Math.round((passedCount / scoredCount) * 100) : null;

    const moduleAverages: Record<string, number> = {};
    Object.keys(moduleScoresSum).forEach((mod) => {
      moduleAverages[mod] =
        Math.round((moduleScoresSum[mod] / moduleScoresCount[mod]) * 100) / 100;
    });

    // AI Confidence Distribution
    const aiConfidences = scores.map((sc) => sc.aiConfidence);
    const lowConfidenceThreshold = 0.8;
    const aiConfidenceDistribution = {
      highConfidence: aiConfidences.filter((c) => c >= lowConfidenceThreshold)
        .length,
      lowConfidence: aiConfidences.filter((c) => c < lowConfidenceThreshold)
        .length,
      avgConfidence:
        aiConfidences.length > 0
          ? Math.round(
              (aiConfidences.reduce((a, b) => a + b, 0) /
                aiConfidences.length) *
                100,
            ) / 100
          : null,
    };

    // ── 3. Say-Do Consistency Score ──────────────────────────────────────
    const sayDoHistogramBuckets = Array.from({ length: 10 }, (_, i) => ({
      bucket: `${i * 10}-${(i + 1) * 10}%`,
      count: 0,
    }));

    let sayDoSum = 0;
    scores.forEach((sc) => {
      const scorePct = sc.sayDoConsistencyScore * 100;
      sayDoSum += scorePct;
      const bucketIdx = Math.min(Math.floor(scorePct / 10), 9);
      sayDoHistogramBuckets[bucketIdx].count += 1;
    });

    const sayDoHistogram = sayDoHistogramBuckets;
    const avgSayDoScore =
      scoredCount > 0 ? Math.round(sayDoSum / scoredCount) : null;

    // Pearson correlation
    let correlationWithComposite: number | null = null;
    if (scoredCount > 1) {
      const x = scores.map((sc) => sc.compositeScore);
      const y = scores.map((sc) => sc.sayDoConsistencyScore);
      const n = scoredCount;
      let sumX = 0,
        sumY = 0,
        sumXY = 0,
        sumX2 = 0,
        sumY2 = 0;
      for (let i = 0; i < n; i++) {
        sumX += x[i];
        sumY += y[i];
        sumXY += x[i] * y[i];
        sumX2 += x[i] * x[i];
        sumY2 += y[i] * y[i];
      }
      const num = n * sumXY - sumX * sumY;
      const den = Math.sqrt(
        (n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY),
      );
      correlationWithComposite =
        den !== 0 ? Math.round((num / den) * 100) / 100 : null;
    }

    // Say-Do vs Decision
    let sayDoSumAdvanced = 0,
      countAdvanced = 0;
    let sayDoSumRejected = 0,
      countRejected = 0;

    scores.forEach((sc) => {
      const decision = sc.session.reviewerDecision?.decision;
      if (decision === ReviewDecision.ADVANCE) {
        sayDoSumAdvanced += sc.sayDoConsistencyScore * 100;
        countAdvanced += 1;
      } else if (decision === ReviewDecision.REJECT) {
        sayDoSumRejected += sc.sayDoConsistencyScore * 100;
        countRejected += 1;
      }
    });

    const sayDoVsDecision = {
      avgScoreAdvanced:
        countAdvanced > 0 ? Math.round(sayDoSumAdvanced / countAdvanced) : null,
      avgScoreRejected:
        countRejected > 0 ? Math.round(sayDoSumRejected / countRejected) : null,
    };

    // ── 4. Time-Based Metrics ───────────────────────────────────────────
    const durations = sessions
      .filter((s) => s.startedAt && s.submittedAt)
      .map(
        (s) =>
          (s.submittedAt!.getTime() - s.startedAt!.getTime()) / (1000 * 60),
      ); // minutes

    const avgSessionDurationMinutes =
      durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : null;

    // Time per module
    const moduleTimesSum: Record<string, number> = {};
    const moduleTimesCount: Record<string, number> = {};
    responses.forEach((res) => {
      if (res.timeSpentSeconds) {
        const type = res.question.moduleType;
        moduleTimesSum[type] =
          (moduleTimesSum[type] ?? 0) + res.timeSpentSeconds;
        moduleTimesCount[type] = (moduleTimesCount[type] ?? 0) + 1;
      }
    });

    const avgTimePerModule: Record<string, number> = {};
    Object.keys(moduleTimesSum).forEach((type) => {
      avgTimePerModule[type] = Math.round(
        moduleTimesSum[type] / moduleTimesCount[type],
      );
    });

    // Duration vs Allotted
    let less50 = 0,
      bet50_80 = 0,
      bet80_100 = 0,
      exceeded = 0;
    sessions.forEach((s) => {
      if (s.startedAt && s.submittedAt) {
        const duration =
          (s.submittedAt.getTime() - s.startedAt.getTime()) / (1000 * 60);
        const allotted = s.roleTemplate.durationMinutes;
        const pct = (duration / allotted) * 100;

        if (s.status === SessionStatus.AUTO_SUBMITTED && pct >= 98) {
          exceeded += 1;
        } else if (pct < 50) {
          less50 += 1;
        } else if (pct <= 80) {
          bet50_80 += 1;
        } else {
          bet80_100 += 1;
        }
      }
    });

    const durationVsAllotted = {
      usedLessThan50Pct: less50,
      used50to80Pct: bet50_80,
      used80to100Pct: bet80_100,
      exceededDeadline: exceeded,
    };

    // Durations Outliers (suspiciously fast/slow)
    let fast = 0,
      slow = 0;
    if (durations.length >= 4) {
      durations.sort((a, b) => a - b);
      const q1 = durations[Math.floor(durations.length * 0.25)];
      const q3 = durations[Math.floor(durations.length * 0.75)];
      const iqr = q3 - q1;
      const lowerBound = q1 - 1.5 * iqr;
      const upperBound = q3 + 1.5 * iqr;

      fast = durations.filter((d) => d < lowerBound).length;
      slow = durations.filter((d) => d > upperBound).length;
    }

    const outlierCount = { fast, slow };

    // ── 5. Integrity / Proctoring Metrics ───────────────────────────────
    const flagsByCategory: Record<string, number> = {};
    const flagsBySeverity: Record<string, number> = {};

    flags.forEach((f) => {
      flagsByCategory[f.category] = (flagsByCategory[f.category] ?? 0) + 1;
      flagsBySeverity[f.severity] = (flagsBySeverity[f.severity] ?? 0) + 1;
    });

    // Flags by CV mode
    const cvModes = {
      FULL: { sessions: 0, flags: 0 },
      REDUCED: { sessions: 0, flags: 0 },
    };

    sessions.forEach((s) => {
      const mode = s.cvMode === "FULL" ? "FULL" : "REDUCED";
      cvModes[mode].sessions += 1;
    });

    flags.forEach((f) => {
      const mode = f.session.cvMode === "FULL" ? "FULL" : "REDUCED";
      cvModes[mode].flags += 1;
    });

    const flagRateByCvMode = {
      full: {
        sessionCount: cvModes.FULL.sessions,
        totalFlags: cvModes.FULL.flags,
        avgFlagsPerSession:
          cvModes.FULL.sessions > 0
            ? Math.round((cvModes.FULL.flags / cvModes.FULL.sessions) * 10) / 10
            : 0,
      },
      reduced: {
        sessionCount: cvModes.REDUCED.sessions,
        totalFlags: cvModes.REDUCED.flags,
        avgFlagsPerSession:
          cvModes.REDUCED.sessions > 0
            ? Math.round(
                (cvModes.REDUCED.flags / cvModes.REDUCED.sessions) * 10,
              ) / 10
            : 0,
      },
    };

    const flagsWithClip = flags.filter((f) => f.evidenceClip !== null).length;
    const evidenceClipCaptureRate =
      flags.length > 0
        ? Math.round((flagsWithClip / flags.length) * 100)
        : null;

    // Dispositions
    const dispositionBreakdown = {
      confirmed: flags.filter((f) => f.disposition === "CONFIRMED").length,
      falsePositive: flags.filter((f) => f.disposition === "FALSE_POSITIVE")
        .length,
      unreviewed: flags.filter((f) => f.disposition === null).length,
    };

    // ── 6. Reviewer / Human-in-the-Loop Metrics ────────────────────────
    const autoScored = scores.filter((sc) => !sc.humanReviewed).length;
    const humanReviewed = scores.filter((sc) => sc.humanReviewed).length;
    const autoVsHumanReviewed = { autoScored, humanReviewed };

    const decCount = {
      [ReviewDecision.ADVANCE]: decisions.filter(
        (d) => d.decision === ReviewDecision.ADVANCE,
      ).length,
      [ReviewDecision.REJECT]: decisions.filter(
        (d) => d.decision === ReviewDecision.REJECT,
      ).length,
    };
    const pendingDecCount = sessions.filter(
      (s) =>
        [SessionStatus.SUBMITTED, SessionStatus.AUTO_SUBMITTED].includes(
          s.status as SessionStatus,
        ) && !s.score?.humanReviewed,
    ).length;

    const decisionsStats = {
      advanced: decCount[ReviewDecision.ADVANCE],
      rejected: decCount[ReviewDecision.REJECT],
      pending: pendingDecCount,
    };

    // Review Turnaround Time
    const turnaroundTimes = scores
      .filter((sc) => sc.humanReviewed && sc.session.submittedAt)
      .map((sc) => {
        const decisionMatch = decisions.find(
          (d) => d.sessionId === sc.sessionId,
        );
        if (decisionMatch) {
          return (
            (decisionMatch.decidedAt.getTime() -
              sc.session.submittedAt!.getTime()) /
            (1000 * 60 * 60)
          );
        }
        return null;
      })
      .filter((t) => t !== null) as number[];

    const avgReviewTurnaroundHours =
      turnaroundTimes.length > 0
        ? Math.round(
            (turnaroundTimes.reduce((a, b) => a + b, 0) /
              turnaroundTimes.length) *
              10,
          ) / 10
        : null;

    const sessionsAwaitingReview = sessions.filter(
      (s) =>
        [SessionStatus.SUBMITTED, SessionStatus.AUTO_SUBMITTED].includes(
          s.status as SessionStatus,
        ) &&
        (!s.score || !s.score.humanReviewed),
    ).length;

    return {
      funnel: {
        invitesByStatus,
        conversionRates,
        completionByRole,
        avgTimeToStartHours,
      },
      scores: {
        compositeHistogram,
        moduleAverages,
        avgCompositeScore,
        passRate,
        aiConfidenceDistribution,
      },
      sayDo: {
        histogram: sayDoHistogram,
        avgScore: avgSayDoScore,
        correlationWithComposite,
        sayDoVsDecision,
      },
      timing: {
        avgSessionDurationMinutes,
        avgTimePerModule,
        durationVsAllotted,
        outlierCount,
      },
      integrity: {
        flagsByCategory,
        flagsBySeverity,
        flagRateByCvMode,
        evidenceClipCaptureRate,
        dispositionBreakdown,
      },
      reviewer: {
        autoVsHumanReviewed,
        decisions: decisionsStats,
        avgReviewTurnaroundHours,
        sessionsAwaitingReview,
      },
      predictiveValidity: {
        dataAvailable: false,
        message:
          "Predictive validity tracking — pending outcome data ingestion",
      },
      generatedAt: new Date().toISOString(),
      totalSessions,
      totalCandidates,
    };
  }

  async getActionQueue() {
    const next24h = new Date();
    next24h.setDate(next24h.getDate() + 1);

    const next7days = new Date();
    next7days.setDate(next7days.getDate() + 7);

    const [pendingReviews, expiringInvites, closingDrives] = await Promise.all([
      // Sessions awaiting human review
      this.prisma.session.findMany({
        where: {
          status: { in: [SessionStatus.SUBMITTED, SessionStatus.AUTO_SUBMITTED] },
          score: {
            humanReviewed: false,
            aiConfidence: { lt: 0.8 },
          },
        },
        include: { candidate: true, roleTemplate: true, score: true },
        take: 5,
        orderBy: { submittedAt: "desc" },
      }),

      // Invites expiring in the next 24h
      this.prisma.invite.findMany({
        where: {
          status: "PENDING",
          expiresAt: { gte: new Date(), lte: next24h },
        },
        include: { roleTemplate: true },
        take: 5,
        orderBy: { expiresAt: "asc" },
      }),

      // Drives closing this week
      this.prisma.drive.findMany({
        where: {
          status: "ACTIVE",
          scheduleEnd: { gte: new Date(), lte: next7days },
        },
        include: { roleTemplate: true },
        take: 5,
        orderBy: { scheduleEnd: "asc" },
      }),
    ]);

    return {
      pendingReviews: pendingReviews.map((r) => ({
        sessionId: r.id,
        candidateName: r.candidate.name,
        candidateEmail: r.candidate.email,
        roleTemplateName: r.roleTemplate.roleName,
        submittedAt: r.submittedAt ? r.submittedAt.toISOString() : null,
        aiConfidence: r.score?.aiConfidence ?? null,
      })),
      expiringInvites: expiringInvites.map((i) => ({
        inviteId: i.id,
        candidateName: i.candidateName,
        candidateEmail: i.candidateEmail,
        roleTemplateName: i.roleTemplate.roleName,
        expiresAt: i.expiresAt.toISOString(),
      })),
      closingDrives: closingDrives.map((d) => ({
        driveId: d.id,
        driveName: d.name,
        roleTemplateName: d.roleTemplate.roleName,
        scheduleEnd: d.scheduleEnd ? d.scheduleEnd.toISOString() : null,
      })),
    };
  }
}
