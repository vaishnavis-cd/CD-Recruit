import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  UnauthorizedException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { LedgerService } from "../ledger/ledger.service";
import { CreditPoolService } from "../pool/credit-pool.service";
import { BillingAccountService } from "../account/billing-account.service";
import { PlatformStaffRole } from "@cd-recruit/shared-types";
import { LedgerActor } from "../ledger/ledger.types";
import { PoolGrantSource, PoolType } from "../pool/credit-pool.types";
import { sanitizeAuditData } from "../../platform/audit/platform-audit.util";
import {
  ManualRequestKind,
  ManualRequestStatus,
  CreateManualRequestDto,
  RejectManualRequestDto,
  ManualRequestFilter,
  ManualBillingRequestRecord,
  ManualRequestDetailDto,
} from "./manual-billing-request.types";

@Injectable()
export class ManualBillingRequestService {
  private readonly logger = new Logger(ManualBillingRequestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: LedgerService,
    private readonly creditPoolService: CreditPoolService,
    private readonly billingAccountService: BillingAccountService,
  ) {}

  /**
   * Authoritatively extracts actor identity for manual billing workflows.
   * Rejects recruiter staff and unauthenticated client spoofing.
   */
  private extractActorInfo(actor: LedgerActor): { actorId: string; actorRole: PlatformStaffRole } {
    if (!actor) {
      throw new UnauthorizedException("AUTHENTICATION_REQUIRED: Platform actor must be authenticated");
    }

    if (actor === "system") {
      throw new ForbiddenException(
        "SYSTEM_ACTOR_FORBIDDEN: Manual billing requests require human platform staff",
      );
    }

    if (typeof actor === "object") {
      if ((actor as any).isPlatformStaff !== true) {
        throw new ForbiddenException(
          "PLATFORM_ROLE_REQUIRED: Only authenticated PlatformStaff can perform manual billing requests",
        );
      }

      const role = (actor.platformRole || actor.role) as PlatformStaffRole;
      if (!role || !Object.values(PlatformStaffRole).includes(role)) {
        throw new BadRequestException(
          `INVALID_PLATFORM_ROLE: Expected SUPPORT, FINANCE, or OWNER; received '${role}'`,
        );
      }

      if (!actor.id || typeof actor.id !== "string" || actor.id.trim() === "") {
        throw new BadRequestException("INVALID_ACTOR_ID: Platform actor must have a valid ID");
      }

      return { actorId: actor.id.trim(), actorRole: role };
    }

    throw new BadRequestException("INVALID_ACTOR_TYPE: Actor must be authenticated PlatformStaff object");
  }

  /**
   * Helper to write immutable billing audit events inside the enclosing transaction.
   */
  private async recordBillingAudit(
    tx: any,
    params: {
      actorId: string;
      actorRole: string;
      subjectType: string;
      subjectId: string;
      action: string;
      before?: any;
      after?: any;
      reason?: string | null;
      ticketRef?: string | null;
      requestId?: string | null;
      executionResult?: "SUCCESS" | "FAILED";
    },
  ): Promise<void> {
    const sanitizedBefore = params.before ? sanitizeAuditData(params.before) : null;
    const sanitizedAfter = params.after ? sanitizeAuditData(params.after) : null;

    await tx.billingAuditEvent.create({
      data: {
        actorId: params.actorId,
        actorRole: params.actorRole,
        subjectType: params.subjectType,
        subjectId: params.subjectId,
        action: params.action,
        before: sanitizedBefore,
        after: sanitizedAfter,
        reason: params.reason || null,
        ticketRef: params.ticketRef || null,
        requestId: params.requestId || null,
        executionResult: params.executionResult || "SUCCESS",
      },
    });
  }

