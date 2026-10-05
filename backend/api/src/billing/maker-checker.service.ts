import {
  Injectable,
  Logger,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { LedgerService } from "./ledger/ledger.service";
import {
  ManualRequestKind,
  ManualRequestStatus,
  LedgerEntryType,
  LedgerReason,
  GrantSource,
} from "@cd-recruit/shared-types";
import { Prisma } from "@prisma/client";

export interface CreateManualRequestDto {
  billingAccountId: string;
  kind: ManualRequestKind;
  payload: Record<string, any>;
  reason: string;
  ticketRef: string;
  requestedById: string; // Staff ID (Maker)
}

@Injectable()
export class MakerCheckerService {
  private readonly logger = new Logger(MakerCheckerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: LedgerService,
  ) {}

  /**
   * Creates a manual billing request in PENDING status (Maker step).
   */
  async createRequest(dto: CreateManualRequestDto) {
    if (!dto.ticketRef || dto.ticketRef.trim().length === 0) {
      throw new BadRequestException("ticketRef is mandatory for all manual billing requests");
    }
    if (!dto.reason || dto.reason.trim().length === 0) {
      throw new BadRequestException("reason is mandatory for all manual billing requests");
    }

    const account = await this.prisma.billingAccount.findUnique({
      where: { id: dto.billingAccountId },
    });
    if (!account) {
      throw new NotFoundException(`BillingAccount ${dto.billingAccountId} not found`);
    }

    return this.prisma.$transaction(async (tx) => {
      const request = await tx.manualBillingRequest.create({
        data: {
          billingAccountId: dto.billingAccountId,
          kind: dto.kind,
          payload: dto.payload,
          reason: dto.reason,
          ticketRef: dto.ticketRef,
          requestedById: dto.requestedById,
          status: ManualRequestStatus.PENDING,
        },
      });

      // Write audit event
      await tx.billingAuditEvent.create({
        data: {
          billingAccountId: dto.billingAccountId,
          subjectType: "REQUEST",
          subjectId: request.id,
          action: "REQUEST_CREATED",
          after: {
            kind: request.kind,
            requestedById: request.requestedById,
            ticketRef: request.ticketRef,
            payload: request.payload,
          },
          actorId: dto.requestedById,
          requestId: request.id,
        },
      });

      return request;
    });
  }

  /**
   * Approves and transactionally executes a pending manual billing request (Checker step).
   * Enforces Rule R8: distinct maker and checker (requestedById !== approvedById).
   */
  async approveAndExecute(requestId: string, approvedById: string) {
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.manualBillingRequest.findUnique({
        where: { id: requestId },
      });
      if (!request) {
        throw new NotFoundException(`ManualBillingRequest ${requestId} not found`);
      }

      if (request.status !== ManualRequestStatus.PENDING) {
        throw new BadRequestException(
          `Request ${requestId} cannot be approved (current status: ${request.status})`,
        );
      }

      // Rule R8 / chk_maker_checker: Distinct identities strictly enforced
      if (request.requestedById === approvedById) {
        throw new ForbiddenException(
          "Maker cannot approve their own request (Rule R8 dual-authorization violation)",
        );
      }

      await this.ledgerService.acquireAccountLock(tx, request.billingAccountId);

      // Set PostgreSQL session variable for trigger bypass/audit (Rule 4 CreditPool trigger)
      await tx.$executeRawUnsafe(`SET LOCAL proctora.request_id = '${request.id}'`);

      const payload = request.payload as Record<string, any>;
      const account = await tx.billingAccount.findUnique({
        where: { id: request.billingAccountId },
        include: { organizations: true },
      });
      if (!account) {
        throw new NotFoundException(`BillingAccount ${request.billingAccountId} not found`);
      }
      const organizationId = account.organizations[0]?.id || "system";

      let beforeState: any = null;
      let afterState: any = null;

      switch (request.kind) {
        case ManualRequestKind.GRANT: {
          const poolId = payload.creditPoolId;
          const amount = payload.amount;
          const grantSource = (payload.grantSource as GrantSource) || GrantSource.GOODWILL;

          if (!poolId || !amount || amount <= 0) {
            throw new BadRequestException("GRANT requires creditPoolId and positive amount");
          }

          const pool = await tx.creditPool.findUnique({ where: { id: poolId } });
          if (!pool) throw new NotFoundException(`Pool ${poolId} not found`);
          beforeState = { cachedRemaining: pool.cachedRemaining };

          const entry = await this.ledgerService.recordEntry(tx, {
            billingAccountId: request.billingAccountId,
            organizationId,
            creditPoolId: poolId,
            entryType: LedgerEntryType.GRANT,
            amount,
            grantSource,
            reason: (payload.reason as LedgerReason) || LedgerReason.GOODWILL,
            reasonNote: request.reason,
            requestId: request.id,
            idempotencyKey: `manual:grant:${request.id}`,
            actorId: request.requestedById,
            approvedById,
            shadow: false,
          });

          afterState = { cachedRemaining: entry.balanceAfter };
          break;
        }

        case ManualRequestKind.ADJUST: {
          const poolId = payload.creditPoolId;
          const amount = payload.amount;
          if (!poolId || amount === 0) {
            throw new BadRequestException("ADJUST requires creditPoolId and non-zero amount");
          }

          const pool = await tx.creditPool.findUnique({ where: { id: poolId } });
          if (!pool) throw new NotFoundException(`Pool ${poolId} not found`);
          beforeState = { cachedRemaining: pool.cachedRemaining };

          const entry = await this.ledgerService.recordEntry(tx, {
            billingAccountId: request.billingAccountId,
            organizationId,
            creditPoolId: poolId,
            entryType: LedgerEntryType.ADJUST,
            amount,
            reason: LedgerReason.MANUAL_CORRECTION,
            reasonNote: request.reason,
            requestId: request.id,
            idempotencyKey: `manual:adjust:${request.id}`,
            actorId: request.requestedById,
            approvedById,
            shadow: false,
          });

          afterState = { cachedRemaining: entry.balanceAfter };
          break;
        }

        case ManualRequestKind.REFUND: {
          const poolId = payload.creditPoolId;
          const amount = payload.amount; // Should be negative
          const paymentId = payload.paymentId;
          if (!poolId || !amount || amount >= 0 || !paymentId) {
            throw new BadRequestException("REFUND requires creditPoolId, paymentId, and negative amount");
          }

          const pool = await tx.creditPool.findUnique({ where: { id: poolId } });
          if (!pool) throw new NotFoundException(`Pool ${poolId} not found`);
          beforeState = { cachedRemaining: pool.cachedRemaining };

          const entry = await this.ledgerService.recordEntry(tx, {
            billingAccountId: request.billingAccountId,
            organizationId,
            creditPoolId: poolId,
            entryType: LedgerEntryType.REFUND,
            amount,
            paymentId,
            reason: LedgerReason.PAYMENT_REFUNDED,
            reasonNote: request.reason,
            requestId: request.id,
            idempotencyKey: `manual:refund:${request.id}`,
            actorId: request.requestedById,
            approvedById,
            shadow: false,
          });

          afterState = { cachedRemaining: entry.balanceAfter };
          break;
        }

        case ManualRequestKind.EXPIRY_EXTEND: {
          const poolId = payload.creditPoolId;
          const newExpiresAt = new Date(payload.newExpiresAt);
          if (!poolId || isNaN(newExpiresAt.getTime())) {
            throw new BadRequestException("EXPIRY_EXTEND requires creditPoolId and valid newExpiresAt");
          }

          const pool = await tx.creditPool.findUnique({ where: { id: poolId } });
          if (!pool) throw new NotFoundException(`Pool ${poolId} not found`);
          beforeState = { expiresAt: pool.expiresAt };

          await tx.creditPool.update({
            where: { id: poolId },
            data: { expiresAt: newExpiresAt },
          });

          afterState = { expiresAt: newExpiresAt };
          break;
        }

        case ManualRequestKind.OVERDRAFT_LIMIT: {
          const newLimit = payload.newOverdraftLimit;
          if (!Number.isInteger(newLimit) || newLimit < 0) {
            throw new BadRequestException("newOverdraftLimit must be a non-negative integer");
          }

          beforeState = { overdraftLimit: account.overdraftLimit };

          await tx.billingAccount.update({
            where: { id: account.id },
            data: { overdraftLimit: newLimit },
          });

          afterState = { overdraftLimit: newLimit };
          break;
        }

        case ManualRequestKind.ACCOUNT_STATUS: {
          const newStatus = payload.newStatus;
          beforeState = { status: account.status };

          await tx.billingAccount.update({
            where: { id: account.id },
            data: { status: newStatus },
          });

          afterState = { status: newStatus };
          break;
        }

        case ManualRequestKind.BILLING_COUNTRY: {
          const newCountry = payload.newCountry;
          beforeState = { billingCountry: account.billingCountry };

          await tx.billingAccount.update({
            where: { id: account.id },
            data: { billingCountry: newCountry },
          });

          afterState = { billingCountry: newCountry };
          break;
        }

        default:
          throw new BadRequestException(`Unsupported request kind: ${request.kind}`);
      }

      const now = new Date();
      const updatedRequest = await tx.manualBillingRequest.update({
        where: { id: request.id },
        data: {
          status: ManualRequestStatus.EXECUTED,
          approvedById,
          decidedAt: now,
          executedAt: now,
        },
      });

      // Write immutable audit event
      await tx.billingAuditEvent.create({
        data: {
          billingAccountId: request.billingAccountId,
          subjectType: "REQUEST",
          subjectId: request.id,
          action: `REQUEST_EXECUTED_${request.kind}`,
          before: beforeState,
          after: afterState,
          actorId: request.requestedById,
          approvedById,
          requestId: request.id,
        },
      });

      return updatedRequest;
    });
  }

  /**
   * Rejects a manual billing request.
   */
  async rejectRequest(requestId: string, decidedById: string, rejectionReason?: string) {
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.manualBillingRequest.findUnique({
        where: { id: requestId },
      });
      if (!request) {
        throw new NotFoundException(`ManualBillingRequest ${requestId} not found`);
      }
      if (request.status !== ManualRequestStatus.PENDING) {
        throw new BadRequestException(`Request ${requestId} cannot be rejected (status: ${request.status})`);
      }
      if (request.requestedById === decidedById) {
        throw new ForbiddenException("Maker cannot reject their own request as checker");
      }

      const now = new Date();
      const updated = await tx.manualBillingRequest.update({
        where: { id: request.id },
        data: {
          status: ManualRequestStatus.REJECTED,
          approvedById: decidedById,
          decidedAt: now,
        },
      });

      await tx.billingAuditEvent.create({
        data: {
          billingAccountId: request.billingAccountId,
          subjectType: "REQUEST",
          subjectId: request.id,
          action: "REQUEST_REJECTED",
          before: { status: ManualRequestStatus.PENDING },
          after: { status: ManualRequestStatus.REJECTED, rejectionReason },
          actorId: request.requestedById,
          approvedById: decidedById,
          requestId: request.id,
        },
      });

      return updated;
    });
  }

  /**
   * Cancels a pending request by the original requester.
   */
  async cancelRequest(requestId: string, actorId: string) {
    const request = await this.prisma.manualBillingRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) {
      throw new NotFoundException(`ManualBillingRequest ${requestId} not found`);
    }
    if (request.status !== ManualRequestStatus.PENDING) {
      throw new BadRequestException(`Only PENDING requests can be cancelled`);
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.manualBillingRequest.update({
        where: { id: request.id },
        data: { status: ManualRequestStatus.CANCELLED },
      });

      await tx.billingAuditEvent.create({
        data: {
          billingAccountId: request.billingAccountId,
          subjectType: "REQUEST",
          subjectId: request.id,
          action: "REQUEST_CANCELLED",
          actorId,
          requestId: request.id,
        },
      });

      return updated;
    });
  }

  /**
   * Retrieves a manual billing request by ID.
   */
  async getRequestById(requestId: string) {
    return this.prisma.manualBillingRequest.findUnique({
      where: { id: requestId },
    });
  }

  /**
   * Lists requests for an account.
   */
  async listRequestsForAccount(billingAccountId: string) {
    return this.prisma.manualBillingRequest.findMany({
      where: { billingAccountId },
      orderBy: { createdAt: "desc" },
    });
  }
}
