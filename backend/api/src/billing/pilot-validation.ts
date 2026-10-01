import "dotenv/config";
import { PrismaService } from "../prisma/prisma.service";
import { ShadowReconciliationService } from "./shadow-reconciliation.service";
import { ShadowTelemetryService } from "./shadow-telemetry.service";
import { LedgerService } from "./ledger.service";

async function runPilotValidation() {
  console.log("================================================================================");
  console.log("PROCTORA — Phase 2: Live Pilot Telemetry, Reconciliation & Exit Gate Validation");
  console.log("================================================================================\n");

  const prisma = new PrismaService();
  await prisma.$connect();

  const ledgerService = new LedgerService(prisma);
  const reconciliationService = new ShadowReconciliationService(prisma);
  const telemetryService = new ShadowTelemetryService(prisma, reconciliationService);

  try {
    // 1. Database State & Trigger Check
    console.log("[1/5] Checking Database Guard Triggers & Invariants...");
    const triggers = await prisma.$queryRawUnsafe<any[]>(
      `SELECT trigger_name, event_manipulation, event_object_table FROM information_schema.triggers WHERE trigger_name LIKE '%guard%' OR trigger_name LIKE '%forbid%'`,
    );
    console.log("Active Database Triggers:", triggers.map((t) => `${t.trigger_name} ON ${t.event_object_table} (${t.event_manipulation})`));

    const enforcementTrigger = triggers.find((t) => t.trigger_name === "trg_guard_session_start");
    console.log(`Phase 3 Enforcement Trigger (trg_guard_session_start) Active: ${!!enforcementTrigger ? "YES (VIOLATION)" : "NO (CORRECT)"}`);

    // 2. Query Real Database Attempt & Ledger Counts
    console.log("\n[2/5] Inspecting Live Attempt & Ledger Counts...");
    const sessionCounts = await prisma.session.groupBy({
      by: ["status", "kind"],
      _count: { id: true },
    });
    console.log("Live Session Counts by Status & Kind:", sessionCounts);

    const shadowLedgerCount = await prisma.creditLedgerEntry.count({
      where: { shadow: true },
    });
    const realLedgerCount = await prisma.creditLedgerEntry.count({
      where: { shadow: false },
    });
    console.log(`Total Shadow Ledger Entries: ${shadowLedgerCount}`);
    console.log(`Total Real Ledger Entries: ${realLedgerCount}`);

    // 3. Run Authoritative Shadow Reconciliation
    console.log("\n[3/5] Executing Shadow Reconciliation...");
    const reconReport = await reconciliationService.reconcileShadowBilling();
    console.log("Reconciliation Summary:", {
      totalEligibleSessions: reconReport.totalEligibleSessions,
      totalShadowEntries: reconReport.totalShadowEntries,
      matchedCount: reconReport.matchedCount,
      discrepancyCount: reconReport.discrepancyCount,
      accuracyPercentage: `${reconReport.accuracyPercentage}%`,
    });
    if (reconReport.discrepancies.length > 0) {
      console.log("Detected Discrepancies:");
      reconReport.discrepancies.forEach((d, i) => {
        console.log(`  [${i + 1}] Type: ${d.discrepancyType} | Session: ${d.sessionId ?? "N/A"} | Details: ${d.details}`);
      });
    }

    // 4. Run Telemetry Aggregation & Cost Measurement
    console.log("\n[4/5] Aggregating Telemetry & AI Token Cost Distribution...");
    const metrics = await telemetryService.getShadowMetrics();
    console.log("Telemetry Metrics:", {
      totalEligibleCandidateAttempts: metrics.totalEligibleCandidateAttempts,
      totalSuccessfullyEvaluatedAttempts: metrics.totalSuccessfullyEvaluatedAttempts,
      shadowBillingFailures: metrics.shadowBillingFailures,
      shadowAcquisitionOutcomes: metrics.shadowAcquisitionOutcomes,
      poolSelectionDistribution: metrics.poolSelectionDistribution,
      duplicateEntryCount: metrics.duplicateEntryCount,
      reconciliationAccuracy: `${metrics.reconciliationAccuracy}%`,
      shadowLatencyMs: metrics.shadowLatencyMs,
      errorRatePercentage: `${metrics.errorRatePercentage}%`,
      costDistribution: metrics.costDistribution,
    });

    // 5. Evaluate Pilot Exit Gate
    console.log("\n[5/5] Evaluating Pilot Exit Gate Against Authoritative Specification...");
    const exitGate = await telemetryService.evaluatePilotExitGate();
    console.log("Exit Gate Evaluation:", exitGate);

    console.log("\n================================================================================");
    console.log(`Pilot Gate Verdict: ${exitGate.verdict}`);
    console.log("================================================================================\n");
  } finally {
    await prisma.$disconnect();
  }
}

runPilotValidation().catch((err) => {
  console.error("Pilot validation failed:", err);
  process.exit(1);
});