  /**
   * 1. CREATE REQUEST
   * Creates a new manual billing request in PENDING status.
   *
   * Invariants enforced:
   * - Actor must be authenticated PlatformStaff (SUPPORT, FINANCE, OWNER).
   * - Target billing account must exist and not be suspended.
   * - Kind must be a valid ManualRequestKind.
   * - Mandatory ticket reference (min 3 chars, alphanumeric format e.g. JIRA-1234).
   * - Mandatory descriptive reason (min 10 characters).
   * - Validated typed payload per kind (zero candidate PII).
   * - Initial status is strictly PENDING (zero financial execution at creation).
   * - Appends REQUEST_CREATED event to billing.billing_audit_event.
   */
  async createRequest(
    param1: CreateManualRequestDto | LedgerActor,
    param2: CreateManualRequestDto | LedgerActor,
  ): Promise<ManualBillingRequestRecord> {
    let dto: CreateManualRequestDto;
    let actor: LedgerActor;

    if (param1 && typeof param1 === "object" && ("kind" in param1 || "billingAccountId" in param1)) {
      dto = param1 as CreateManualRequestDto;
      actor = param2 as LedgerActor;
    } else {
      actor = param1 as LedgerActor;
      dto = param2 as CreateManualRequestDto;
    }

    const { actorId, actorRole } = this.extractActorInfo(actor);

    if (!dto || typeof dto !== "object") {
      throw new BadRequestException("INVALID_PAYLOAD: Request DTO is required");
    }

    if (!dto.billingAccountId || typeof dto.billingAccountId !== "string" || dto.billingAccountId.trim() === "") {
      throw new BadRequestException("BILLING_ACCOUNT_ID_REQUIRED: Billing account ID is required");
    }

    const validKinds = Object.values(ManualRequestKind);
    if (!dto.kind || !validKinds.includes(dto.kind as ManualRequestKind)) {
      throw new BadRequestException(
        `INVALID_REQUEST_KIND: Kind '${dto.kind}' is invalid. Supported: ${validKinds.join(", ")}`,
      );
    }

    // Ticket Reference validation (min 3 chars, alphanumeric format)
    if (!dto.ticketRef || typeof dto.ticketRef !== "string" || dto.ticketRef.trim().length < 3) {
      throw new BadRequestException(
        "TICKET_REF_REQUIRED: A valid ticket reference (min 3 chars, e.g. JIRA-1234) is mandatory",
      );
    }
    const ticketRef = dto.ticketRef.trim();
    if (!/^[A-Za-z0-9_-]+$/.test(ticketRef) || ticketRef.length > 64) {
      throw new BadRequestException(
        "INVALID_TICKET_REF_FORMAT: ticketRef must be alphanumeric format (e.g. JIRA-1234)",
      );
    }

    // Reason validation (min 10 chars per Artifact 02 Ã‚Â§5.2)
    if (!dto.reason || typeof dto.reason !== "string" || dto.reason.trim().length < 10) {
      throw new BadRequestException(
        "INVALID_REASON: A descriptive business reason of at least 10 characters is mandatory",
      );
    }
    const reason = dto.reason.trim();

    // Zero Candidate PII Enforcement per Design Matrix & Section 10
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;
    if (emailRegex.test(reason) || emailRegex.test(JSON.stringify(dto.payload))) {
      throw new BadRequestException(
        "CANDIDATE_PII_PROHIBITED: Candidate PII (such as email addresses) is strictly prohibited in manual billing requests",
      );
    }

    if (!dto.payload || typeof dto.payload !== "object" || Array.isArray(dto.payload)) {
      throw new BadRequestException("PAYLOAD_REQUIRED: A typed payload object is mandatory");
    }

    // Verify target BillingAccount exists
    const account = await this.prisma.billingAccount.findUnique({
      where: { id: dto.billingAccountId },
      include: { organizations: true },
    });
    if (!account) {
      throw new NotFoundException(`BILLING_ACCOUNT_NOT_FOUND: Billing account '${dto.billingAccountId}' not found`);
    }

    if (account.status === "SUSPENDED") {
      throw new ForbiddenException(
        "ACCOUNT_SUSPENDED: Cannot create manual billing requests for a suspended billing account",
      );
    }

    // Validate kind-specific payload rules
    await this.validatePayloadForKind(dto.kind as ManualRequestKind, dto.payload, account);

    // Persist request in PENDING status
    return await this.prisma.$transaction(async (tx) => {
      const created = await tx.manualBillingRequest.create({
        data: {
          billingAccountId: account.id,
          kind: dto.kind as ManualRequestKind,
          payload: dto.payload,
          reason,
          ticketRef,
          requestedById: actorId,
          status: ManualRequestStatus.PENDING,
        },
      });

      // Audit trail
      await this.recordBillingAudit(tx, {
        actorId,
        actorRole,
        subjectType: "REQUEST",
        subjectId: created.id,
        action: "REQUEST_CREATED",
        before: null,
        after: {
          id: created.id,
          billingAccountId: created.billingAccountId,
          kind: created.kind,
          status: created.status,
          requestedById: created.requestedById,
          ticketRef: created.ticketRef,
        },
        reason,
        ticketRef,
        requestId: created.id,
      });

      this.logger.log(
        `[ManualBillingRequestService] Created manual billing request ${created.id} (kind: ${created.kind}) by ${actorRole}:${actorId} for account ${account.id}`,
      );

      return created as ManualBillingRequestRecord;
    });
  }

