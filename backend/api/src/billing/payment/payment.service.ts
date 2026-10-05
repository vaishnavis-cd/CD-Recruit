import {
  Injectable,
  Logger,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  UnauthorizedException,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import { PrismaService } from "../../prisma/prisma.service";
import { PlatformStaffRole, PaymentProvider, PaymentStatus } from "@cd-recruit/shared-types";
import { LedgerService } from "../ledger/ledger.service";
import { CreditPoolService } from "../pool/credit-pool.service";
import { PriceBookService } from "../price/price-book.service";
import { BillingAccountService } from "../account/billing-account.service";
import { PoolGrantSource, PoolType } from "../pool/credit-pool.types";
import { LedgerReason, LedgerEntryType } from "../ledger/ledger.types";
import {
  PaymentActor,
  RecordManualInvoicePaymentDto,
  CreatePaymentRecordDto,
  CapturePaymentDto,
  IssueRefundDto,
  PaymentResultDto,
  ListPaymentsOptions,
  PaginatedPaymentsResultDto,
  DisputePaymentDto,
  FailPaymentDto,
} from "./payment.types";

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: LedgerService,
    private readonly creditPoolService: CreditPoolService,
    private readonly priceBookService: PriceBookService,
    private readonly billingAccountService: BillingAccountService,
  ) {}

  /**
   * Validates and extracts actor info.
   * Enforces that only PlatformStaff can perform payment mutations.
   */
  private extractStaffActor(actor: PaymentActor): {
    actorId: string;
    actorRole: PlatformStaffRole;
  } {
    if (!actor || typeof actor !== "object") {
      throw new UnauthorizedException("AUTHENTICATION_REQUIRED: Valid PlatformStaff actor required");
    }

    if (actor.isPlatformStaff !== true) {
      throw new ForbiddenException(
        "PLATFORM_ROLE_REQUIRED: Only authenticated PlatformStaff can perform payment operations",
      );
    }

    const role = (actor.platformRole || actor.role) as PlatformStaffRole;
    if (!role || !Object.values(PlatformStaffRole).includes(role)) {
      throw new BadRequestException("INVALID_ACTOR_ROLE: Actor must possess a valid PlatformStaffRole");
    }

    return { actorId: actor.id, actorRole: role };
  }

  /**
   * Enforces Artifact 06 Ã‚Â§3.2:
   * Only FINANCE and OWNER roles can record manual PO payments or issue cash refunds.
   * SUPPORT and Recruiter roles are strictly forbidden.
   */
  private assertFinanceOrOwner(actorInfo: {
    actorId: string;
    actorRole: PlatformStaffRole;
  }): void {
    if (
      actorInfo.actorRole !== PlatformStaffRole.FINANCE &&
      actorInfo.actorRole !== PlatformStaffRole.OWNER
    ) {
      throw new ForbiddenException(
        `FINANCE_ROLE_REQUIRED: Role '${actorInfo.actorRole}' is not authorized. Only FINANCE or OWNER can record payments or refunds.`,
      );
    }
  }

  /**
   * Records an offline Enterprise PO / wire transfer invoice payment.
   * Per Artifact 04 (Ã‚Â§2.4 API-H2-17), Artifact 06 (Ã‚Â§1.4), and Re-Audit Ã‚Â§9.1.
   *
   * Transactionally executes:
   * 1. Validate BillingAccount (must exist and be ACTIVE).
   * 2. Validate PriceBookEntry (country, currency, pricing).
   * 3. Validate credit quantity & calculate minor amounts.
   * 4. Insert Payment record (provider: MANUAL_INVOICE, status: CAPTURED).
   * 5. Mint CreditPool (source: CONTRACT, paymentId: payment.id).
   * 6. Opening GRANT ledger entry is written with paymentId linkage.
   * 7. Transition BillingAccount.hasPaidPurchase = true.
   * 8. Append PAYMENT_CAPTURED billing audit event.
   */
  async recordManualInvoicePayment(
    actor: PaymentActor,
    dto: RecordManualInvoicePaymentDto,
  ): Promise<PaymentResultDto> {
    const actorInfo = this.extractStaffActor(actor);
    this.assertFinanceOrOwner(actorInfo);

    if (!dto.billingAccountId || typeof dto.billingAccountId !== "string") {
      throw new BadRequestException("INVALID_BILLING_ACCOUNT_ID: Billing account ID is required");
    }

    if (!dto.invoiceNumber || typeof dto.invoiceNumber !== "string" || dto.invoiceNumber.trim() === "") {
      throw new BadRequestException("INVALID_INVOICE_NUMBER: A valid invoice number is mandatory");
    }

    if (!dto.priceBookEntryId || typeof dto.priceBookEntryId !== "string") {
      throw new BadRequestException("INVALID_PRICE_BOOK_ENTRY_ID: Price book entry ID is required");
    }

    if (!dto.quantityCredits || !Number.isInteger(dto.quantityCredits) || dto.quantityCredits <= 0) {
      throw new BadRequestException("INVALID_QUANTITY: Purchased credits must be a positive integer");
    }

    if (dto.taxMinor !== undefined && dto.taxMinor !== null) {
      if (!Number.isInteger(dto.taxMinor) || dto.taxMinor < 0) {
        throw new BadRequestException("INVALID_TAX_MINOR: Tax amount must be a non-negative integer in minor units");
      }
    }

    const normalizedInvoiceNumber = dto.invoiceNumber.trim();

    // 1. Verify target BillingAccount
    const account = await this.prisma.billingAccount.findUnique({
      where: { id: dto.billingAccountId },
      include: { organizations: true },
    });

    if (!account) {
      throw new NotFoundException(`BILLING_ACCOUNT_NOT_FOUND: Billing account '${dto.billingAccountId}' not found`);
    }

    if (account.status !== "ACTIVE") {
      throw new ForbiddenException(
        `ACCOUNT_NOT_ELIGIBLE: Billing account is '${account.status}'. Purchases require an ACTIVE billing account.`,
      );
    }

    // 2. Resolve PriceBookEntry
    const priceEntry = await this.prisma.priceBookEntry.findUnique({
      where: { id: dto.priceBookEntryId },
    });

    if (!priceEntry) {
      throw new NotFoundException(`PRICE_BOOK_ENTRY_NOT_FOUND: Price book entry '${dto.priceBookEntryId}' not found`);
    }

    // 3. Country and Currency validation
    if (account.billingCountry !== priceEntry.billingCountry) {
      throw new BadRequestException(
        `COUNTRY_MISMATCH: BillingAccount country '${account.billingCountry}' does not match PriceBookEntry country '${priceEntry.billingCountry}'`,
      );
    }

    if (account.currency !== priceEntry.currency) {
      throw new BadRequestException(
        `CURRENCY_MISMATCH: BillingAccount currency '${account.currency}' does not match PriceBookEntry currency '${priceEntry.currency}'`,
      );
    }

    if (dto.currency && dto.currency.trim().toUpperCase() !== priceEntry.currency) {
      throw new BadRequestException(
        `CURRENCY_MISMATCH: DTO currency '${dto.currency}' does not match PriceBookEntry currency '${priceEntry.currency}'`,
      );
    }

    // 4. Minor unit arithmetic calculation
    const unitPriceMinor = priceEntry.unitPriceMinor;
    const subtotalMinor = unitPriceMinor * dto.quantityCredits;
    const taxMinor = dto.taxMinor ?? 0;
    const expectedAmountMinor = subtotalMinor + taxMinor;

    if (dto.amountMinor !== undefined && dto.amountMinor !== null) {
      if (!Number.isInteger(dto.amountMinor) || dto.amountMinor <= 0) {
        throw new BadRequestException("INVALID_AMOUNT_MINOR: Amount must be a positive integer in minor units");
      }
      if (dto.amountMinor !== expectedAmountMinor && dto.amountMinor !== subtotalMinor) {
        throw new BadRequestException(
          `AMOUNT_CALCULATION_MISMATCH: Provided amountMinor (${dto.amountMinor}) does not match expected (${expectedAmountMinor}) based on unitPriceMinor (${unitPriceMinor}) * quantity (${dto.quantityCredits}) + tax (${taxMinor})`,
        );
      }
    }

    const amountMinor = expectedAmountMinor;
    const capturedAt = dto.capturedAt ? new Date(dto.capturedAt) : new Date();

    // 5. Execute in atomic transaction
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Idempotency: check if invoice already recorded
        const existing = await tx.payment.findUnique({
          where: {
            provider_providerPaymentId: {
              provider: PaymentProvider.MANUAL_INVOICE,
              providerPaymentId: normalizedInvoiceNumber,
            },
          },
          include: {
            pools: true,
            ledgerEntries: true,
          },
        });

        if (existing) {
          // Verify if it is an exact retry
          if (
            existing.billingAccountId === dto.billingAccountId &&
            existing.priceBookEntryId === dto.priceBookEntryId &&
            existing.quantityCredits === dto.quantityCredits &&
            existing.amountMinor === amountMinor &&
            existing.currency === priceEntry.currency
          ) {
            this.logger.log(`[PaymentService] Idempotent manual invoice replay: ${normalizedInvoiceNumber}`);
            return this.mapPaymentResult(existing);
          }
          throw new ConflictException(
            `INVOICE_NUMBER_ALREADY_EXISTS: Invoice number '${normalizedInvoiceNumber}' already recorded with different parameters`,
          );
        }

        const paymentId = randomUUID();

        // 5a. Create Payment record
        const payment = await tx.payment.create({
          data: {
            id: paymentId,
            billingAccountId: dto.billingAccountId,
            provider: PaymentProvider.MANUAL_INVOICE,
            providerPaymentId: normalizedInvoiceNumber,
            providerOrderId: dto.poNumber?.trim() || null,
            status: PaymentStatus.CAPTURED,
            priceBookEntryId: priceEntry.id,
            quantityCredits: dto.quantityCredits,
            unitPriceMinor,
            amountMinor,
            taxMinor: dto.taxMinor ?? null,
            currency: priceEntry.currency,
            invoiceNumber: normalizedInvoiceNumber,
            capturedAt,
          },
        });

        // 5b. Mint CreditPool (CONTRACT pool per Artifact 04 Ã‚Â§2.4 & Artifact 06 Ã‚Â§1.4)
        const pool = await this.creditPoolService.createPool(
          {
            billingAccountId: dto.billingAccountId,
            name: dto.poolName?.trim() || `Enterprise PO ${normalizedInvoiceNumber}`,
            poolType: (dto.poolType || priceEntry.poolType) as PoolType,
            source: PoolGrantSource.CONTRACT,
            totalCredits: dto.quantityCredits,
            validityDays: priceEntry.validityDays ?? null,
            unitPriceMinor,
            currency: priceEntry.currency,
            paymentId: payment.id,
            reason: LedgerReason.PURCHASE_ALLOCATION,
          },
          {
            tx,
            actor: {
              id: actorInfo.actorId,
              role: actorInfo.actorRole,
              platformRole: actorInfo.actorRole,
              isPlatformStaff: true,
            },
            reason: dto.reason?.trim() || `Offline Enterprise PO Payment: ${normalizedInvoiceNumber}`,
            ticketRef: dto.poNumber?.trim() || null,
          },
        );

        // 5c. Transition BillingAccount.hasPaidPurchase = true
        await tx.billingAccount.update({
          where: { id: dto.billingAccountId },
          data: { hasPaidPurchase: true },
        });

        // 5d. Record append-only billing audit event
        await tx.billingAuditEvent.create({
          data: {
            actorId: actorInfo.actorId,
            actorRole: actorInfo.actorRole,
            subjectType: "PAYMENT",
            subjectId: payment.id,
            action: "PAYMENT_CAPTURED",
            before: null,
            after: {
              id: payment.id,
              billingAccountId: dto.billingAccountId,
              provider: PaymentProvider.MANUAL_INVOICE,
              providerPaymentId: normalizedInvoiceNumber,
              invoiceNumber: normalizedInvoiceNumber,
              poNumber: dto.poNumber?.trim() || null,
              status: PaymentStatus.CAPTURED,
              priceBookEntryId: priceEntry.id,
              quantityCredits: dto.quantityCredits,
              unitPriceMinor,
              amountMinor,
              taxMinor: dto.taxMinor ?? null,
              currency: priceEntry.currency,
              creditPoolId: pool.id,
              capturedAt,
            },
            reason: dto.reason?.trim() || "Manual enterprise invoice payment recorded",
            ticketRef: dto.poNumber?.trim() || null,
            executionResult: "SUCCESS",
          },
        });

        this.logger.log(
          `[PaymentService] Manual invoice payment recorded: ${normalizedInvoiceNumber} for BA ${dto.billingAccountId} (${dto.quantityCredits} credits, ${priceEntry.currency} ${amountMinor} minor) by ${actorInfo.actorRole}:${actorInfo.actorId}`,
        );

        return {
          id: payment.id,
          billingAccountId: payment.billingAccountId,
          provider: payment.provider,
          providerPaymentId: payment.providerPaymentId,
          providerOrderId: payment.providerOrderId,
          status: payment.status,
          priceBookEntryId: payment.priceBookEntryId,
          quantityCredits: payment.quantityCredits,
          unitPriceMinor: payment.unitPriceMinor,
          amountMinor: payment.amountMinor,
          taxMinor: payment.taxMinor,
          currency: payment.currency,
          invoiceNumber: payment.invoiceNumber,
          capturedAt: payment.capturedAt,
          createdAt: payment.createdAt,
          creditPoolId: pool.id,
          creditLedgerEntryId: `grant:pool:${pool.id}`,
        };
      });
    } catch (err: any) {
      if (
        err.code === "P2002" ||
        err.message?.includes("payment_provider_provider_payment_id_key")
      ) {
        // Handle concurrent duplicate submission race
        const existing = await this.prisma.payment.findUnique({
          where: {
            provider_providerPaymentId: {
              provider: PaymentProvider.MANUAL_INVOICE,
              providerPaymentId: normalizedInvoiceNumber,
            },
          },
          include: {
            pools: true,
            ledgerEntries: true,
          },
        });
        if (existing && existing.billingAccountId === dto.billingAccountId) {
          return this.mapPaymentResult(existing);
        }
        throw new ConflictException(
          `INVOICE_NUMBER_ALREADY_EXISTS: Invoice number '${normalizedInvoiceNumber}' already recorded`,
        );
      }
      throw err;
    }
  }

  /**
   * Creates a direct checkout payment intent record (e.g. status: CREATED).
   * Used for gateway transaction tracking prior to capture.
   */
  async createPaymentRecord(
    actor: PaymentActor,
    dto: CreatePaymentRecordDto,
  ): Promise<PaymentResultDto> {
    const actorInfo = this.extractStaffActor(actor);
    this.assertFinanceOrOwner(actorInfo);

    if (!dto.billingAccountId || typeof dto.billingAccountId !== "string") {
      throw new BadRequestException("INVALID_BILLING_ACCOUNT_ID: Billing account ID is required");
    }

    if (!dto.provider || typeof dto.provider !== "string") {
      throw new BadRequestException("INVALID_PROVIDER: Payment provider is required");
    }

    if (!dto.providerPaymentId || typeof dto.providerPaymentId !== "string") {
      throw new BadRequestException("INVALID_PROVIDER_PAYMENT_ID: Provider payment ID is required");
    }

    if (!dto.priceBookEntryId || typeof dto.priceBookEntryId !== "string") {
      throw new BadRequestException("INVALID_PRICE_BOOK_ENTRY_ID: Price book entry ID is required");
    }

    if (!dto.quantityCredits || !Number.isInteger(dto.quantityCredits) || dto.quantityCredits <= 0) {
      throw new BadRequestException("INVALID_QUANTITY: Purchased credits must be a positive integer");
    }

    if (!dto.amountMinor || !Number.isInteger(dto.amountMinor) || dto.amountMinor <= 0) {
      throw new BadRequestException("INVALID_AMOUNT_MINOR: Amount must be a positive integer in minor units");
    }

    const account = await this.prisma.billingAccount.findUnique({
      where: { id: dto.billingAccountId },
    });
    if (!account) {
      throw new NotFoundException(`BILLING_ACCOUNT_NOT_FOUND: Billing account '${dto.billingAccountId}' not found`);
    }

    const priceEntry = await this.prisma.priceBookEntry.findUnique({
      where: { id: dto.priceBookEntryId },
    });
    if (!priceEntry) {
      throw new NotFoundException(`PRICE_BOOK_ENTRY_NOT_FOUND: Price book entry '${dto.priceBookEntryId}' not found`);
    }

    if (account.currency !== priceEntry.currency || dto.currency.toUpperCase() !== priceEntry.currency) {
      throw new BadRequestException(
        `CURRENCY_MISMATCH: Currency must match BillingAccount and PriceBookEntry (${priceEntry.currency})`,
      );
    }

    const status = dto.status || PaymentStatus.CREATED;
    const paymentId = randomUUID();
    const capturedAt = status === PaymentStatus.CAPTURED ? (dto.capturedAt ? new Date(dto.capturedAt) : new Date()) : null;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.payment.findUnique({
          where: {
            provider_providerPaymentId: {
              provider: dto.provider as PaymentProvider,
              providerPaymentId: dto.providerPaymentId.trim(),
            },
          },
        });

        if (existing) {
          throw new ConflictException(
            `PAYMENT_ALREADY_EXISTS: Payment for provider '${dto.provider}' with ID '${dto.providerPaymentId}' already exists`,
          );
        }

        const payment = await tx.payment.create({
          data: {
            id: paymentId,
            billingAccountId: dto.billingAccountId,
            provider: dto.provider as PaymentProvider,
            providerPaymentId: dto.providerPaymentId.trim(),
            providerOrderId: dto.providerOrderId?.trim() || null,
            status: status as PaymentStatus,
            priceBookEntryId: priceEntry.id,
            quantityCredits: dto.quantityCredits,
            unitPriceMinor: priceEntry.unitPriceMinor,
            amountMinor: dto.amountMinor,
            taxMinor: dto.taxMinor ?? null,
            currency: priceEntry.currency,
            invoiceNumber: dto.invoiceNumber?.trim() || null,
            capturedAt,
          },
        });

        let poolId: string | null = null;
        if (status === PaymentStatus.CAPTURED) {
          const pool = await this.creditPoolService.createPool(
            {
              billingAccountId: dto.billingAccountId,
              name: `Purchase ${dto.providerPaymentId}`,
              poolType: priceEntry.poolType as PoolType,
              source: PoolGrantSource.PURCHASE,
              totalCredits: dto.quantityCredits,
              validityDays: priceEntry.validityDays ?? null,
              unitPriceMinor: priceEntry.unitPriceMinor,
              currency: priceEntry.currency,
              paymentId: payment.id,
              reason: LedgerReason.PURCHASE_ALLOCATION,
            },
            {
              tx,
              actor: {
                id: actorInfo.actorId,
                role: actorInfo.actorRole,
                platformRole: actorInfo.actorRole,
                isPlatformStaff: true,
              },
              reason: dto.reason || "Payment captured",
              ticketRef: dto.ticketRef || null,
            },
          );
          poolId = pool.id;

          await tx.billingAccount.update({
            where: { id: dto.billingAccountId },
            data: { hasPaidPurchase: true },
          });

          await tx.billingAuditEvent.create({
            data: {
              actorId: actorInfo.actorId,
              actorRole: actorInfo.actorRole,
              subjectType: "PAYMENT",
              subjectId: payment.id,
              action: "PAYMENT_CAPTURED",
              before: null,
              after: { id: payment.id, status: PaymentStatus.CAPTURED, poolId },
              reason: dto.reason || "Payment captured on creation",
              ticketRef: dto.ticketRef || null,
              executionResult: "SUCCESS",
            },
          });
        } else {
          await tx.billingAuditEvent.create({
            data: {
              actorId: actorInfo.actorId,
              actorRole: actorInfo.actorRole,
              subjectType: "PAYMENT",
              subjectId: payment.id,
              action: "PAYMENT_INTENT_CREATED",
              before: null,
              after: { id: payment.id, status: PaymentStatus.CREATED },
              reason: dto.reason || "Payment intent created",
              ticketRef: dto.ticketRef || null,
              executionResult: "SUCCESS",
            },
          });
        }

        return this.mapPaymentResult(payment, poolId);
      });
    } catch (err: any) {
      if (
        err.code === "P2002" ||
        err.message?.includes("payment_provider_provider_payment_id_key")
      ) {
        const existing = await this.prisma.payment.findUnique({
          where: {
            provider_providerPaymentId: {
              provider: dto.provider as PaymentProvider,
              providerPaymentId: dto.providerPaymentId.trim(),
            },
          },
          include: {
            pools: true,
            ledgerEntries: true,
          },
        });
        if (existing && existing.billingAccountId === dto.billingAccountId) {
          return this.mapPaymentResult(existing);
        }
        throw new ConflictException(
          `PAYMENT_ALREADY_EXISTS: Payment for provider '${dto.provider}' with ID '${dto.providerPaymentId}' already exists`,
        );
      }
      throw err;
    }
  }

  /**
   * Captures a pending payment record (transition from CREATED to CAPTURED).
   * Mints PURCHASE pool, sets hasPaidPurchase = true, and records PAYMENT_CAPTURED audit.
   */
  async capturePayment(
    actor: PaymentActor,
    paymentId: string,
    captureData?: CapturePaymentDto,
  ): Promise<PaymentResultDto> {
    const actorInfo = this.extractStaffActor(actor);
    this.assertFinanceOrOwner(actorInfo);

    if (!paymentId || typeof paymentId !== "string") {
      throw new BadRequestException("INVALID_PAYMENT_ID: Payment ID is required");
    }

    return await this.prisma.$transaction(async (tx) => {
      // Row lock on payment to serialize concurrent capture attempts
      const locked = await tx.$queryRawUnsafe<any[]>(
        `SELECT id, status FROM "billing"."payment" WHERE id = $1 FOR UPDATE`,
        paymentId,
      );

      if (!locked || locked.length === 0) {
        throw new NotFoundException(`PAYMENT_NOT_FOUND: Payment '${paymentId}' not found`);
      }

      const payment = await tx.payment.findUnique({
        where: { id: paymentId },
        include: { priceBookEntry: true, pools: true, ledgerEntries: true },
      });

      if (!payment) {
        throw new NotFoundException(`PAYMENT_NOT_FOUND: Payment '${paymentId}' not found`);
      }

      if (payment.status === PaymentStatus.CAPTURED) {
        this.logger.log(`[PaymentService] Payment ${paymentId} already captured (idempotent replay)`);
        return this.mapPaymentResult(payment);
      }

      if (payment.status !== PaymentStatus.CREATED) {
        throw new BadRequestException(
          `INVALID_PAYMENT_STATUS_FOR_CAPTURE: Cannot capture payment in status '${payment.status}'`,
        );
      }

      const capturedAt = captureData?.capturedAt ? new Date(captureData.capturedAt) : new Date();

      const updatedPayment = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.CAPTURED,
          capturedAt,
          providerOrderId: captureData?.providerOrderId || payment.providerOrderId,
        },
      });

      // Mint CreditPool for purchase
      const pool = await this.creditPoolService.createPool(
        {
          billingAccountId: payment.billingAccountId,
          name: captureData?.poolName || `Purchase ${payment.providerPaymentId}`,
          poolType: (captureData?.poolType || payment.priceBookEntry.poolType) as PoolType,
          source: PoolGrantSource.PURCHASE,
          totalCredits: payment.quantityCredits,
          validityDays: payment.priceBookEntry.validityDays ?? null,
          unitPriceMinor: payment.unitPriceMinor,
          currency: payment.currency,
          paymentId: payment.id,
          reason: LedgerReason.PURCHASE_ALLOCATION,
        },
        {
          tx,
          actor: {
            id: actorInfo.actorId,
            role: actorInfo.actorRole,
            platformRole: actorInfo.actorRole,
            isPlatformStaff: true,
          },
          reason: captureData?.reason || "Direct payment captured",
          ticketRef: captureData?.ticketRef || null,
        },
      );

      // Transition hasPaidPurchase
      await tx.billingAccount.update({
        where: { id: payment.billingAccountId },
        data: { hasPaidPurchase: true },
      });

      // Audit event
      await tx.billingAuditEvent.create({
        data: {
          actorId: actorInfo.actorId,
          actorRole: actorInfo.actorRole,
          subjectType: "PAYMENT",
          subjectId: payment.id,
          action: "PAYMENT_CAPTURED",
          before: { status: PaymentStatus.CREATED },
          after: {
            status: PaymentStatus.CAPTURED,
            capturedAt,
            creditPoolId: pool.id,
          },
          reason: captureData?.reason || "Payment captured",
          ticketRef: captureData?.ticketRef || null,
          executionResult: "SUCCESS",
        },
      });

      return this.mapPaymentResult(updatedPayment, pool.id);
    });
  }

  /**
   * Issues cash refunds on captured payments.
   * Enforces unconsumed-only boundaries (Artifact 02 Ã‚Â§6.3, Artifact 06 Ã‚Â§1.4).
   *
   * Invariants enforced:
   * - Actor must be FINANCE or OWNER platform staff.
   * - Payment must be in CAPTURED or PARTIALLY_REFUNDED state.
   * - Consumed credits cannot be refunded (cachedRemaining >= refundCredits).
   * - Delegates financial ledger debit to LedgerService.refundCredits.
   * - Transitions Payment status to PARTIALLY_REFUNDED or REFUNDED.
   * - Emits PAYMENT_REFUNDED audit event.
   */
  async issueRefund(
    actor: PaymentActor,
    dto: IssueRefundDto,
  ): Promise<PaymentResultDto> {
    const actorInfo = this.extractStaffActor(actor);
    this.assertFinanceOrOwner(actorInfo);

    if (!dto.paymentId || typeof dto.paymentId !== "string") {
      throw new BadRequestException("INVALID_PAYMENT_ID: Payment ID is required for refund");
    }

    return await this.prisma.$transaction(async (tx) => {
      // 1. Authoritative lookup of payment
      const payment = await tx.payment.findUnique({
        where: { id: dto.paymentId },
        include: {
          pools: true,
          ledgerEntries: true,
        },
      });

      if (!payment) {
        throw new NotFoundException(`PAYMENT_NOT_FOUND: Payment '${dto.paymentId}' not found`);
      }

      if (payment.status === PaymentStatus.REFUNDED) {
        throw new ConflictException(
          `PAYMENT_ALREADY_REFUNDED: Payment '${payment.id}' has already been fully refunded`,
        );
      }

      if (
        payment.status !== PaymentStatus.CAPTURED &&
        payment.status !== PaymentStatus.PARTIALLY_REFUNDED
      ) {
        throw new BadRequestException(
          `PAYMENT_NOT_REFUNDABLE: Cannot refund payment with status '${payment.status}'`,
        );
      }

      // 2. Calculate remaining refundable credits from payment record
      const previousRefundEntries = await tx.creditLedgerEntry.findMany({
        where: {
          paymentId: payment.id,
          entryType: LedgerEntryType.REFUND,
        },
      });

      const totalPreviousRefundedCredits = previousRefundEntries.reduce(
        (sum, entry) => sum + Math.abs(entry.amount),
        0,
      );

      const maxRemainingRefundableCredits = payment.quantityCredits - totalPreviousRefundedCredits;
      if (maxRemainingRefundableCredits <= 0) {
        throw new ConflictException(
          `PAYMENT_ALREADY_REFUNDED: All purchased credits (${payment.quantityCredits}) have already been refunded`,
        );
      }

      // 3. Determine requested refund credits
      let refundCredits: number;
      if (dto.quantityCredits !== undefined && dto.quantityCredits !== null) {
        if (!Number.isInteger(dto.quantityCredits) || dto.quantityCredits <= 0) {
          throw new BadRequestException("INVALID_REFUND_CREDITS: Refund credits must be a positive integer");
        }
        refundCredits = dto.quantityCredits;
      } else if (dto.amountMinor !== undefined && dto.amountMinor !== null) {
        if (!Number.isInteger(dto.amountMinor) || dto.amountMinor <= 0) {
          throw new BadRequestException("INVALID_REFUND_AMOUNT: Refund amount must be a positive integer in minor units");
        }
        refundCredits = Math.floor(dto.amountMinor / payment.unitPriceMinor);
        if (refundCredits <= 0) {
          throw new BadRequestException(
            `REFUND_AMOUNT_TOO_SMALL: Amount ${dto.amountMinor} minor is less than unit price ${payment.unitPriceMinor} minor`,
          );
        }
      } else {
        // Full remaining refund by default
        refundCredits = maxRemainingRefundableCredits;
      }

      if (refundCredits > maxRemainingRefundableCredits) {
        throw new BadRequestException(
          `REFUND_EXCEEDS_PAYMENT_BALANCE: Cannot refund ${refundCredits} credits; only ${maxRemainingRefundableCredits} credits remain refundable on this payment`,
        );
      }

      // 4. Resolve linked pool(s)
      let targetPoolId = dto.poolId;
      if (!targetPoolId) {
        const linkedPool = payment.pools.find((p) => p.cachedRemaining > 0) || payment.pools[0];
        if (!linkedPool) {
          throw new NotFoundException(
            `CREDIT_POOL_NOT_FOUND: No linked credit pool found for payment '${payment.id}'`,
          );
        }
        targetPoolId = linkedPool.id;
      }

      // 5. Delegate financial movement to LedgerService.refundCredits
      await this.ledgerService.refundCredits({
        billingAccountId: payment.billingAccountId,
        creditPoolId: targetPoolId,
        paymentId: payment.id,
        amount: refundCredits,
        reason: dto.reason?.trim() || "CASH_REFUND",
        reasonNote: `Cash refund for payment ${payment.id}`,
        ticketRef: dto.ticketRef?.trim() || null,
        idempotencyKey: dto.idempotencyKey,
        actor: {
          id: actorInfo.actorId,
          role: actorInfo.actorRole,
          platformRole: actorInfo.actorRole,
          isPlatformStaff: true,
        },
        tx,
      });

      // 6. Update Payment status
      const newTotalRefunded = totalPreviousRefundedCredits + refundCredits;
      const isFullRefund = newTotalRefunded >= payment.quantityCredits;
      const newStatus = isFullRefund ? PaymentStatus.REFUNDED : PaymentStatus.PARTIALLY_REFUNDED;

      const updatedPayment = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: newStatus,
        },
      });

      const refundAmountMinor = refundCredits * payment.unitPriceMinor;

      // 7. Write audit event in billing.billing_audit_event
      await tx.billingAuditEvent.create({
        data: {
          actorId: actorInfo.actorId,
          actorRole: actorInfo.actorRole,
          subjectType: "PAYMENT",
          subjectId: payment.id,
          action: isFullRefund ? "PAYMENT_REFUNDED" : "PAYMENT_PARTIALLY_REFUNDED",
          before: {
            status: payment.status,
            refundedCredits: totalPreviousRefundedCredits,
          },
          after: {
            status: newStatus,
            refundCredits,
            refundAmountMinor,
            totalRefundedCredits: newTotalRefunded,
            creditPoolId: targetPoolId,
          },
          reason: dto.reason?.trim() || "Cash refund for unconsumed credits",
          ticketRef: dto.ticketRef?.trim() || null,
          executionResult: "SUCCESS",
        },
      });

      this.logger.log(
        `[PaymentService] Refund issued: ${refundCredits} credits (${refundAmountMinor} minor) on payment ${payment.id} (new status: ${newStatus}) by ${actorInfo.actorRole}:${actorInfo.actorId}`,
      );

      return this.mapPaymentResult(
        updatedPayment,
        targetPoolId,
        newTotalRefunded,
        newTotalRefunded * payment.unitPriceMinor,
      );
    });
  }

  /**
   * Disputes a payment (transitions to DISPUTED, suspends associated pools).
   * Per Artifact 02 Ã‚Â§6.4 and Artifact 06 Ã‚Â§1.4.
   */
  async disputePayment(
    actor: PaymentActor,
    paymentId: string,
    dto?: DisputePaymentDto,
  ): Promise<PaymentResultDto> {
    const actorInfo = this.extractStaffActor(actor);
    this.assertFinanceOrOwner(actorInfo);

    if (!paymentId || typeof paymentId !== "string") {
      throw new BadRequestException("INVALID_PAYMENT_ID: Payment ID is required");
    }

    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { pools: true, billingAccount: true },
    });

    if (!payment) {
      throw new NotFoundException(`PAYMENT_NOT_FOUND: Payment '${paymentId}' not found`);
    }

    if (payment.status === PaymentStatus.DISPUTED) {
      this.logger.log(`[PaymentService] Payment ${paymentId} already disputed (idempotent)`);
      return this.mapPaymentResult(payment);
    }

    // Suspend linked pools that are not terminal
    let suspendedPoolId: string | null = null;
    for (const pool of payment.pools) {
      if (
        pool.status !== "CANCELLED" &&
        pool.status !== "EXPIRED" &&
        pool.status !== "EXHAUSTED"
      ) {
        await this.creditPoolService.suspendPool(
          pool.id,
          dto?.reason || "Payment dispute / chargeback filed with payment gateway",
          {
            actor: {
              id: actorInfo.actorId,
              role: actorInfo.actorRole,
              platformRole: actorInfo.actorRole,
              isPlatformStaff: true,
            },
          },
        );
        suspendedPoolId = pool.id;
      }
    }

    return await this.prisma.$transaction(async (tx) => {
      const updatedPayment = await tx.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.DISPUTED },
      });

      // Check account available balance per Rule 6.4:
      // "If the account's total available balance drops below 0, the BillingAccount transitions to status = RESTRICTED."
      const activePools = await tx.creditPool.findMany({
        where: {
          billingAccountId: payment.billingAccountId,
          status: { in: ["ACTIVE", "QUEUED"] },
        },
      });
      const totalAvailable = activePools.reduce((sum, p) => sum + p.cachedRemaining, 0);
      if (totalAvailable <= 0 && payment.billingAccount.status === "ACTIVE") {
        await tx.billingAccount.update({
          where: { id: payment.billingAccountId },
          data: { status: "RESTRICTED" },
        });
      }

      await tx.billingAuditEvent.create({
        data: {
          actorId: actorInfo.actorId,
          actorRole: actorInfo.actorRole,
          subjectType: "PAYMENT",
          subjectId: payment.id,
          action: "PAYMENT_DISPUTED",
          before: { status: payment.status },
          after: { status: PaymentStatus.DISPUTED, suspendedPoolId },
          reason: dto?.reason || "Payment disputed by customer/gateway",
          ticketRef: dto?.ticketRef || null,
          executionResult: "SUCCESS",
        },
      });

      return this.mapPaymentResult(updatedPayment, suspendedPoolId);
    });
  }

  /**
   * Marks a payment as FAILED (e.g. gateway payment failed / abandoned).
   */
  async failPayment(
    actor: PaymentActor,
    paymentId: string,
    dto?: FailPaymentDto,
  ): Promise<PaymentResultDto> {
    const actorInfo = this.extractStaffActor(actor);
    this.assertFinanceOrOwner(actorInfo);

    if (!paymentId || typeof paymentId !== "string") {
      throw new BadRequestException("INVALID_PAYMENT_ID: Payment ID is required");
    }

    return await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { id: paymentId },
        include: { pools: true },
      });

      if (!payment) {
        throw new NotFoundException(`PAYMENT_NOT_FOUND: Payment '${paymentId}' not found`);
      }

      if (payment.status === PaymentStatus.FAILED) {
        return this.mapPaymentResult(payment);
      }

      if (payment.status !== PaymentStatus.CREATED) {
        throw new BadRequestException(
          `INVALID_PAYMENT_STATUS: Cannot mark payment in status '${payment.status}' as FAILED`,
        );
      }

      const updatedPayment = await tx.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.FAILED },
      });

      await tx.billingAuditEvent.create({
        data: {
          actorId: actorInfo.actorId,
          actorRole: actorInfo.actorRole,
          subjectType: "PAYMENT",
          subjectId: payment.id,
          action: "PAYMENT_FAILED",
          before: { status: payment.status },
          after: { status: PaymentStatus.FAILED },
          reason: dto?.reason || "Payment marked as failed by gateway",
          executionResult: "SUCCESS",
        },
      });

      return this.mapPaymentResult(updatedPayment);
    });
  }

  /**
   * Retrieves single Payment record by ID.
   */
  async getPaymentById(id: string): Promise<PaymentResultDto> {
    if (!id || typeof id !== "string") {
      throw new BadRequestException("INVALID_PAYMENT_ID: Payment ID must be provided");
    }

    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        pools: true,
        ledgerEntries: true,
      },
    });

    if (!payment) {
      throw new NotFoundException(`PAYMENT_NOT_FOUND: Payment '${id}' not found`);
    }

    return this.mapPaymentResult(payment);
  }

  /**
   * Queries paginated payments with filters.
   * Backs API-H2-16 (Payments Console).
   */
  async listPayments(options: ListPaymentsOptions = {}): Promise<PaginatedPaymentsResultDto> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 20));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (options.billingAccountId) where.billingAccountId = options.billingAccountId;
    if (options.status) where.status = options.status;
    if (options.provider) where.provider = options.provider;
    if (options.invoiceNumber) {
      where.invoiceNumber = { contains: options.invoiceNumber.trim(), mode: "insensitive" };
    }

    if (options.startDate || options.endDate) {
      where.createdAt = {};
      if (options.startDate) where.createdAt.gte = new Date(options.startDate);
      if (options.endDate) where.createdAt.lte = new Date(options.endDate);
    }

    const [total, payments] = await Promise.all([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          pools: true,
          ledgerEntries: true,
        },
      }),
    ]);

    return {
      data: payments.map((p) => this.mapPaymentResult(p)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Maps raw Prisma Payment entity to PaymentResultDto.
   */
  private mapPaymentResult(
    payment: any,
    creditPoolId?: string | null,
    refundedCredits?: number,
    refundedAmountMinor?: number,
  ): PaymentResultDto {
    const poolId =
      creditPoolId ||
      (payment.pools && payment.pools.length > 0 ? payment.pools[0].id : null);

    let calculatedRefundCredits = refundedCredits;
    let calculatedRefundMinor = refundedAmountMinor;

    if (calculatedRefundCredits === undefined && payment.ledgerEntries) {
      const refundEntries = payment.ledgerEntries.filter((e: any) => e.entryType === LedgerEntryType.REFUND);
      calculatedRefundCredits = refundEntries.reduce((sum: number, e: any) => sum + Math.abs(e.amount), 0);
      calculatedRefundMinor = calculatedRefundCredits * payment.unitPriceMinor;
    }

    return {
      id: payment.id,
      billingAccountId: payment.billingAccountId,
      provider: payment.provider,
      providerPaymentId: payment.providerPaymentId,
      providerOrderId: payment.providerOrderId,
      status: payment.status,
      priceBookEntryId: payment.priceBookEntryId,
      quantityCredits: payment.quantityCredits,
      unitPriceMinor: payment.unitPriceMinor,
      amountMinor: payment.amountMinor,
      taxMinor: payment.taxMinor,
      currency: payment.currency,
      invoiceNumber: payment.invoiceNumber,
      capturedAt: payment.capturedAt,
      createdAt: payment.createdAt,
      creditPoolId: poolId,
      creditLedgerEntryId: poolId ? `grant:pool:${poolId}` : null,
      refundedCredits: calculatedRefundCredits || 0,
      refundedAmountMinor: calculatedRefundMinor || 0,
    };
  }
}
