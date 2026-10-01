import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import {
  ReconciliationRunType,
  ReconciliationRunStatus,
  ReconciliationFindingSeverity,
  ReconciliationCheckName,
  ReconciliationFinding,
  CheckExecutionResult,
  PoolIntegrityDetails,
  OverdraftIntegrityDetails,
  SessionAcquisitionDetails,
  ExpirySweeperDetails,
  TopologyDetails,
  PaymentProofDetails,
  AuditWormDetails,
  ReconciliationRunResultDto,
  ReconciliationStaffActor,
} from "./reconciliation.types";

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * CHECK 1 — Pool Integrity
   * Replays immutable ledger entries to determine authoritative pool remaining balance
   * and verifies against CreditPool.cachedRemaining, non-negativity, and lifecycle states.
   *
   * Read-only: never modifies cached balance or ledger entries.
   */
  async runPoolIntegrityCheck(client: any = this.prisma): Promise<CheckExecutionResult<PoolIntegrityDetails>> {
    const findings: ReconciliationFinding[] = [];
    const now = new Date().toISOString();

    const poolsWithLedgerSums = await (client as PrismaService).$queryRawUnsafe<any[]>(`
      SELECT 
        p.id AS pool_id,
        p.billing_account_id,
        p.status,
        p.cached_remaining,
        p.total_credits,
        COALESCE(SUM(l.amount) FILTER (WHERE l.shadow = false), 0)::integer AS ledger_derived_remaining,
        COUNT(l.id)::integer AS ledger_entry_count
      FROM "billing"."credit_pool" p
      LEFT JOIN "billing"."credit_ledger_entry" l ON l.credit_pool_id = p.id
      GROUP BY p.id, p.billing_account_id, p.status, p.cached_remaining, p.total_credits
    `);

    let mismatchedCount = 0;
    let negativeBalanceCount = 0;
    let invalidStateCount = 0;

    for (const row of poolsWithLedgerSums) {
      const cachedRemaining = Number(row.cached_remaining);
      const ledgerSum = Number(row.ledger_derived_remaining);
      const status = row.status;

      // 1. Balance match verification
      if (cachedRemaining !== ledgerSum) {
        mismatchedCount++;
        findings.push({
          checkName: ReconciliationCheckName.POOL_INTEGRITY,
          severity: ReconciliationFindingSeverity.FAILURE,
          entityType: "CreditPool",
          entityId: row.pool_id,
          expectedValue: ledgerSum,
          observedValue: cachedRemaining,
          message: `Pool ${row.pool_id} cachedRemaining (${cachedRemaining}) does not match ledger-derived balance (${ledgerSum})`,
          detectedAt: now,
          metadata: {
            billingAccountId: row.billing_account_id,
            status,
            totalCredits: Number(row.total_credits),
            ledgerEntryCount: Number(row.ledger_entry_count),
          },
        });
      }

      // 2. Non-negative balance verification
      if (cachedRemaining < 0 || ledgerSum < 0) {
        negativeBalanceCount++;
        findings.push({
          checkName: ReconciliationCheckName.POOL_INTEGRITY,
          severity: ReconciliationFindingSeverity.FAILURE,
          entityType: "CreditPool",
          entityId: row.pool_id,
          expectedValue: ">= 0",
          observedValue: { cachedRemaining, ledgerSum },
          message: `Pool ${row.pool_id} has negative balance: cachedRemaining=${cachedRemaining}, ledgerSum=${ledgerSum}`,
          detectedAt: now,
          metadata: { billingAccountId: row.billing_account_id, status },
        });
      }

      // 3. Lifecycle state compatibility
      if (status === "EXHAUSTED" && cachedRemaining > 0) {
        invalidStateCount++;
        findings.push({
          checkName: ReconciliationCheckName.POOL_INTEGRITY,
          severity: ReconciliationFindingSeverity.FAILURE,
          entityType: "CreditPool",
          entityId: row.pool_id,
          expectedValue: "cachedRemaining == 0 for EXHAUSTED pool",
          observedValue: cachedRemaining,
          message: `Pool ${row.pool_id} has status EXHAUSTED but cachedRemaining is ${cachedRemaining}`,
          detectedAt: now,
          metadata: { billingAccountId: row.billing_account_id },
        });
      }

      if (status === "ACTIVE" && cachedRemaining === 0) {
        invalidStateCount++;
        findings.push({
          checkName: ReconciliationCheckName.POOL_INTEGRITY,
          severity: ReconciliationFindingSeverity.FAILURE,
          entityType: "CreditPool",
          entityId: row.pool_id,
          expectedValue: "cachedRemaining > 0 for ACTIVE pool",
          observedValue: cachedRemaining,
          message: `Pool ${row.pool_id} has status ACTIVE but cachedRemaining is 0`,
          detectedAt: now,
          metadata: { billingAccountId: row.billing_account_id },
        });
      }

      if ((status === "CANCELLED" || status === "EXPIRED") && cachedRemaining > 0) {
        invalidStateCount++;
        findings.push({
          checkName: ReconciliationCheckName.POOL_INTEGRITY,
          severity: ReconciliationFindingSeverity.FAILURE,
          entityType: "CreditPool",
          entityId: row.pool_id,
          expectedValue: "cachedRemaining == 0 for closed pool",
          observedValue: cachedRemaining,
          message: `Pool ${row.pool_id} has status ${status} but retains ${cachedRemaining} uncancelled credits`,
          detectedAt: now,
          metadata: { billingAccountId: row.billing_account_id },
        });
      }
    }

    const checkStatus = findings.length > 0 ? ReconciliationRunStatus.FAILED : ReconciliationRunStatus.PASSED;

    return {
      checkName: ReconciliationCheckName.POOL_INTEGRITY,
      status: checkStatus,
      itemsAudited: poolsWithLedgerSums.length,
      discrepancyCount: findings.length,
      details: {
        totalPoolsAudited: poolsWithLedgerSums.length,
        poolsWithMismatchedBalance: mismatchedCount,
        poolsWithNegativeBalance: negativeBalanceCount,
        poolsWithInvalidState: invalidStateCount,
      },
      findings,
    };
  }

  /**
   * CHECK 2 — Overdraft Integrity
   * Permanent elimination of overdraft per ADR-004.
   * Verifies overdraft_limit = 0 and overdraft_used = 0 on all billing accounts,
   * and verifies no active unreversed overdraft ledger entries exist.
   */
  async runOverdraftIntegrityCheck(client: any = this.prisma): Promise<CheckExecutionResult<OverdraftIntegrityDetails>> {
    const findings: ReconciliationFinding[] = [];
    const now = new Date().toISOString();

    const accounts = await (client as PrismaService).$queryRawUnsafe<any[]>(`
      SELECT 
        id, 
        name, 
        overdraft_limit, 
        overdraft_used 
      FROM "billing"."billing_account"
    `);

    let accountsWithLimit = 0;
    let accountsWithUsed = 0;

    for (const acct of accounts) {
      const limit = Number(acct.overdraft_limit);
      const used = Number(acct.overdraft_used);

      if (limit !== 0) {
        accountsWithLimit++;
        findings.push({
          checkName: ReconciliationCheckName.OVERDRAFT_INTEGRITY,
          severity: ReconciliationFindingSeverity.FAILURE,
          entityType: "BillingAccount",
          entityId: acct.id,
          expectedValue: 0,
          observedValue: limit,
          message: `BillingAccount ${acct.id} has non-zero overdraft_limit (${limit}); overdraft permanently eliminated per ADR-004`,
          detectedAt: now,
          metadata: { accountName: acct.name },
        });
      }

      if (used !== 0) {
        accountsWithUsed++;
        findings.push({
          checkName: ReconciliationCheckName.OVERDRAFT_INTEGRITY,
          severity: ReconciliationFindingSeverity.FAILURE,
          entityType: "BillingAccount",
          entityId: acct.id,
          expectedValue: 0,
          observedValue: used,
          message: `BillingAccount ${acct.id} has non-zero overdraft_used (${used}); overdraft permanently eliminated per ADR-004`,
          detectedAt: now,
          metadata: { accountName: acct.name },
        });
      }
    }

    // Verify no unreversed OVERDRAFT entries in ledger
    const activeOverdraftEntries = await (client as PrismaService).$queryRawUnsafe<any[]>(`
      SELECT 
        l.id, 
        l.billing_account_id, 
        l.amount, 
        l.session_id 
      FROM "billing"."credit_ledger_entry" l
      WHERE l.entry_type = 'OVERDRAFT'
        AND NOT EXISTS (
          SELECT 1 FROM "billing"."credit_ledger_entry" r 
          WHERE r.related_entry_id = l.id 
            AND r.entry_type IN ('REVERSAL', 'OVERDRAFT_SETTLE')
        )
    `);

    for (const entry of activeOverdraftEntries) {
      findings.push({
        checkName: ReconciliationCheckName.OVERDRAFT_INTEGRITY,
        severity: ReconciliationFindingSeverity.FAILURE,
        entityType: "CreditLedgerEntry",
        entityId: entry.id,
        expectedValue: "Zero active overdraft entries",
        observedValue: entry.amount,
        message: `Active unreversed OVERDRAFT ledger entry ${entry.id} found on account ${entry.billing_account_id}`,
        detectedAt: now,
        metadata: {
          billingAccountId: entry.billing_account_id,
          sessionId: entry.session_id,
        },
      });
    }

    const checkStatus = findings.length > 0 ? ReconciliationRunStatus.FAILED : ReconciliationRunStatus.PASSED;

    return {
      checkName: ReconciliationCheckName.OVERDRAFT_INTEGRITY,
      status: checkStatus,
      itemsAudited: accounts.length,
      discrepancyCount: findings.length,
      details: {
        totalAccountsAudited: accounts.length,
        accountsWithOverdraftLimit: accountsWithLimit,
        accountsWithOverdraftUsed: accountsWithUsed,
        activeOverdraftLedgerEntries: activeOverdraftEntries.length,
      },
      findings,
    };
  }

  /**
   * CHECK 3 — Session Acquisition 1:1
   * Verifies that candidate session execution correlates 1:1 with credit acquisition.
   * Strictly candidate PII-free (IDs, hashes, correlation references only).
   */
  async runSessionAcquisitionCheck(client: any = this.prisma): Promise<CheckExecutionResult<SessionAcquisitionDetails>> {
    const findings: ReconciliationFinding[] = [];
    const now = new Date().toISOString();

    // Total live sessions audited
    const liveSessionsCountResult = await (client as PrismaService).$queryRawUnsafe<any[]>(`
      SELECT COUNT(*)::integer AS total
      FROM "public"."session" s
      WHERE s.kind = 'LIVE'
        AND (s.started_at IS NOT NULL OR s.status IN ('IN_PROGRESS', 'SUBMITTED', 'AUTO_SUBMITTED', 'CLOSED', 'ABANDONED', 'DISCONNECTED'))
    `);
    const totalLiveSessions = Number(liveSessionsCountResult[0]?.total ?? 0);

    // Case A: Billable session exists with no corresponding consumption
    const caseASessions = await (client as PrismaService).$queryRawUnsafe<any[]>(`
      SELECT 
        s.id AS session_id,
        s.organization_id,
        s.drive_id,
        s.status,
        s.started_at
      FROM "public"."session" s
      WHERE s.kind = 'LIVE'
        AND s.organization_id IS NOT NULL
        AND (s.started_at IS NOT NULL OR s.status IN ('IN_PROGRESS', 'SUBMITTED', 'AUTO_SUBMITTED', 'CLOSED', 'ABANDONED', 'DISCONNECTED'))
        AND NOT EXISTS (
          SELECT 1 FROM "billing"."credit_ledger_entry" l
          WHERE l.session_id = s.id 
            AND l.entry_type IN ('CONSUME', 'OVERDRAFT') 
            AND l.shadow = false
        )
    `);

    for (const sess of caseASessions) {
      findings.push({
        checkName: ReconciliationCheckName.SESSION_ACQUISITION,
        severity: ReconciliationFindingSeverity.FAILURE,
        entityType: "Session",
        entityId: sess.session_id,
        expectedValue: "1 ledger consumption entry",
        observedValue: 0,
        message: `Case A: Billable live session ${sess.session_id} has started (status=${sess.status}) but has no credit consumption ledger entry`,
        detectedAt: now,
        metadata: {
          organizationId: sess.organization_id,
          driveId: sess.drive_id,
          status: sess.status,
          startedAt: sess.started_at ? new Date(sess.started_at).toISOString() : null,
        },
      });
    }

    // Case B: Single session has multiple consumption entries
    const caseBEntries = await (client as PrismaService).$queryRawUnsafe<any[]>(`
      SELECT 
        l.session_id,
        COUNT(*)::integer AS consume_count
      FROM "billing"."credit_ledger_entry" l
      WHERE l.session_id IS NOT NULL
        AND l.entry_type = 'CONSUME'
        AND l.shadow = false
      GROUP BY l.session_id
      HAVING COUNT(*) > 1
    `);

    for (const row of caseBEntries) {
      findings.push({
        checkName: ReconciliationCheckName.SESSION_ACQUISITION,
        severity: ReconciliationFindingSeverity.FAILURE,
        entityType: "Session",
        entityId: row.session_id,
        expectedValue: 1,
        observedValue: Number(row.consume_count),
        message: `Case B: Session ${row.session_id} has ${row.consume_count} CONSUME entries in ledger (expected exactly 1)`,
        detectedAt: now,
        metadata: {
          sessionId: row.session_id,
          consumeCount: Number(row.consume_count),
        },
      });
    }

    // Case C: Consumption exists without valid corresponding session evidence
    const caseCEntries = await (client as PrismaService).$queryRawUnsafe<any[]>(`
      SELECT 
        l.id AS entry_id,
        l.session_id,
        l.billing_account_id
      FROM "billing"."credit_ledger_entry" l
      WHERE l.entry_type = 'CONSUME'
        AND l.shadow = false
        AND (
          l.session_id IS NULL
          OR NOT EXISTS (
            SELECT 1 FROM "billing"."session_billing_evidence" e 
            WHERE e.session_id = l.session_id
          )
        )
    `);

    for (const entry of caseCEntries) {
      findings.push({
        checkName: ReconciliationCheckName.SESSION_ACQUISITION,
        severity: ReconciliationFindingSeverity.FAILURE,
        entityType: "CreditLedgerEntry",
        entityId: entry.entry_id,
        expectedValue: "Valid session billing evidence record",
        observedValue: entry.session_id ? "Missing evidence" : "Null sessionId",
        message: `Case C: Ledger consumption ${entry.entry_id} has no valid session billing evidence (sessionId=${entry.session_id || "NULL"})`,
        detectedAt: now,
        metadata: {
          entryId: entry.entry_id,
          sessionId: entry.session_id,
          billingAccountId: entry.billing_account_id,
        },
      });
    }

    // Case D: Session appears to have acquired credit more than once (duplicate evidence records)
    const caseDEvidence = await (client as PrismaService).$queryRawUnsafe<any[]>(`
      SELECT 
        session_id,
        COUNT(*)::integer AS evidence_count
      FROM "billing"."session_billing_evidence"
      GROUP BY session_id
      HAVING COUNT(*) > 1
    `);

    for (const ev of caseDEvidence) {
      findings.push({
        checkName: ReconciliationCheckName.SESSION_ACQUISITION,
        severity: ReconciliationFindingSeverity.FAILURE,
        entityType: "SessionBillingEvidence",
        entityId: ev.session_id,
        expectedValue: 1,
        observedValue: Number(ev.evidence_count),
        message: `Case D: Duplicate billing evidence records (${ev.evidence_count}) detected for session ${ev.session_id}`,
        detectedAt: now,
        metadata: {
          sessionId: ev.session_id,
          evidenceCount: Number(ev.evidence_count),
        },
      });
    }

    const checkStatus = findings.length > 0 ? ReconciliationRunStatus.FAILED : ReconciliationRunStatus.PASSED;

    return {
      checkName: ReconciliationCheckName.SESSION_ACQUISITION,
      status: checkStatus,
      itemsAudited: totalLiveSessions,
      discrepancyCount: findings.length,
      details: {
        totalLiveSessionsAudited: totalLiveSessions,
        caseA_missingConsumption: caseASessions.length,
        caseB_duplicateConsumption: caseBEntries.length,
        caseC_unlinkedConsumption: caseCEntries.length,
        caseD_multipleEvidenceOrAcquisition: caseDEvidence.length,
      },
      findings,
    };
  }

  /**
   * CHECK 4 — Expiry Sweeper Integrity
   * Verifies pools past their expiration deadline.
   * Categorizes:
   * - EXPIRED_CORRECTLY: deadline passed, remaining=0, status=EXPIRED/CANCELLED
   * - EXPIRED_UNPROCESSED: deadline passed, remaining>0, status=ACTIVE/QUEUED (needs sweeper)
   * - EXPIRY_PROCESSING_FAILED: status=EXPIRED but remaining>0
   * - IMPOSSIBLE_EXPIRY_STATE: status=EXPIRED with future/null expiry
   *
   * Read-only: does not execute pool expiry mutations.
   */
  async runExpirySweeperCheck(client: any = this.prisma): Promise<CheckExecutionResult<ExpirySweeperDetails>> {
    const findings: ReconciliationFinding[] = [];
    const now = new Date().toISOString();

    const pools = await (client as PrismaService).$queryRawUnsafe<any[]>(`
      SELECT 
        p.id AS pool_id,
        p.billing_account_id,
        p.status,
        p.cached_remaining,
        p.total_credits,
        p.expires_at,
        CASE
          WHEN p.expires_at < clock_timestamp() AND p.cached_remaining = 0 AND p.status IN ('EXPIRED', 'CANCELLED') THEN 'EXPIRED_CORRECTLY'
          WHEN p.expires_at < clock_timestamp() AND p.cached_remaining > 0 AND p.status IN ('ACTIVE', 'QUEUED') THEN 'EXPIRED_UNPROCESSED'
          WHEN p.expires_at < clock_timestamp() AND p.cached_remaining > 0 AND p.status = 'EXPIRED' THEN 'EXPIRY_PROCESSING_FAILED'
          WHEN p.expires_at > clock_timestamp() AND p.status = 'EXPIRED' THEN 'IMPOSSIBLE_EXPIRY_STATE'
          WHEN p.expires_at IS NULL AND p.status = 'EXPIRED' THEN 'IMPOSSIBLE_EXPIRY_STATE'
          ELSE 'VALID_ACTIVE'
        END AS expiry_category
      FROM "billing"."credit_pool" p
      WHERE p.expires_at IS NOT NULL OR p.status = 'EXPIRED'
    `);

    let expiredCorrectly = 0;
    let expiredUnprocessed = 0;
    let expiryProcessingFailed = 0;
    let impossibleExpiryState = 0;

    for (const pool of pools) {
      const category = pool.expiry_category;
      const cached = Number(pool.cached_remaining);

      if (category === "EXPIRED_CORRECTLY") {
        expiredCorrectly++;
      } else if (category === "EXPIRED_UNPROCESSED") {
        expiredUnprocessed++;
        findings.push({
          checkName: ReconciliationCheckName.EXPIRY_SWEEPER,
          severity: ReconciliationFindingSeverity.WARNING,
          entityType: "CreditPool",
          entityId: pool.pool_id,
          expectedValue: "0 remaining credits (processed by sweeper)",
          observedValue: cached,
          message: `Pool ${pool.pool_id} passed expiry deadline (${pool.expires_at}) but has ${cached} unexpired credits awaiting sweeper execution`,
          detectedAt: now,
          metadata: {
            billingAccountId: pool.billing_account_id,
            status: pool.status,
            expiresAt: pool.expires_at ? new Date(pool.expires_at).toISOString() : null,
          },
        });
      } else if (category === "EXPIRY_PROCESSING_FAILED") {
        expiryProcessingFailed++;
        findings.push({
          checkName: ReconciliationCheckName.EXPIRY_SWEEPER,
          severity: ReconciliationFindingSeverity.FAILURE,
          entityType: "CreditPool",
          entityId: pool.pool_id,
          expectedValue: 0,
          observedValue: cached,
          message: `Pool ${pool.pool_id} marked as EXPIRED but still retains ${cached} cached credits`,
          detectedAt: now,
          metadata: {
            billingAccountId: pool.billing_account_id,
            status: pool.status,
          },
        });
      } else if (category === "IMPOSSIBLE_EXPIRY_STATE") {
        impossibleExpiryState++;
        findings.push({
          checkName: ReconciliationCheckName.EXPIRY_SWEEPER,
          severity: ReconciliationFindingSeverity.FAILURE,
          entityType: "CreditPool",
          entityId: pool.pool_id,
          expectedValue: "Non-future valid expires_at timestamp",
          observedValue: pool.expires_at ? new Date(pool.expires_at).toISOString() : "NULL",
          message: `Pool ${pool.pool_id} marked as EXPIRED with invalid expiration timestamp`,
          detectedAt: now,
          metadata: {
            billingAccountId: pool.billing_account_id,
            status: pool.status,
          },
        });
      }
    }

    const hasFailures = expiryProcessingFailed > 0 || impossibleExpiryState > 0;
    const hasWarnings = expiredUnprocessed > 0;
    const checkStatus = hasFailures
      ? ReconciliationRunStatus.FAILED
      : hasWarnings
        ? ReconciliationRunStatus.WARNING
        : ReconciliationRunStatus.PASSED;

    return {
      checkName: ReconciliationCheckName.EXPIRY_SWEEPER,
      status: checkStatus,
      itemsAudited: pools.length,
      discrepancyCount: findings.length,
      details: {
        totalPoolsAudited: pools.length,
        expiredCorrectly,
        expiredUnprocessed,
        expiryProcessingFailed,
        impossibleExpiryState,
      },
      findings,
    };
  }

  /**
   * CHECK 5 — Topology Invariant
   * Verifies Organization -> BillingAccount -> CreditPool -> LedgerEntry
   * and Payment -> CreditPool -> LedgerEntry topologies.
   * Also verifies Jio-model sequential queueing: at most 1 active general pool per account.
   */
  async runTopologyCheck(client: any = this.prisma): Promise<CheckExecutionResult<TopologyDetails>> {
    const findings: ReconciliationFinding[] = [];
    const now = new Date().toISOString();

    // 1. Organization without BillingAccount
    const unmappedOrgs = await (client as PrismaService).$queryRawUnsafe<any[]>(`
      SELECT id, name
      FROM "public"."organization"
      WHERE billing_account_id IS NULL
    `);

    for (const org of unmappedOrgs) {
      findings.push({
        checkName: ReconciliationCheckName.TOPOLOGY_INVARIANT,
        severity: ReconciliationFindingSeverity.FAILURE,
        entityType: "Organization",
        entityId: org.id,
        expectedValue: "Valid billing_account_id",
        observedValue: null,
        message: `Organization ${org.id} (${org.name}) has no associated BillingAccount`,
        detectedAt: now,
      });
    }

    // 2. Orphan BillingAccount (no organization points to it)
    const orphanAccounts = await (client as PrismaService).$queryRawUnsafe<any[]>(`
      SELECT ba.id, ba.name
      FROM "billing"."billing_account" ba
      WHERE NOT EXISTS (
        SELECT 1 FROM "public"."organization" o 
        WHERE o.billing_account_id = ba.id
      )
    `);

    for (const ba of orphanAccounts) {
      findings.push({
        checkName: ReconciliationCheckName.TOPOLOGY_INVARIANT,
        severity: ReconciliationFindingSeverity.WARNING,
        entityType: "BillingAccount",
        entityId: ba.id,
        expectedValue: "Referenced by an Organization",
        observedValue: null,
        message: `BillingAccount ${ba.id} (${ba.name}) is not referenced by any Organization`,
        detectedAt: now,
      });
    }

    // 3. Orphan CreditPool (billing_account does not exist)
    const orphanPools = await (client as PrismaService).$queryRawUnsafe<any[]>(`
      SELECT p.id, p.billing_account_id
      FROM "billing"."credit_pool" p
      WHERE NOT EXISTS (
        SELECT 1 FROM "billing"."billing_account" ba 
        WHERE ba.id = p.billing_account_id
      )
    `);

    for (const p of orphanPools) {
      findings.push({
        checkName: ReconciliationCheckName.TOPOLOGY_INVARIANT,
        severity: ReconciliationFindingSeverity.FAILURE,
        entityType: "CreditPool",
        entityId: p.id,
        expectedValue: "Valid BillingAccount reference",
        observedValue: p.billing_account_id,
        message: `CreditPool ${p.id} references non-existent BillingAccount ${p.billing_account_id}`,
        detectedAt: now,
      });
    }

    // 4. Orphan CreditLedgerEntry (billing_account does not exist)
    const orphanEntries = await (client as PrismaService).$queryRawUnsafe<any[]>(`
      SELECT l.id, l.billing_account_id
      FROM "billing"."credit_ledger_entry" l
      WHERE NOT EXISTS (
        SELECT 1 FROM "billing"."billing_account" ba 
        WHERE ba.id = l.billing_account_id
      )
    `);

    for (const l of orphanEntries) {
      findings.push({
        checkName: ReconciliationCheckName.TOPOLOGY_INVARIANT,
        severity: ReconciliationFindingSeverity.FAILURE,
        entityType: "CreditLedgerEntry",
        entityId: l.id,
        expectedValue: "Valid BillingAccount reference",
        observedValue: l.billing_account_id,
        message: `CreditLedgerEntry ${l.id} references non-existent BillingAccount ${l.billing_account_id}`,
        detectedAt: now,
      });
    }

    // 5. Pool-Account Mismatch on LedgerEntry
    const poolAccountMismatches = await (client as PrismaService).$queryRawUnsafe<any[]>(`
      SELECT 
        l.id AS entry_id,
        l.credit_pool_id,
        l.billing_account_id AS ledger_ba_id,
        p.billing_account_id AS pool_ba_id
      FROM "billing"."credit_ledger_entry" l
      JOIN "billing"."credit_pool" p ON p.id = l.credit_pool_id
      WHERE l.billing_account_id <> p.billing_account_id
    `);

    for (const m of poolAccountMismatches) {
      findings.push({
        checkName: ReconciliationCheckName.TOPOLOGY_INVARIANT,
        severity: ReconciliationFindingSeverity.FAILURE,
        entityType: "CreditLedgerEntry",
        entityId: m.entry_id,
        expectedValue: m.pool_ba_id,
        observedValue: m.ledger_ba_id,
        message: `Cross-account ledger leak: LedgerEntry ${m.entry_id} account (${m.ledger_ba_id}) does not match pool ${m.credit_pool_id} account (${m.pool_ba_id})`,
        detectedAt: now,
        metadata: {
          creditPoolId: m.credit_pool_id,
        },
      });
    }

    // 6. Payment-linked pool references
    const paymentPoolMismatches = await (client as PrismaService).$queryRawUnsafe<any[]>(`
      SELECT 
        p.id AS pool_id,
        p.payment_id,
        p.billing_account_id AS pool_ba_id,
        pay.billing_account_id AS pay_ba_id
      FROM "billing"."credit_pool" p
      LEFT JOIN "billing"."payment" pay ON pay.id = p.payment_id
      WHERE p.payment_id IS NOT NULL 
        AND (pay.id IS NULL OR pay.billing_account_id <> p.billing_account_id)
    `);

    for (const ppm of paymentPoolMismatches) {
      findings.push({
        checkName: ReconciliationCheckName.TOPOLOGY_INVARIANT,
        severity: ReconciliationFindingSeverity.FAILURE,
        entityType: "CreditPool",
        entityId: ppm.pool_id,
        expectedValue: "Valid Payment belonging to same BillingAccount",
        observedValue: { paymentId: ppm.payment_id, poolBa: ppm.pool_ba_id, payBa: ppm.pay_ba_id },
        message: `Pool ${ppm.pool_id} references payment ${ppm.payment_id} which does not exist or belongs to another account`,
        detectedAt: now,
      });
    }

    // 7. Payment-linked grant references
    const paymentGrantMismatches = await (client as PrismaService).$queryRawUnsafe<any[]>(`
      SELECT 
        l.id AS entry_id,
        l.payment_id,
        l.billing_account_id AS ledger_ba_id,
        pay.billing_account_id AS pay_ba_id
      FROM "billing"."credit_ledger_entry" l
      LEFT JOIN "billing"."payment" pay ON pay.id = l.payment_id
      WHERE l.payment_id IS NOT NULL 
        AND (pay.id IS NULL OR pay.billing_account_id <> l.billing_account_id)
    `);

    for (const pgm of paymentGrantMismatches) {
      findings.push({
        checkName: ReconciliationCheckName.TOPOLOGY_INVARIANT,
        severity: ReconciliationFindingSeverity.FAILURE,
        entityType: "CreditLedgerEntry",
        entityId: pgm.entry_id,
        expectedValue: "Valid Payment belonging to same BillingAccount",
        observedValue: { paymentId: pgm.payment_id, ledgerBa: pgm.ledger_ba_id, payBa: pgm.pay_ba_id },
        message: `Ledger entry ${pgm.entry_id} references payment ${pgm.payment_id} which does not exist or belongs to another account`,
        detectedAt: now,
      });
    }

    // 8. Jio Sequential Queueing Invariant: at most 1 active general pool per account
    const multipleActiveGeneralPools = await (client as PrismaService).$queryRawUnsafe<any[]>(`
      SELECT 
        p.billing_account_id,
        COUNT(*)::integer AS active_general_count
      FROM "billing"."credit_pool" p
      WHERE p.drive_id IS NULL 
        AND p.status = 'ACTIVE'
      GROUP BY p.billing_account_id
      HAVING COUNT(*) > 1
    `);

    for (const row of multipleActiveGeneralPools) {
      findings.push({
        checkName: ReconciliationCheckName.TOPOLOGY_INVARIANT,
        severity: ReconciliationFindingSeverity.FAILURE,
        entityType: "BillingAccount",
        entityId: row.billing_account_id,
        expectedValue: 1,
        observedValue: Number(row.active_general_count),
        message: `Sequential queueing violation: BillingAccount ${row.billing_account_id} has ${row.active_general_count} active general credit pools (max 1 permitted)`,
        detectedAt: now,
      });
    }

    const counts = await (client as PrismaService).$queryRawUnsafe<any[]>(`
      SELECT 
        (SELECT COUNT(*)::integer FROM "billing"."billing_account") AS accounts_count,
        (SELECT COUNT(*)::integer FROM "billing"."credit_pool") AS pools_count,
        (SELECT COUNT(*)::integer FROM "billing"."credit_ledger_entry") AS ledger_count
    `);

    const totalAccounts = Number(counts[0]?.accounts_count ?? 0);
    const totalPools = Number(counts[0]?.pools_count ?? 0);
    const totalLedger = Number(counts[0]?.ledger_count ?? 0);

    const hasFailures = findings.some((f) => f.severity === ReconciliationFindingSeverity.FAILURE);
    const hasWarnings = findings.some((f) => f.severity === ReconciliationFindingSeverity.WARNING);
    const checkStatus = hasFailures
      ? ReconciliationRunStatus.FAILED
      : hasWarnings
        ? ReconciliationRunStatus.WARNING
        : ReconciliationRunStatus.PASSED;

    return {
      checkName: ReconciliationCheckName.TOPOLOGY_INVARIANT,
      status: checkStatus,
      itemsAudited: totalAccounts + totalPools + totalLedger,
      discrepancyCount: findings.length,
      details: {
        totalAccountsAudited: totalAccounts,
        totalPoolsAudited: totalPools,
        totalLedgerEntriesAudited: totalLedger,
        orphanAccounts: orphanAccounts.length,
        orphanPools: orphanPools.length,
        orphanLedgerEntries: orphanEntries.length,
        poolAccountMismatches: poolAccountMismatches.length,
        paymentReferenceMismatches: paymentPoolMismatches.length + paymentGrantMismatches.length,
        multipleActiveGeneralPoolsAccounts: multipleActiveGeneralPools.length,
      },
      findings,
    };
  }

  /**
   * CHECK 6 — Payment Proof
   * Verifies that every CAPTURED payment has a defensible, unbroken financial chain:
   * Payment -> PriceBookEntry -> CreditPool -> Ledger GRANT.
   */
  async runPaymentProofCheck(client: any = this.prisma): Promise<CheckExecutionResult<PaymentProofDetails>> {
    const findings: ReconciliationFinding[] = [];
    const now = new Date().toISOString();

    const capturedPayments = await (client as PrismaService).$queryRawUnsafe<any[]>(`
      SELECT 
        pay.id AS payment_id,
        pay.billing_account_id,
        pay.price_book_entry_id,
        pay.quantity_credits,
        pay.unit_price_minor,
        pay.amount_minor,
        pay.tax_minor,
        pay.currency,
        pbe.unit_price_minor AS pbe_unit_price,
        pbe.currency AS pbe_currency,
        (SELECT COUNT(*)::integer FROM "billing"."credit_pool" cp WHERE cp.payment_id = pay.id) AS linked_pool_count,
        (SELECT cp.id FROM "billing"."credit_pool" cp WHERE cp.payment_id = pay.id LIMIT 1) AS linked_pool_id,
        (SELECT COUNT(*)::integer FROM "billing"."credit_ledger_entry" cle WHERE cle.payment_id = pay.id AND cle.entry_type = 'GRANT') AS linked_grant_count,
        (SELECT COALESCE(SUM(cle.amount), 0)::integer FROM "billing"."credit_ledger_entry" cle WHERE cle.payment_id = pay.id AND cle.entry_type = 'GRANT') AS linked_grant_amount
      FROM "billing"."payment" pay
      LEFT JOIN "billing"."price_book_entry" pbe ON pbe.id = pay.price_book_entry_id
      WHERE pay.status = 'CAPTURED'
    `);

    let missingPool = 0;
    let missingGrant = 0;
    let grantAmountMismatch = 0;
    let priceBookMismatch = 0;
    let mathDiscrepancy = 0;
    let duplicateGrant = 0;

    for (const p of capturedPayments) {
      const quantity = Number(p.quantity_credits);
      const unitPrice = Number(p.unit_price_minor);
      const amount = Number(p.amount_minor);
      const tax = Number(p.tax_minor ?? 0);
      const poolCount = Number(p.linked_pool_count);
      const grantCount = Number(p.linked_grant_count);
      const grantAmount = Number(p.linked_grant_amount);

      // 1. PriceBookEntry existence & consistency
      if (p.pbe_unit_price === null || p.pbe_unit_price === undefined) {
        priceBookMismatch++;
        findings.push({
          checkName: ReconciliationCheckName.PAYMENT_PROOF,
          severity: ReconciliationFindingSeverity.FAILURE,
          entityType: "Payment",
          entityId: p.payment_id,
          expectedValue: "Existing PriceBookEntry",
          observedValue: p.price_book_entry_id,
          message: `Payment ${p.payment_id} references missing PriceBookEntry ${p.price_book_entry_id}`,
          detectedAt: now,
          metadata: { billingAccountId: p.billing_account_id },
        });
      } else {
        if (Number(p.pbe_unit_price) !== unitPrice) {
          priceBookMismatch++;
          findings.push({
            checkName: ReconciliationCheckName.PAYMENT_PROOF,
            severity: ReconciliationFindingSeverity.FAILURE,
            entityType: "Payment",
            entityId: p.payment_id,
            expectedValue: Number(p.pbe_unit_price),
            observedValue: unitPrice,
            message: `Payment ${p.payment_id} unit_price_minor (${unitPrice}) does not match PriceBookEntry price (${p.pbe_unit_price})`,
            detectedAt: now,
            metadata: { billingAccountId: p.billing_account_id },
          });
        }

        if (p.pbe_currency !== p.currency) {
          priceBookMismatch++;
          findings.push({
            checkName: ReconciliationCheckName.PAYMENT_PROOF,
            severity: ReconciliationFindingSeverity.FAILURE,
            entityType: "Payment",
            entityId: p.payment_id,
            expectedValue: p.pbe_currency,
            observedValue: p.currency,
            message: `Payment ${p.payment_id} currency (${p.currency}) does not match PriceBookEntry currency (${p.pbe_currency})`,
            detectedAt: now,
            metadata: { billingAccountId: p.billing_account_id },
          });
        }
      }

      // 2. Mathematical coherence
      const expectedAmount = quantity * unitPrice + tax;
      if (amount !== expectedAmount || quantity <= 0) {
        mathDiscrepancy++;
        findings.push({
          checkName: ReconciliationCheckName.PAYMENT_PROOF,
          severity: ReconciliationFindingSeverity.FAILURE,
          entityType: "Payment",
          entityId: p.payment_id,
          expectedValue: expectedAmount,
          observedValue: amount,
          message: `Payment ${p.payment_id} mathematical incoherence: amount_minor=${amount}, expected (qty*unitPrice + tax)=${expectedAmount}`,
          detectedAt: now,
          metadata: { quantity, unitPrice, tax },
        });
      }

      // 3. Associated purchase pool exists
      if (poolCount < 1) {
        missingPool++;
        findings.push({
          checkName: ReconciliationCheckName.PAYMENT_PROOF,
          severity: ReconciliationFindingSeverity.FAILURE,
          entityType: "Payment",
          entityId: p.payment_id,
          expectedValue: ">= 1 associated CreditPool",
          observedValue: poolCount,
          message: `Payment ${p.payment_id} has no linked CreditPool`,
          detectedAt: now,
          metadata: { billingAccountId: p.billing_account_id },
        });
      }

      // 4. Associated opening GRANT in ledger exists & matches quantity
      if (grantCount === 0) {
        missingGrant++;
        findings.push({
          checkName: ReconciliationCheckName.PAYMENT_PROOF,
          severity: ReconciliationFindingSeverity.FAILURE,
          entityType: "Payment",
          entityId: p.payment_id,
          expectedValue: "1 opening GRANT ledger entry",
          observedValue: 0,
          message: `Payment ${p.payment_id} has no opening GRANT entry in CreditLedgerEntry`,
          detectedAt: now,
          metadata: { billingAccountId: p.billing_account_id, quantityCredits: quantity },
        });
      } else if (grantCount > 1) {
        duplicateGrant++;
        findings.push({
          checkName: ReconciliationCheckName.PAYMENT_PROOF,
          severity: ReconciliationFindingSeverity.FAILURE,
          entityType: "Payment",
          entityId: p.payment_id,
          expectedValue: 1,
          observedValue: grantCount,
          message: `Payment ${p.payment_id} has duplicate opening GRANT entries (${grantCount}) in ledger`,
          detectedAt: now,
          metadata: { billingAccountId: p.billing_account_id },
        });
      } else if (grantAmount !== quantity) {
        grantAmountMismatch++;
        findings.push({
          checkName: ReconciliationCheckName.PAYMENT_PROOF,
          severity: ReconciliationFindingSeverity.FAILURE,
          entityType: "Payment",
          entityId: p.payment_id,
          expectedValue: quantity,
          observedValue: grantAmount,
          message: `Payment ${p.payment_id} grant amount (${grantAmount}) does not match purchased credits (${quantity})`,
          detectedAt: now,
          metadata: { billingAccountId: p.billing_account_id },
        });
      }
    }

    const checkStatus = findings.length > 0 ? ReconciliationRunStatus.FAILED : ReconciliationRunStatus.PASSED;

    return {
      checkName: ReconciliationCheckName.PAYMENT_PROOF,
      status: checkStatus,
      itemsAudited: capturedPayments.length,
      discrepancyCount: findings.length,
      details: {
        totalCapturedPaymentsAudited: capturedPayments.length,
        paymentsWithMissingPool: missingPool,
        paymentsWithMissingGrant: missingGrant,
        paymentsWithGrantAmountMismatch: grantAmountMismatch,
        paymentsWithPriceBookMismatch: priceBookMismatch,
        paymentsWithMathDiscrepancy: mathDiscrepancy,
        paymentsWithDuplicateGrant: duplicateGrant,
      },
      findings,
    };
  }

  /**
   * CHECK 7 — WORM / Audit Backup Verification
   * Inspects the billing audit trail, verifies that PostgreSQL append-only immutability
   * triggers remain active, verifies audit coverage for financial events,
   * and reports external WORM object lock export capability honestly.
   */
  async runAuditWormCheck(client: any = this.prisma): Promise<CheckExecutionResult<AuditWormDetails>> {
    const findings: ReconciliationFinding[] = [];
    const now = new Date().toISOString();

    // 1. Verify PostgreSQL append-only triggers are active on billing tables
    const expectedTriggers = [
      { name: "trg_ledger_append_only", table: "credit_ledger_entry" },
      { name: "trg_billing_audit_append_only", table: "billing_audit_event" },
      { name: "trg_session_evidence_append_only", table: "session_billing_evidence" },
    ];

    const activeTriggers = await (client as PrismaService).$queryRawUnsafe<any[]>(`
      SELECT 
        t.tgname AS trigger_name,
        c.relname AS table_name,
        t.tgenabled::text AS enabled
      FROM pg_trigger t
      JOIN pg_class c ON t.tgrelid = c.oid
      JOIN pg_namespace n ON c.relnamespace = n.oid
      WHERE n.nspname = 'billing'
        AND t.tgname IN ('trg_ledger_append_only', 'trg_billing_audit_append_only', 'trg_session_evidence_append_only')
    `);

    const triggersAudited: Array<{ name: string; table: string; enabled: boolean }> = [];
    let allTriggersActive = true;

    for (const exp of expectedTriggers) {
      const match = activeTriggers.find((t) => t.trigger_name === exp.name);
      // 'O' in pg_trigger means 'origin and local' (enabled)
      const isEnabled = match ? match.enabled === "O" || match.enabled === "true" : false;
      triggersAudited.push({
        name: exp.name,
        table: exp.table,
        enabled: isEnabled,
      });

      if (!isEnabled) {
        allTriggersActive = false;
        findings.push({
          checkName: ReconciliationCheckName.AUDIT_WORM_VERIFICATION,
          severity: ReconciliationFindingSeverity.FAILURE,
          entityType: "Trigger",
          entityId: exp.name,
          expectedValue: "Enabled ('O')",
          observedValue: match ? match.enabled : "NOT_FOUND",
          message: `Append-only immutability trigger '${exp.name}' on billing.${exp.table} is inactive or missing!`,
          detectedAt: now,
        });
      }
    }

    // 2. Audit and ledger counts
    const counts = await (client as PrismaService).$queryRawUnsafe<any[]>(`
      SELECT 
        (SELECT COUNT(*)::integer FROM "billing"."billing_audit_event") AS audit_count,
        (SELECT COUNT(*)::integer FROM "billing"."credit_ledger_entry") AS ledger_count
    `);

    const auditEventsCount = Number(counts[0]?.audit_count ?? 0);
    const ledgerEntriesCount = Number(counts[0]?.ledger_count ?? 0);

    // 3. Coverage verification: financial events have corresponding audit events
    const unauditedEvents = await (client as PrismaService).$queryRawUnsafe<any[]>(`
      SELECT COUNT(*)::integer AS unaudited_count
      FROM "billing"."credit_ledger_entry" l
      WHERE l.reason <> 'PROMOTIONAL_SEED_GRANT'
        AND NOT EXISTS (
          SELECT 1 FROM "billing"."billing_audit_event" a
          WHERE a.subject_id = l.id 
             OR a.subject_id = l.credit_pool_id 
             OR (l.request_id IS NOT NULL AND a.request_id = l.request_id)
        )
    `);

    const financialEventsWithoutAuditCount = Number(unauditedEvents[0]?.unaudited_count ?? 0);
    if (financialEventsWithoutAuditCount > 0) {
      findings.push({
        checkName: ReconciliationCheckName.AUDIT_WORM_VERIFICATION,
        severity: ReconciliationFindingSeverity.WARNING,
        entityType: "CreditLedgerEntry",
        entityId: "AGGREGATE",
        expectedValue: 0,
        observedValue: financialEventsWithoutAuditCount,
        message: `${financialEventsWithoutAuditCount} ledger entries have no matching billing audit event record`,
        detectedAt: now,
      });
    }

    // 4. External WORM backup verification
    // Documenting honest capability standard per Prompt §9
    const wormExportStatus = "CAPABILITY_GAP";
    const wormCapabilityGapReport =
      "Scheduled MinIO WORM object lock export worker is not yet configured in this codebase version; primary append-only guarantees are enforced by active PostgreSQL BEFORE UPDATE/DELETE triggers.";

    const hasFailures = !allTriggersActive;
    const hasWarnings = financialEventsWithoutAuditCount > 0;
    const checkStatus = hasFailures
      ? ReconciliationRunStatus.FAILED
      : hasWarnings
        ? ReconciliationRunStatus.WARNING
        : ReconciliationRunStatus.PASSED;

    return {
      checkName: ReconciliationCheckName.AUDIT_WORM_VERIFICATION,
      status: checkStatus,
      itemsAudited: auditEventsCount + ledgerEntriesCount,
      discrepancyCount: findings.length,
      details: {
        auditEventsCount,
        ledgerEntriesCount,
        immutabilityTriggersActive: allTriggersActive,
        triggersAudited,
        financialEventsWithoutAuditCount,
        wormExportStatus,
        wormCapabilityGapReport,
      },
      findings,
    };
  }

  /**
   * Executes a complete 7-point reconciliation audit using a PostgreSQL REPEATABLE READ snapshot.
   * Completely read-only with respect to financial data; logs run metadata to billing.reconciliation_run.
   */
  async executeReconciliation(
    runType: ReconciliationRunType,
    executedBy: string,
  ): Promise<ReconciliationRunResultDto> {
    const startedAt = new Date();
    this.logger.log(`[ReconciliationService] Starting 7-point audit (runType=${runType}, executedBy=${executedBy})`);

    // Execute all 7 checks within a REPEATABLE READ READ ONLY transaction for snapshot consistency
    const checkOutputs = await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");

        const poolResult = await this.runPoolIntegrityCheck(tx);
        const overdraftResult = await this.runOverdraftIntegrityCheck(tx);
        const sessionResult = await this.runSessionAcquisitionCheck(tx);
        const expiryResult = await this.runExpirySweeperCheck(tx);
        const topologyResult = await this.runTopologyCheck(tx);
        const paymentProofResult = await this.runPaymentProofCheck(tx);
        const auditWormResult = await this.runAuditWormCheck(tx);

        return {
          [ReconciliationCheckName.POOL_INTEGRITY]: poolResult,
          [ReconciliationCheckName.OVERDRAFT_INTEGRITY]: overdraftResult,
          [ReconciliationCheckName.SESSION_ACQUISITION]: sessionResult,
          [ReconciliationCheckName.EXPIRY_SWEEPER]: expiryResult,
          [ReconciliationCheckName.TOPOLOGY_INVARIANT]: topologyResult,
          [ReconciliationCheckName.PAYMENT_PROOF]: paymentProofResult,
          [ReconciliationCheckName.AUDIT_WORM_VERIFICATION]: auditWormResult,
        };
      },
      { timeout: 30000 },
    );

    // Aggregate findings
    const allFindings: ReconciliationFinding[] = [];
    let hasFailures = false;
    let hasWarnings = false;

    for (const [checkName, result] of Object.entries(checkOutputs)) {
      allFindings.push(...result.findings);
      if (result.status === ReconciliationRunStatus.FAILED) {
        hasFailures = true;
      } else if (result.status === ReconciliationRunStatus.WARNING) {
        hasWarnings = true;
      }
    }

    const driftDetected = hasFailures;
    const overallStatus = hasFailures
      ? ReconciliationRunStatus.FAILED
      : hasWarnings
        ? ReconciliationRunStatus.WARNING
        : ReconciliationRunStatus.PASSED;

    const completedAt = new Date();

    // Persist run metadata in billing.reconciliation_run
    const runRecord = await this.prisma.reconciliationRun.create({
      data: {
        runType,
        status: overallStatus,
        checkResults: checkOutputs as any,
        driftDetected,
        discrepancyDetails: allFindings.length > 0 ? (allFindings as any) : undefined,
        executedBy,
        startedAt,
        completedAt,
      },
    });

    this.logger.log(
      `[ReconciliationService] Completed 7-point audit (runId=${runRecord.id}, status=${overallStatus}, driftDetected=${driftDetected}, findings=${allFindings.length})`,
    );

    return {
      id: runRecord.id,
      runType: runRecord.runType,
      status: runRecord.status,
      driftDetected: runRecord.driftDetected,
      checkResults: checkOutputs,
      discrepancyDetails: allFindings,
      executedBy: runRecord.executedBy,
      startedAt: runRecord.startedAt.toISOString(),
      completedAt: runRecord.completedAt ? runRecord.completedAt.toISOString() : null,
    };
  }

  /**
   * Run nightly automated 7-point audit.
   */
  async runNightlyAudit(): Promise<ReconciliationRunResultDto> {
    return await this.executeReconciliation(ReconciliationRunType.NIGHTLY, "system");
  }

  /**
   * Trigger manual 7-point audit by authenticated staff actor.
   */
  async triggerManualAudit(actor: ReconciliationStaffActor): Promise<ReconciliationRunResultDto> {
    const actorIdentifier = actor?.email || actor?.id || "manual_staff";
    return await this.executeReconciliation(ReconciliationRunType.MANUAL, actorIdentifier);
  }

  /**
   * Fetch the latest reconciliation run.
   */
  async getLatestRun(): Promise<ReconciliationRunResultDto | null> {
    const run = await this.prisma.reconciliationRun.findFirst({
      orderBy: { startedAt: "desc" },
    });

    if (!run) {
      return null;
    }

    return {
      id: run.id,
      runType: run.runType,
      status: run.status,
      driftDetected: run.driftDetected,
      checkResults: run.checkResults as any,
      discrepancyDetails: (run.discrepancyDetails as any) || [],
      executedBy: run.executedBy,
      startedAt: run.startedAt.toISOString(),
      completedAt: run.completedAt ? run.completedAt.toISOString() : null,
    };
  }
}