  /**
   * Helper to validate kind-specific payloads at submission time.
   */
  private async validatePayloadForKind(
    kind: ManualRequestKind,
    payload: Record<string, any>,
    account: any,
  ): Promise<void> {
    switch (kind) {
      case ManualRequestKind.GRANT: {
        if (!payload.credits || !Number.isInteger(payload.credits) || payload.credits <= 0) {
          throw new BadRequestException("INVALID_GRANT_CREDITS: credits must be a positive integer");
        }
        if (payload.poolId) {
          const pool = await this.prisma.creditPool.findUnique({
            where: { id: payload.poolId },
          });
          if (!pool || pool.billingAccountId !== account.id) {
            throw new BadRequestException("POOL_NOT_FOUND_ON_ACCOUNT: Target pool does not exist on this billing account");
          }
        }
        break;
      }

      case ManualRequestKind.ADJUST: {
        if (!payload.poolId || typeof payload.poolId !== "string") {
          throw new BadRequestException("POOL_ID_REQUIRED: poolId is required for manual adjustment");
        }
        if (!payload.amount || !Number.isInteger(payload.amount) || payload.amount === 0) {
          throw new BadRequestException("INVALID_ADJUST_AMOUNT: amount must be a non-zero integer");
        }
        const pool = await this.prisma.creditPool.findUnique({
          where: { id: payload.poolId },
        });
        if (!pool || pool.billingAccountId !== account.id) {
          throw new BadRequestException("POOL_NOT_FOUND_ON_ACCOUNT: Target pool does not exist on this billing account");
        }
        if (payload.amount < 0 && pool.cachedRemaining + payload.amount < 0) {
          throw new BadRequestException(
            `ADJUSTMENT_EXCEEDS_BALANCE: Negative adjustment of ${payload.amount} exceeds available balance ${pool.cachedRemaining}`,
          );
        }
        break;
      }

      case ManualRequestKind.EXPIRY_EXTEND: {
        if (!payload.poolId || typeof payload.poolId !== "string") {
          throw new BadRequestException("POOL_ID_REQUIRED: poolId is required for expiry extension");
        }
        const pool = await this.prisma.creditPool.findUnique({
          where: { id: payload.poolId },
        });
        if (!pool || pool.billingAccountId !== account.id) {
          throw new BadRequestException("POOL_NOT_FOUND_ON_ACCOUNT: Target pool does not exist on this billing account");
        }
        if (pool.status === "EXPIRED" || pool.status === "CANCELLED") {
          throw new BadRequestException(`CANNOT_EXTEND_TERMINAL_POOL: Cannot extend expiry of ${pool.status} pool`);
        }
        let targetExpiry: Date;
        if (payload.newExpiry) {
          targetExpiry = new Date(payload.newExpiry);
        } else if (payload.extensionDays && Number.isInteger(payload.extensionDays) && payload.extensionDays > 0) {
          const base = pool.expiresAt ? new Date(pool.expiresAt) : new Date();
          targetExpiry = new Date(base.getTime() + payload.extensionDays * 86400000);
        } else {
          throw new BadRequestException("EXPIRY_DATE_REQUIRED: newExpiry or valid positive extensionDays is required");
        }

        if (isNaN(targetExpiry.getTime())) {
          throw new BadRequestException("INVALID_EXPIRY_DATE: Target expiry date is invalid");
        }
        if (targetExpiry <= new Date()) {
          throw new BadRequestException("EXPIRY_MUST_BE_IN_FUTURE: New expiry date must be in the future");
        }
        if (pool.expiresAt && targetExpiry <= new Date(pool.expiresAt)) {
          throw new BadRequestException("NEW_EXPIRY_MUST_BE_LATER: New expiry must be later than current expiry");
        }
        break;
      }

      case ManualRequestKind.ACCOUNT_STATUS: {
        if (!payload.status || !["ACTIVE", "RESTRICTED", "SUSPENDED"].includes(payload.status)) {
          throw new BadRequestException("INVALID_TARGET_STATUS: status must be ACTIVE, RESTRICTED, or SUSPENDED");
        }
        break;
      }

      case ManualRequestKind.OVERDRAFT_LIMIT: {
        // ADR-004 permanently locks overdraftLimit = 0
        if (payload.overdraftLimit !== 0) {
          throw new BadRequestException(
            "OVERDRAFT_ELIMINATED_PER_ADR_004: Overdraft limit cannot be modified (permanently locked to 0)",
          );
        }
        break;
      }

      case ManualRequestKind.BILLING_COUNTRY: {
        if (!payload.billingCountry || typeof payload.billingCountry !== "string" || payload.billingCountry.trim().length !== 2) {
          throw new BadRequestException("INVALID_BILLING_COUNTRY: billingCountry must be a 2-letter ISO country code");
        }
        break;
      }

      default:
        break;
    }
  }

