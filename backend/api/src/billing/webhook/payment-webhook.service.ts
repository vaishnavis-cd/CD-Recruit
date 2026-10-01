import {
  Injectable,
  Logger,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
  ForbiddenException,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";
import { PrismaService } from "../../prisma/prisma.service";
import { PaymentService } from "../payment/payment.service";
import { CreditPoolService } from "../pool/credit-pool.service";
import { QueueProviderPort } from "../../queue/queue-provider.port";
import { PlatformStaffRole, PaymentProvider, PaymentStatus } from "@cd-recruit/shared-types";
import { AppConfig } from "../../config/configuration";
import {
  SupportedWebhookProvider,
  WebhookEventStatus,
  RazorpayEventType,
  StripeEventType,
  IngestWebhookResultDto,
  ReplayWebhookResultDto,
  WebhookActor,
} from "./payment-webhook.types";

@Injectable()
export class PaymentWebhookService implements OnModuleInit {
  private readonly logger = new Logger(PaymentWebhookService.name);

  private readonly systemActor = {
    id: "system:webhook",
    role: PlatformStaffRole.FINANCE,
    platformRole: PlatformStaffRole.FINANCE,
    email: "system.webhook@proctora.platform",
    isPlatformStaff: true,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentService: PaymentService,
    private readonly creditPoolService: CreditPoolService,
    private readonly queueProvider: QueueProviderPort,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  onModuleInit() {
    // If running with LocalFakeQueueProvider (local / test mode), register processor handler
    if (
      this.queueProvider &&
      "registerHandler" in this.queueProvider &&
      typeof (this.queueProvider as any).registerHandler === "function"
    ) {
      (this.queueProvider as any).registerHandler(
        "payment-webhook",
        "process-payment-webhook",
        async (payload: Record<string, unknown>) => {
          const inboxId = (payload.inboxId || payload.eventId) as string;
          if (inboxId) {
            try {
              await this.processWebhookEventJob(inboxId);
            } catch (err: any) {
              this.logger.error(
                `[PaymentWebhookService] Async job execution failed for inbox ID ${inboxId}: ${err.message}`,
              );
            }
          }
        },
      );
      this.logger.log("[PaymentWebhookService] Registered fake queue handler for payment-webhook");
    }
  }

  /**
   * Normalizes incoming provider string to standard PaymentProvider enum.
   */
  normalizeProvider(provider: string): PaymentProvider {
    if (!provider || typeof provider !== "string") {
      throw new BadRequestException("INVALID_PROVIDER: Payment provider string is required");
    }

    const normalized = provider.trim().toUpperCase();
    if (normalized === "RAZORPAY") return PaymentProvider.RAZORPAY;
    if (normalized === "STRIPE") return PaymentProvider.STRIPE;

    throw new BadRequestException(
      `UNSUPPORTED_PROVIDER: Provider '${provider}' is not supported. Supported providers: razorpay, stripe`,
    );
  }

  /**
   * Verifies Razorpay HMAC-SHA256 signature using raw payload buffer.
   * Header: X-Razorpay-Signature
   */
  verifyRazorpaySignature(rawBody: Buffer, signature: string): boolean {
    if (!signature || typeof signature !== "string") return false;

    const secret =
      this.configService.get<string>("razorpayWebhookSecret", { infer: true }) ||
      process.env.RAZORPAY_WEBHOOK_SECRET ||
      "";

    if (!secret) {
      this.logger.error("[PaymentWebhookService] RAZORPAY_WEBHOOK_SECRET is not configured");
      return false;
    }

    try {
      const hmac = crypto.createHmac("sha256", secret);
      hmac.update(rawBody);
      const computedHex = hmac.digest("hex");

      const signatureBuf = Buffer.from(signature.trim(), "utf8");
      const computedBuf = Buffer.from(computedHex, "utf8");

      if (signatureBuf.length !== computedBuf.length) {
        return false;
      }

      return crypto.timingSafeEqual(signatureBuf, computedBuf);
    } catch (err: any) {
      this.logger.warn(`[PaymentWebhookService] Error verifying Razorpay signature: ${err.message}`);
      return false;
    }
  }

  /**
   * Verifies Stripe webhook signature using raw payload buffer and timestamp tolerance.
   * Header: Stripe-Signature (format: t=1614552222,v1=5257a869e7ecebeda32affa62cd490b1362341f10f2943cfcf5b3e037ec7b70e)
   */
  verifyStripeSignature(rawBody: Buffer, signatureHeader: string): boolean {
    if (!signatureHeader || typeof signatureHeader !== "string") return false;

    const secret =
      this.configService.get<string>("stripeWebhookSecret", { infer: true }) ||
      process.env.STRIPE_WEBHOOK_SECRET ||
      "";

    if (!secret) {
      this.logger.error("[PaymentWebhookService] STRIPE_WEBHOOK_SECRET is not configured");
      return false;
    }

    try {
      const parts = signatureHeader.split(",");
      let timestamp: string | undefined;
      const signatures: string[] = [];

      for (const part of parts) {
        const [key, value] = part.trim().split("=");
        if (key === "t") timestamp = value;
        if (key === "v1" && value) signatures.push(value);
      }

      if (!timestamp || signatures.length === 0) {
        return false;
      }

      // 5-minute replay tolerance check (300 seconds)
      const timestampSec = parseInt(timestamp, 10);
      const currentSec = Math.floor(Date.now() / 1000);
      if (isNaN(timestampSec) || Math.abs(currentSec - timestampSec) > 300) {
        this.logger.warn(
          `[PaymentWebhookService] Stripe webhook timestamp expired or out of tolerance: t=${timestampSec}, now=${currentSec}`,
        );
        return false;
      }

      const signedPayload = `${timestamp}.${rawBody.toString("utf8")}`;
      const hmac = crypto.createHmac("sha256", secret);
      hmac.update(signedPayload, "utf8");
      const computedHex = hmac.digest("hex");
      const computedBuf = Buffer.from(computedHex, "utf8");

      for (const sig of signatures) {
        const sigBuf = Buffer.from(sig, "utf8");
        if (sigBuf.length === computedBuf.length && crypto.timingSafeEqual(sigBuf, computedBuf)) {
          return true;
        }
      }

      return false;
    } catch (err: any) {
      this.logger.warn(`[PaymentWebhookService] Error verifying Stripe signature: ${err.message}`);
      return false;
    }
  }

  /**
   * Public Webhook Ingress (API-H2-18).
   * Receives raw body, verifies cryptographic HMAC signature, records event in inbox (billing.payment_event),
   * enqueues BullMQ job, and returns HTTP 200 OK within SLA.
   */
  async ingestWebhookEvent(
    providerParam: string,
    headers: Record<string, string | string[] | undefined>,
    rawBody: Buffer,
  ): Promise<IngestWebhookResultDto> {
    const provider = this.normalizeProvider(providerParam);

    if (!rawBody || !Buffer.isBuffer(rawBody) || rawBody.length === 0) {
      throw new BadRequestException("INVALID_BODY: Raw webhook body buffer is required");
    }

    // 1. Signature verification
    let isValidSignature = false;
    let signatureHeaderVal = "";

    if (provider === PaymentProvider.RAZORPAY) {
      signatureHeaderVal = (headers["x-razorpay-signature"] ||
        headers["X-Razorpay-Signature"] ||
        "") as string;
      if (!signatureHeaderVal) {
        throw new UnauthorizedException("MISSING_SIGNATURE: X-Razorpay-Signature header is missing");
      }
      isValidSignature = this.verifyRazorpaySignature(rawBody, signatureHeaderVal);
    } else if (provider === PaymentProvider.STRIPE) {
      signatureHeaderVal = (headers["stripe-signature"] ||
        headers["Stripe-Signature"] ||
        "") as string;
      if (!signatureHeaderVal) {
        throw new UnauthorizedException("MISSING_SIGNATURE: Stripe-Signature header is missing");
      }
      isValidSignature = this.verifyStripeSignature(rawBody, signatureHeaderVal);
    }

    if (!isValidSignature) {
      // Record audit for security monitoring (without sensitive signature or secret)
      await this.prisma.billingAuditEvent.create({
        data: {
          actorId: "system:webhook-ingress",
          actorRole: PlatformStaffRole.FINANCE,
          subjectType: "PAYMENT_EVENT",
          subjectId: "unverified",
          action: "WEBHOOK_REJECTED",
          before: null,
          after: { provider, reason: "INVALID_SIGNATURE" },
          reason: "Webhook signature verification failed",
          executionResult: "FAILED",
        },
      });

      throw new UnauthorizedException("INVALID_SIGNATURE: Webhook signature verification failed");
    }

    // 2. Parse JSON payload
    let payload: any;
    try {
      payload = JSON.parse(rawBody.toString("utf8"));
    } catch {
      throw new BadRequestException("INVALID_PAYLOAD: Malformed JSON payload");
    }

    // 3. Extract provider event identity & event type
    let eventId = "";
    let eventType = "";

    if (provider === PaymentProvider.RAZORPAY) {
      eventType = payload.event || "unknown";
      eventId =
        payload.event_id ||
        payload.id ||
        (payload.payload?.payment?.entity?.id
          ? `${payload.event}:${payload.payload.payment.entity.id}`
          : "");
    } else if (provider === PaymentProvider.STRIPE) {
      eventType = payload.type || "unknown";
      eventId = payload.id || "";
    }

    if (!eventId) {
      throw new BadRequestException("INVALID_PAYLOAD: Missing unique provider event ID in payload");
    }

    // 4. Idempotency Check & Inbox Persistence in billing.payment_event
    try {
      // Check if already in inbox
      const existing = await this.prisma.paymentWebhookInbox.findUnique({
        where: {
          provider_eventId: {
            provider,
            eventId,
          },
        },
      });

      if (existing) {
        this.logger.log(
          `[PaymentWebhookService] Idempotent webhook delivery for ${provider}:${eventId} (status: ${existing.status})`,
        );
        return {
          received: true,
          eventId,
          idempotent: true,
          status: existing.status,
          inboxId: existing.id,
        };
      }

      // Insert new inbox record
      const inboxRecord = await this.prisma.paymentWebhookInbox.create({
        data: {
          provider,
          eventId,
          eventType,
          payload,
          status: WebhookEventStatus.PENDING,
        },
      });

      // Audit ingestion
      await this.prisma.billingAuditEvent.create({
        data: {
          actorId: "system:webhook-ingress",
          actorRole: PlatformStaffRole.FINANCE,
          subjectType: "PAYMENT_EVENT",
          subjectId: inboxRecord.id,
          action: "WEBHOOK_INGESTED",
          before: null,
          after: {
            id: inboxRecord.id,
            provider,
            eventId,
            eventType,
            status: WebhookEventStatus.PENDING,
          },
          reason: `Webhook received and persisted to inbox from ${provider}`,
          executionResult: "SUCCESS",
        },
      });

      // 5. Enqueue background processing job
      await this.queueProvider.enqueue(
        "payment-webhook",
        "process-payment-webhook",
        {
          inboxId: inboxRecord.id,
          provider,
          eventId,
        },
        { jobId: `webhook-${provider}-${eventId}` },
      );

      return {
        received: true,
        eventId,
        idempotent: false,
        status: WebhookEventStatus.PENDING,
        inboxId: inboxRecord.id,
      };
    } catch (err: any) {
      if (err.code === "P2002" || err.message?.includes("payment_event_provider_event_id_key")) {
        // Race condition: another thread inserted the same event concurrently
        const existing = await this.prisma.paymentWebhookInbox.findUnique({
          where: {
            provider_eventId: {
              provider,
              eventId,
            },
          },
        });
        return {
          received: true,
          eventId,
          idempotent: true,
          status: existing?.status || WebhookEventStatus.PENDING,
          inboxId: existing?.id,
        };
      }
      throw err;
    }
  }

  /**
   * Asynchronous Webhook Processor.
   * Executes event-specific commercial processing behind existing PaymentService,
   * CreditPoolService, and LedgerService boundaries.
   */
  async processWebhookEventJob(inboxId: string): Promise<void> {
    if (!inboxId || typeof inboxId !== "string") {
      throw new BadRequestException("INVALID_INBOX_ID: Webhook event inbox ID is required");
    }

    // Acquire lock and load inbox record with FOR UPDATE
    const inboxRecord = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRawUnsafe<any[]>(
        `SELECT id, provider, event_id as "eventId", event_type as "eventType", payload, status
           FROM "billing"."payment_event"
          WHERE id = $1 FOR UPDATE`,
        inboxId,
      );

      if (!rows || rows.length === 0) {
        return null;
      }

      const rec = rows[0];
      if (rec.status === WebhookEventStatus.PROCESSED) {
        return { ...rec, alreadyProcessed: true };
      }

      await tx.paymentWebhookInbox.update({
        where: { id: inboxId },
        data: { status: WebhookEventStatus.PROCESSING },
      });

      return rec;
    });

    if (!inboxRecord) {
      this.logger.warn(`[PaymentWebhookService] Inbox record ${inboxId} not found`);
      return;
    }

    if (inboxRecord.alreadyProcessed) {
      this.logger.log(`[PaymentWebhookService] Inbox record ${inboxId} already processed (idempotent)`);
      return;
    }

    try {
      const { provider, eventType, payload } = inboxRecord;

      if (provider === PaymentProvider.RAZORPAY) {
        await this.processRazorpayEvent(eventType, payload);
      } else if (provider === PaymentProvider.STRIPE) {
        await this.processStripeEvent(eventType, payload);
      } else {
        throw new BadRequestException(`UNSUPPORTED_PROVIDER: ${provider}`);
      }

      // Mark as PROCESSED
      await this.prisma.paymentWebhookInbox.update({
        where: { id: inboxId },
        data: {
          status: WebhookEventStatus.PROCESSED,
          processedAt: new Date(),
          errorMessage: null,
        },
      });

      // Audit event
      await this.prisma.billingAuditEvent.create({
        data: {
          actorId: this.systemActor.id,
          actorRole: this.systemActor.role,
          subjectType: "PAYMENT_EVENT",
          subjectId: inboxId,
          action: "WEBHOOK_PROCESSED",
          before: { status: WebhookEventStatus.PROCESSING },
          after: { status: WebhookEventStatus.PROCESSED, eventType },
          reason: `Webhook event ${inboxRecord.eventId} successfully processed`,
          executionResult: "SUCCESS",
        },
      });

      this.logger.log(`[PaymentWebhookService] Successfully processed webhook ${inboxId} (${eventType})`);
    } catch (err: any) {
      this.logger.error(
        `[PaymentWebhookService] Failed to process webhook ${inboxId}: ${err.message}`,
        err.stack,
      );

      // Transition to FAILED with error message
      await this.prisma.paymentWebhookInbox.update({
        where: { id: inboxId },
        data: {
          status: WebhookEventStatus.FAILED,
          errorMessage: err.message,
        },
      });

      await this.prisma.billingAuditEvent.create({
        data: {
          actorId: this.systemActor.id,
          actorRole: this.systemActor.role,
          subjectType: "PAYMENT_EVENT",
          subjectId: inboxId,
          action: "WEBHOOK_FAILED",
          before: { status: WebhookEventStatus.PROCESSING },
          after: { status: WebhookEventStatus.FAILED, error: err.message },
          reason: `Webhook processing failed: ${err.message}`,
          executionResult: "FAILED",
        },
      });

      throw err;
    }
  }

  /**
   * Processes Razorpay webhook events.
   */
  private async processRazorpayEvent(eventType: string, payload: any): Promise<void> {
    const paymentEntity = payload.payload?.payment?.entity || payload.entity || payload;
    const providerPaymentId = paymentEntity.id;
    const providerOrderId = paymentEntity.order_id || null;

    switch (eventType) {
      case RazorpayEventType.PAYMENT_CAPTURED:
      case RazorpayEventType.ORDER_PAID: {
        await this.handlePaymentCapture({
          provider: PaymentProvider.RAZORPAY,
          providerPaymentId,
          providerOrderId,
          amountMinor: paymentEntity.amount,
          currency: paymentEntity.currency ? paymentEntity.currency.toUpperCase() : "INR",
          notes: paymentEntity.notes || {},
        });
        break;
      }

      case RazorpayEventType.PAYMENT_FAILED: {
        await this.handlePaymentFailure({
          provider: PaymentProvider.RAZORPAY,
          providerPaymentId,
          reason: paymentEntity.error_description || "Razorpay payment failed",
        });
        break;
      }

      case RazorpayEventType.PAYMENT_DISPUTED:
      case RazorpayEventType.DISPUTE_CREATED: {
        const disputeEntity = payload.payload?.dispute?.entity || payload;
        const disputedPaymentId = disputeEntity.payment_id || providerPaymentId;
        await this.handlePaymentDispute({
          provider: PaymentProvider.RAZORPAY,
          providerPaymentId: disputedPaymentId,
          reason: disputeEntity.reason_code || "Razorpay dispute created",
          ticketRef: disputeEntity.id || null,
        });
        break;
      }

      default:
        this.logger.log(`[PaymentWebhookService] Ignored unsupported Razorpay event: ${eventType}`);
        break;
    }
  }

  /**
   * Processes Stripe webhook events.
   */
  private async processStripeEvent(eventType: string, payload: any): Promise<void> {
    const obj = payload.data?.object || payload;
    const providerPaymentId = obj.id;

    switch (eventType) {
      case StripeEventType.PAYMENT_INTENT_SUCCEEDED:
      case StripeEventType.CHARGE_SUCCEEDED: {
        const amountMinor = obj.amount_received || obj.amount || 0;
        const currency = obj.currency ? obj.currency.toUpperCase() : "USD";
        const metadata = obj.metadata || {};

        await this.handlePaymentCapture({
          provider: PaymentProvider.STRIPE,
          providerPaymentId,
          providerOrderId: metadata.orderId || null,
          amountMinor,
          currency,
          notes: metadata,
        });
        break;
      }

      case StripeEventType.PAYMENT_INTENT_FAILED:
      case StripeEventType.CHARGE_FAILED: {
        const errorDesc = obj.last_payment_error?.message || "Stripe payment failed";
        await this.handlePaymentFailure({
          provider: PaymentProvider.STRIPE,
          providerPaymentId,
          reason: errorDesc,
        });
        break;
      }

      case StripeEventType.CHARGE_DISPUTE_CREATED: {
        const disputedChargeOrIntent = obj.payment_intent || obj.charge || providerPaymentId;
        await this.handlePaymentDispute({
          provider: PaymentProvider.STRIPE,
          providerPaymentId: disputedChargeOrIntent,
          reason: obj.reason || "Stripe charge dispute created",
          ticketRef: obj.id || null,
        });
        break;
      }

      default:
        this.logger.log(`[PaymentWebhookService] Ignored unsupported Stripe event: ${eventType}`);
        break;
    }
  }

  /**
   * Commercial Payment Capture Orchestration.
   * Finds or creates Payment and transitions to CAPTURED via PaymentService.
   */
  private async handlePaymentCapture(data: {
    provider: PaymentProvider;
    providerPaymentId: string;
    providerOrderId?: string | null;
    amountMinor?: number;
    currency?: string;
    notes?: Record<string, any>;
  }): Promise<void> {
    if (!data.providerPaymentId) {
      throw new BadRequestException("INVALID_CAPTURE_DATA: Missing provider payment ID");
    }

    // Look up existing Payment record by providerPaymentId or providerOrderId
    let existingPayment = await this.prisma.payment.findUnique({
      where: {
        provider_providerPaymentId: {
          provider: data.provider,
          providerPaymentId: data.providerPaymentId,
        },
      },
    });

    if (!existingPayment && data.providerOrderId) {
      existingPayment = await this.prisma.payment.findFirst({
        where: {
          provider: data.provider,
          providerOrderId: data.providerOrderId,
        },
      });
    }

    if (existingPayment) {
      if (
        existingPayment.status === PaymentStatus.CAPTURED ||
        existingPayment.status === PaymentStatus.DISPUTED ||
        existingPayment.status === PaymentStatus.REFUNDED ||
        existingPayment.status === PaymentStatus.PARTIALLY_REFUNDED
      ) {
        this.logger.log(
          `[PaymentWebhookService] Payment ${existingPayment.id} already processed (status: ${existingPayment.status}, idempotent)`,
        );
        return;
      }

      if (existingPayment.status === PaymentStatus.CREATED) {
        await this.paymentService.capturePayment(this.systemActor, existingPayment.id, {
          providerPaymentId: data.providerPaymentId,
          providerOrderId: data.providerOrderId || existingPayment.providerOrderId || undefined,
          capturedAt: new Date(),
          reason: `Webhook capture confirmation from ${data.provider}`,
        });
        return;
      }

      throw new BadRequestException(
        `INVALID_PAYMENT_STATE: Cannot capture payment in status '${existingPayment.status}'`,
      );
    }

    // If Payment row not pre-created, inspect payload metadata to initialize checkout
    const { notes } = data;
    const billingAccountId = notes?.billingAccountId || notes?.billing_account_id;
    const priceBookEntryId = notes?.priceBookEntryId || notes?.price_book_entry_id;
    const quantityCredits = parseInt(
      notes?.quantityCredits || notes?.quantity_credits || notes?.credits || "0",
      10,
    );

    if (billingAccountId && priceBookEntryId && quantityCredits > 0 && data.amountMinor) {
      await this.paymentService.createPaymentRecord(this.systemActor, {
        billingAccountId,
        provider: data.provider,
        providerPaymentId: data.providerPaymentId,
        providerOrderId: data.providerOrderId || null,
        priceBookEntryId,
        quantityCredits,
        amountMinor: data.amountMinor,
        currency: data.currency || "USD",
        status: PaymentStatus.CAPTURED,
        capturedAt: new Date(),
        reason: `Direct webhook-initialized capture from ${data.provider}`,
      });
      return;
    }

    throw new NotFoundException(
      `PAYMENT_NOT_FOUND: No existing Payment or valid checkout metadata found for provider payment '${data.providerPaymentId}'`,
    );
  }

  /**
   * Commercial Payment Dispute Orchestration.
   * Delegates to PaymentService.disputePayment and CreditPoolService.suspendPool.
   */
  private async handlePaymentDispute(data: {
    provider: PaymentProvider;
    providerPaymentId: string;
    reason?: string;
    ticketRef?: string | null;
  }): Promise<void> {
    const payment = await this.prisma.payment.findFirst({
      where: {
        provider: data.provider,
        OR: [
          { providerPaymentId: data.providerPaymentId },
          { providerOrderId: data.providerPaymentId },
        ],
      },
    });

    if (!payment) {
      throw new NotFoundException(
        `PAYMENT_NOT_FOUND: Cannot dispute unknown payment '${data.providerPaymentId}' for provider '${data.provider}'`,
      );
    }

    await this.paymentService.disputePayment(this.systemActor, payment.id, {
      reason: data.reason || "Payment dispute filed by provider webhook",
      ticketRef: data.ticketRef || undefined,
    });
  }

  /**
   * Handles payment failure notification.
   */
  private async handlePaymentFailure(data: {
    provider: PaymentProvider;
    providerPaymentId: string;
    reason?: string;
  }): Promise<void> {
    const payment = await this.prisma.payment.findFirst({
      where: {
        provider: data.provider,
        providerPaymentId: data.providerPaymentId,
      },
    });

    if (!payment) {
      this.logger.log(
        `[PaymentWebhookService] No payment found for failure notification ${data.providerPaymentId}`,
      );
      return;
    }

    if (payment.status === PaymentStatus.CREATED) {
      await this.paymentService.failPayment(this.systemActor, payment.id, {
        reason: data.reason || "Payment failed notification from webhook",
      });
    }
  }

  /**
   * Administrative Replay Endpoint (API-H2-19).
   * Re-evaluates a stuck or failed webhook event from billing.payment_event inbox.
   * Enforces Artifact 06 §3.2 (Allowed: FINANCE, OWNER).
   */
  async replayWebhookEvent(
    actor: WebhookActor,
    eventIdOrInboxId: string,
  ): Promise<ReplayWebhookResultDto> {
    if (!actor || !actor.isPlatformStaff) {
      throw new ForbiddenException("PLATFORM_AUTH_REQUIRED: Authenticated platform staff required");
    }

    const role = (actor.platformRole || actor.role) as PlatformStaffRole;
    if (role !== PlatformStaffRole.FINANCE && role !== PlatformStaffRole.OWNER) {
      throw new ForbiddenException(
        `FINANCE_ROLE_REQUIRED: Role '${role}' is not authorized to replay webhook events. Required: FINANCE or OWNER`,
      );
    }

    if (!eventIdOrInboxId || typeof eventIdOrInboxId !== "string") {
      throw new BadRequestException("INVALID_EVENT_ID: Event ID or Inbox ID is required for replay");
    }

    const inboxRecord = await this.prisma.paymentWebhookInbox.findFirst({
      where: {
        OR: [{ id: eventIdOrInboxId }, { eventId: eventIdOrInboxId }],
      },
    });

    if (!inboxRecord) {
      throw new NotFoundException(
        `WEBHOOK_EVENT_NOT_FOUND: Webhook inbox event '${eventIdOrInboxId}' not found`,
      );
    }

    // Reset status to PENDING
    await this.prisma.paymentWebhookInbox.update({
      where: { id: inboxRecord.id },
      data: {
        status: WebhookEventStatus.PENDING,
        errorMessage: null,
      },
    });

    // Record audit event
    await this.prisma.billingAuditEvent.create({
      data: {
        actorId: actor.id,
        actorRole: role,
        subjectType: "PAYMENT_EVENT",
        subjectId: inboxRecord.id,
        action: "WEBHOOK_REPLAYED",
        before: { status: inboxRecord.status },
        after: { status: WebhookEventStatus.PENDING, replayedBy: actor.id },
        reason: "Administrative webhook replay triggered by platform staff",
        executionResult: "SUCCESS",
      },
    });

    // Re-process event synchronously or via queue
    await this.processWebhookEventJob(inboxRecord.id);

    const updatedRecord = await this.prisma.paymentWebhookInbox.findUnique({
      where: { id: inboxRecord.id },
    });

    return {
      replayed: true,
      eventId: inboxRecord.eventId,
      status: updatedRecord?.status || WebhookEventStatus.PROCESSED,
      message: `Webhook ${inboxRecord.eventId} replayed successfully`,
    };
  }
}