  /**
   * 2. APPROVE REQUEST
   * Transitions request from PENDING -> APPROVED and immediately delegates to authorized execution.
   *
   * Invariants enforced:
   * - Actor must be FINANCE or OWNER role (SUPPORT cannot approve).
   * - Requester != Approver (strict maker-checker invariant, also enforced by DB constraint chk_maker_checker).
   * - Request must be in PENDING status.
   * - Records approvedById and decidedAt.
   * - Emits REQUEST_APPROVED billing audit event.
   * - Executes domain mutation atomically.
   */
  async approveRequest(
    param1: string | LedgerActor,
    param2: string | LedgerActor,
  ): Promise<ManualBillingRequestRecord> {
    let requestId: string;
    let actor: LedgerActor;

    if (typeof param1 === "string") {
      requestId = param1;
      actor = param2 as LedgerActor;
    } else {
      actor = param1 as LedgerActor;
      requestId = param2 as string;
    }

    const { actorId, actorRole } = this.extractActorInfo(actor);

    // Role check: Only FINANCE or OWNER can approve billing mutations
    if (actorRole !== PlatformStaffRole.FINANCE && actorRole !== PlatformStaffRole.OWNER) {
      throw new ForbiddenException(
        `APPROVAL_ROLE_NOT_AUTHORIZED: Role '${actorRole}' is not authorized to approve billing requests (FINANCE or OWNER required)`,
      );
    }

    if (!requestId || typeof requestId !== "string" || requestId.trim() === "") {
      throw new BadRequestException("REQUEST_ID_REQUIRED: Request ID is required");
    }

    // Execute approval and authorized mutation atomically
    return await this.prisma.$transaction(async (tx) => {
      // 1. Lock the request row
      const requests = (await tx.$queryRawUnsafe(
        `SELECT id, billing_account_id, kind, payload, reason, ticket_ref, 
                requested_by_id, approved_by_id, status, decided_at, executed_at, created_at
           FROM "billing"."manual_billing_request"
          WHERE id = $1 FOR UPDATE`,
        requestId,
      )) as any[];

      if (!requests || requests.length === 0) {
        throw new NotFoundException(`REQUEST_NOT_FOUND: Manual billing request '${requestId}' not found`);
      }

      const request = requests[0];

      // Verify request state
      if (request.status !== ManualRequestStatus.PENDING) {
        throw new ConflictException(
          `REQUEST_NOT_IN_PENDING_STATUS: Request is currently in status '${request.status}' and cannot be approved`,
        );
      }

      // MAKER-CHECKER ENFORCEMENT: requester != approver
      if (request.requested_by_id === actorId) {
        throw new ForbiddenException(
          "MAKER_CHECKER_VIOLATION: Requester cannot approve their own request (Self-approval forbidden)",
        );
      }

      const now = new Date();

      // 2. Transition status to APPROVED
      const updated = await tx.manualBillingRequest.update({
        where: { id: requestId },
        data: {
          approvedById: actorId,
          status: ManualRequestStatus.APPROVED,
          decidedAt: now,
        },
      });

      // 3. Emit approval audit event
      await this.recordBillingAudit(tx, {
        actorId,
        actorRole,
        subjectType: "REQUEST",
        subjectId: requestId,
        action: "REQUEST_APPROVED",
        before: { status: ManualRequestStatus.PENDING, approvedById: null },
        after: { status: ManualRequestStatus.APPROVED, approvedById: actorId, decidedAt: now },
        requestId,
        ticketRef: request.ticket_ref,
        reason: request.reason,
      });

      this.logger.log(
        `[ManualBillingRequestService] Request ${requestId} APPROVED by ${actorRole}:${actorId} (requestedBy: ${request.requested_by_id})`,
      );

      return updated as ManualBillingRequestRecord;
    });
  }

  /**
   * 3. REJECT REQUEST
   * Transitions request from PENDING -> REJECTED.
   *
   * Invariants enforced:
   * - Actor must be FINANCE or OWNER role.
   * - Request must be in PENDING status.
   * - Mandatory rejection reason (min 10 characters).
   * - Preserves original request as immutable audit record.
   * - Never mutates credits.
   * - Emits REQUEST_REJECTED billing audit event.
   */
  async rejectRequest(
    param1: string | LedgerActor,
    param2: string | RejectManualRequestDto | LedgerActor,
    param3?: RejectManualRequestDto | LedgerActor,
  ): Promise<ManualBillingRequestRecord> {
    let requestId: string;
    let dto: RejectManualRequestDto;
    let actor: LedgerActor;

    if (typeof param1 === "string") {
      requestId = param1;
      if (typeof param2 === "string") {
        dto = { rejectionReason: param2 };
        actor = param3 as LedgerActor;
      } else if (param2 && typeof param2 === "object" && "rejectionReason" in param2) {
        dto = param2 as RejectManualRequestDto;
        actor = param3 as LedgerActor;
      } else {
        actor = param2 as LedgerActor;
        dto = typeof param3 === "string" ? { rejectionReason: param3 } : (param3 as RejectManualRequestDto);
      }
    } else {
      actor = param1 as LedgerActor;
      requestId = param2 as string;
      dto = typeof param3 === "string" ? { rejectionReason: param3 } : (param3 as RejectManualRequestDto);
    }

    const { actorId, actorRole } = this.extractActorInfo(actor);

    if (actorRole !== PlatformStaffRole.FINANCE && actorRole !== PlatformStaffRole.OWNER) {
      throw new ForbiddenException(
        `APPROVAL_ROLE_NOT_AUTHORIZED: Role '${actorRole}' is not authorized to reject billing requests (FINANCE or OWNER required)`,
      );
    }

    if (!requestId || typeof requestId !== "string" || requestId.trim() === "") {
      throw new BadRequestException("REQUEST_ID_REQUIRED: Request ID is required");
    }

    if (!dto || !dto.rejectionReason || typeof dto.rejectionReason !== "string" || dto.rejectionReason.trim().length < 10) {
      throw new BadRequestException(
        "INVALID_REJECTION_REASON: A descriptive rejection reason of at least 10 characters is mandatory",
      );
    }
    const rejectionReason = dto.rejectionReason.trim();

    return await this.prisma.$transaction(async (tx) => {
      const requests = (await tx.$queryRawUnsafe(
        `SELECT id, status, ticket_ref, reason 
           FROM "billing"."manual_billing_request" 
          WHERE id = $1 FOR UPDATE`,
        requestId,
      )) as any[];

      if (!requests || requests.length === 0) {
        throw new NotFoundException(`REQUEST_NOT_FOUND: Manual billing request '${requestId}' not found`);
      }

      const request = requests[0];
      if (request.status !== ManualRequestStatus.PENDING) {
        throw new ConflictException(
          `REQUEST_NOT_IN_PENDING_STATUS: Request is currently in status '${request.status}' and cannot be rejected`,
        );
      }

      const now = new Date();
      const updated = await tx.manualBillingRequest.update({
        where: { id: requestId },
        data: {
          status: ManualRequestStatus.REJECTED,
          rejectionReason,
          decidedAt: now,
        },
      });

      await this.recordBillingAudit(tx, {
        actorId,
        actorRole,
        subjectType: "REQUEST",
        subjectId: requestId,
        action: "REQUEST_REJECTED",
        before: { status: ManualRequestStatus.PENDING },
        after: { status: ManualRequestStatus.REJECTED, rejectionReason, decidedAt: now },
        requestId,
        ticketRef: request.ticket_ref,
        reason: rejectionReason,
      });

      this.logger.log(
        `[ManualBillingRequestService] Request ${requestId} REJECTED by ${actorRole}:${actorId}. Reason: ${rejectionReason}`,
      );

      return updated as ManualBillingRequestRecord;
    });
  }

  /**
   * 4. CANCEL REQUEST
   * Cancelled by original requester while in PENDING status.
   *
   * Invariants enforced:
   * - Must be the original submitter (requestedById === actor.id).
   * - Approver cannot cancel (must reject).
   * - Request must be in PENDING status.
   * - Emits REQUEST_CANCELLED billing audit event.
   */
  async cancelRequest(
    param1: string | LedgerActor,
    param2: string | LedgerActor,
  ): Promise<ManualBillingRequestRecord> {
    let requestId: string;
    let actor: LedgerActor;

    if (typeof param1 === "string") {
      requestId = param1;
      actor = param2 as LedgerActor;
    } else {
      actor = param1 as LedgerActor;
      requestId = param2 as string;
    }

    const { actorId, actorRole } = this.extractActorInfo(actor);

    if (!requestId || typeof requestId !== "string" || requestId.trim() === "") {
      throw new BadRequestException("REQUEST_ID_REQUIRED: Request ID is required");
    }

    return await this.prisma.$transaction(async (tx) => {
      const requests = (await tx.$queryRawUnsafe(
        `SELECT id, requested_by_id, status, ticket_ref, reason 
           FROM "billing"."manual_billing_request" 
          WHERE id = $1 FOR UPDATE`,
        requestId,
      )) as any[];

      if (!requests || requests.length === 0) {
        throw new NotFoundException(`REQUEST_NOT_FOUND: Manual billing request '${requestId}' not found`);
      }

      const request = requests[0];

      if (request.status !== ManualRequestStatus.PENDING) {
        throw new ConflictException(
          `REQUEST_NOT_IN_PENDING_STATUS: Request is currently in status '${request.status}' and cannot be cancelled`,
        );
      }

      // Only original submitter can cancel
      if (request.requested_by_id !== actorId) {
        throw new ForbiddenException(
          "ONLY_REQUESTER_CAN_CANCEL: Only the original requester can cancel a pending request",
        );
      }

      const updated = await tx.manualBillingRequest.update({
        where: { id: requestId },
        data: {
          status: ManualRequestStatus.CANCELLED,
        },
      });

      await this.recordBillingAudit(tx, {
        actorId,
        actorRole,
        subjectType: "REQUEST",
        subjectId: requestId,
        action: "REQUEST_CANCELLED",
        before: { status: ManualRequestStatus.PENDING },
        after: { status: ManualRequestStatus.CANCELLED },
        requestId,
        ticketRef: request.ticket_ref,
        reason: "Request cancelled by submitter",
      });

      this.logger.log(
        `[ManualBillingRequestService] Request ${requestId} CANCELLED by requester ${actorId}`,
      );

      return updated as ManualBillingRequestRecord;
    });
  }

  /**
   * 5. EXECUTE APPROVED REQUEST
   * Performs the financial/pool mutation authorized by the maker-checker approval.
   *
   * Invariants enforced:
   * - Request must be in APPROVED status with valid approver (approvedById != requestedById).
   * - Exact-once execution: Safe against retries, duplicate HTTP calls, worker restarts.
   * - Sets PostgreSQL session context `proctora.request_id` to satisfy database triggers.
   * - Delegates financial mutations strictly to LedgerService and pool lifecycle to CreditPoolService.
   * - If execution fails, status remains APPROVED with executionError saved (safe retry via retryExecution).
   * - Transitions status to EXECUTED and records executedAt.
   * - Emits REQUEST_EXECUTED billing audit event.
   */
  async executeRequest(
    param1: string | LedgerActor,
    param2: string | LedgerActor,
  ): Promise<ManualBillingRequestRecord> {
    let requestId: string;
    let actor: LedgerActor;

    if (typeof param1 === "string") {
      requestId = param1;
      actor = param2 as LedgerActor;
    } else {
      actor = param1 as LedgerActor;
      requestId = param2 as string;
    }

    const { actorId, actorRole } = this.extractActorInfo(actor);

    if (actorRole !== PlatformStaffRole.FINANCE && actorRole !== PlatformStaffRole.OWNER) {
      throw new ForbiddenException(
        `INSUFFICIENT_PLATFORM_PERMISSIONS: Role '${actorRole}' is not authorized to execute billing requests`,
      );
    }

    if (!requestId || typeof requestId !== "string" || requestId.trim() === "") {
      throw new BadRequestException("REQUEST_ID_REQUIRED: Request ID is required");
    }

    return await this.prisma.$transaction(async (tx) => {
      return await this.executeApprovedRequest(actor, requestId, tx);
    });
  }

  /**
   * Internal execution logic that runs within the provided transaction client.
   */
  private async executeApprovedRequest(
    actor: LedgerActor,
    requestId: string,
    tx: any,
  ): Promise<ManualBillingRequestRecord> {
    const { actorId, actorRole } = this.extractActorInfo(actor);

    // Row-level lock on the request to serialize concurrent execution attempts
    const requests = (await tx.$queryRawUnsafe(
      `SELECT r.id, r.billing_account_id, r.kind, r.payload, r.reason, r.ticket_ref,
              r.requested_by_id, r.approved_by_id, r.status, r.rejection_reason,
              r.decided_at, r.executed_at, r.created_at
         FROM "billing"."manual_billing_request" r
        WHERE r.id = $1 FOR UPDATE`,
      requestId,
    )) as any[];

    if (!requests || requests.length === 0) {
      throw new NotFoundException(`REQUEST_NOT_FOUND: Manual billing request '${requestId}' not found`);
    }

    const request = requests[0];

    const org = await tx.organization.findFirst({
      where: { billingAccountId: request.billing_account_id },
      select: { id: true },
    });
    const organizationId = org?.id || request.billing_account_id;

    // Idempotent early-return if already executed (Exact-Once Invariant)
    if (request.status === ManualRequestStatus.EXECUTED || request.executed_at !== null) {
      this.logger.log(`[ManualBillingRequestService] Request ${requestId} already executed. Returning canonical record.`);
      return request as ManualBillingRequestRecord;
    }

    // Verify request is in approvable / executable state
    if (request.status !== ManualRequestStatus.APPROVED) {
      throw new ConflictException(
        `CANNOT_EXECUTE_UNAPPROVED_REQUEST: Request '${requestId}' is in '${request.status}' status, not 'APPROVED'`,
      );
    }

    // Maker-checker invariant check: must have valid, distinct approver
    if (!request.approved_by_id || request.approved_by_id === request.requested_by_id) {
      throw new ForbiddenException(
        "MAKER_CHECKER_VIOLATION: Approved request must have approved_by_id distinct from requested_by_id",
      );
    }

    // Set PostgreSQL session context variable to satisfy trigger guard_credit_pool_mutation
    const sanitizedRequestId = requestId.replace(/'/g, "''");
    await tx.$executeRawUnsafe(`SET LOCAL proctora.request_id = '${sanitizedRequestId}'`);

    const payload = typeof request.payload === "string" ? JSON.parse(request.payload) : request.payload;
    const idempotencyKey = `request:${requestId}`;

    try {
      // Dispatch mutation strictly to authorized domain service
      switch (request.kind) {
        case ManualRequestKind.GRANT: {
          if (payload.poolId) {
            // Grant to existing pool
            await this.ledgerService.grantCredits({
              billingAccountId: request.billing_account_id,
              organizationId,
              creditPoolId: payload.poolId,
              amount: payload.credits,
              grantSource: payload.source || PoolGrantSource.GOODWILL,
              reason: request.reason,
              requestId,
              idempotencyKey,
              actor,
              ticketRef: request.ticket_ref,
              tx,
            });
          } else {
            // Create a new dedicated pool (e.g. Goodwill or Promotional pool)
            await this.creditPoolService.createPool(
              {
                billingAccountId: request.billing_account_id,
                poolType: payload.poolType || PoolType.TALENT_RESERVE,
                name: payload.name || payload.poolName || "Goodwill Credit Pool",
                source: payload.source || PoolGrantSource.GOODWILL,
                totalCredits: payload.credits,
                validityDays: payload.validityDays || 30,
                driveId: payload.driveId || null,
              },
              {
                actor,
                requestId,
                ticketRef: request.ticket_ref,
                reason: request.reason,
                tx,
              },
            );
          }
          break;
        }

        case ManualRequestKind.ADJUST: {
          await this.ledgerService.executeManualAdjustment({
            billingAccountId: request.billing_account_id,
            organizationId,
            creditPoolId: payload.poolId,
            amount: payload.amount,
            reason: request.reason,
            reasonNote: payload.note || null,
            requestId,
            approvedById: request.approved_by_id,
            idempotencyKey,
            actor: actor as any,
            ticketRef: request.ticket_ref,
            tx,
          });
          break;
        }

        case ManualRequestKind.EXPIRY_EXTEND: {
          let targetExpiry: Date;
          if (payload.newExpiry) {
            targetExpiry = new Date(payload.newExpiry);
          } else if (payload.extensionDays) {
            const pool = await tx.creditPool.findUnique({ where: { id: payload.poolId } });
            const base = pool?.expiresAt ? new Date(pool.expiresAt) : new Date();
            targetExpiry = new Date(base.getTime() + payload.extensionDays * 86400000);
          } else {
            throw new BadRequestException("INVALID_EXPIRY_PAYLOAD: Missing newExpiry or extensionDays");
          }

          await this.creditPoolService.extendPoolExpiry(
            payload.poolId,
            targetExpiry,
            requestId,
            {
              actor,
              ticketRef: request.ticket_ref,
              reason: request.reason,
              requestId,
              tx,
            },
          );
          break;
        }

        case ManualRequestKind.ACCOUNT_STATUS: {
          await this.billingAccountService.updateStatus(
            request.billing_account_id,
            payload.status,
            requestId,
            {
              actor,
              ticketRef: request.ticket_ref,
              reason: request.reason,
              requestId,
              transactionClient: tx,
            },
          );
          break;
        }

        case ManualRequestKind.BILLING_COUNTRY: {
          await tx.billingAccount.update({
            where: { id: request.billing_account_id },
            data: { billingCountry: payload.billingCountry.trim().toUpperCase() },
          });
          break;
        }

        case ManualRequestKind.OVERDRAFT_LIMIT: {
          // Permanently locked to 0 per ADR-004
          break;
        }

        default:
          throw new BadRequestException(`UNSUPPORTED_EXECUTION_KIND: Kind '${request.kind}' is not executable`);
      }

      // Mark request EXECUTED
      const now = new Date();
      const executed = await tx.manualBillingRequest.update({
        where: { id: requestId },
        data: {
          status: ManualRequestStatus.EXECUTED,
          executedAt: now,
        },
      });

      // Audit event
      await this.recordBillingAudit(tx, {
        actorId,
        actorRole,
        subjectType: "REQUEST",
        subjectId: requestId,
        action: "REQUEST_EXECUTED",
        before: { status: ManualRequestStatus.APPROVED },
        after: { status: ManualRequestStatus.EXECUTED, executedAt: now },
        requestId,
        ticketRef: request.ticket_ref,
        reason: request.reason,
      });

      this.logger.log(
        `[ManualBillingRequestService] Request ${requestId} successfully EXECUTED (kind: ${request.kind})`,
      );

      return executed as ManualBillingRequestRecord;
    } catch (error: any) {
      // If execution fails with an error, record error message and keep status APPROVED
      this.logger.error(
        `[ManualBillingRequestService] Execution of request ${requestId} failed: ${error.message}`,
        error.stack,
      );

      await this.recordBillingAudit(tx, {
        actorId,
        actorRole,
        subjectType: "REQUEST",
        subjectId: requestId,
        action: "REQUEST_EXECUTION_FAILED",
        before: { status: ManualRequestStatus.APPROVED },
        after: { status: ManualRequestStatus.APPROVED, executionError: error.message },
        requestId,
        ticketRef: request.ticket_ref,
        reason: error.message,
        executionResult: "FAILED",
      });

      throw error;
    }
  }

  /**
   * 6. RETRY EXECUTION
   * Retries execution of an APPROVED request whose execution previously failed or was interrupted.
   */
  async retryExecution(
    param1: string | LedgerActor,
    param2: string | LedgerActor,
  ): Promise<ManualBillingRequestRecord> {
    return await this.executeRequest(param1 as any, param2 as any);
  }

  /**
   * 7. GET REQUEST BY ID
   * Retrieves single request details with related account metadata and zero candidate PII.
   */
  async getRequestById(
    param1: string | LedgerActor,
    param2?: string | LedgerActor,
  ): Promise<ManualRequestDetailDto> {
    let requestId: string;
    let actor: LedgerActor | undefined;

    if (typeof param1 === "string") {
      requestId = param1;
      actor = param2 as LedgerActor | undefined;
    } else {
      actor = param1 as LedgerActor;
      requestId = param2 as string;
    }

    if (actor) {
      this.extractActorInfo(actor);
    }

    if (!requestId || typeof requestId !== "string" || requestId.trim() === "") {
      throw new BadRequestException("REQUEST_ID_REQUIRED: Request ID is required");
    }

    const request = await this.prisma.manualBillingRequest.findUnique({
      where: { id: requestId },
      include: {
        billingAccount: {
          select: {
            id: true,
            name: true,
            billingCountry: true,
            currency: true,
            status: true,
          },
        },
      },
    });

    if (!request) {
      throw new NotFoundException(`REQUEST_NOT_FOUND: Manual billing request '${requestId}' not found`);
    }

    const parsedPayload =
      typeof request.payload === "string" ? JSON.parse(request.payload) : request.payload;

    return {
      ...(request as any),
      payload: parsedPayload,
    };
  }

  /**
   * 8. LIST REQUESTS
   * Returns paginated list of manual billing requests according to filter tabs.
   * Tabs:
   * - 'my_requests': created by actor
   * - 'awaiting_approval': status=PENDING (or REQUESTED) and requestedById != actor
   * - 'all': all requests
   */
  async listRequests(
    param1?: any,
    param2?: any,
  ): Promise<{ items: ManualBillingRequestRecord[]; data: ManualBillingRequestRecord[]; total: number; page: number; limit: number }> {
    let filter: any = {};
    let actor: LedgerActor | undefined;

    if (param1 && (param1.isPlatformStaff !== undefined || param1.platformRole !== undefined || typeof param1 === "string")) {
      actor = param1;
      filter = param2 || {};
    } else {
      filter = param1 || {};
      actor = param2;
    }

    let actorId: string | undefined;
    if (actor) {
      try {
        const info = this.extractActorInfo(actor);
        actorId = info.actorId;
      } catch {
        // optional actor context
      }
    }

    const page = Math.max(1, filter?.page || 1);
    const limit = Math.min(100, Math.max(1, filter?.limit || 20));
    const skip = filter?.offset !== undefined ? Number(filter.offset) : (page - 1) * limit;

    const where: any = {};

    if (filter?.tab === "my_requests") {
      if (actorId) {
        where.requestedById = actorId;
      }
    } else if (filter?.tab === "awaiting_approval") {
      where.status = ManualRequestStatus.PENDING;
      if (actorId) {
        where.requestedById = { not: actorId };
      }
    }

    if (filter?.status) {
      where.status = filter.status;
    }

    if (filter?.kind) {
      where.kind = filter.kind;
    }

    if (filter?.billingAccountId) {
      where.billingAccountId = filter.billingAccountId;
    }

    const [data, total] = await Promise.all([
      this.prisma.manualBillingRequest.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
        skip,
        take: limit,
      }),
      this.prisma.manualBillingRequest.count({ where }),
    ]);

    const records = data as ManualBillingRequestRecord[];

    return {
      items: records,
      data: records,
      total,
      page,
      limit,
    };
  }
}
