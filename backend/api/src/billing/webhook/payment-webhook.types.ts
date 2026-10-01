import { PaymentProvider, PlatformStaffRole } from "@cd-recruit/shared-types";

export type SupportedWebhookProvider = "razorpay" | "stripe";

export enum WebhookEventStatus {
  PENDING = "PENDING",
  PROCESSING = "PROCESSING",
  PROCESSED = "PROCESSED",
  FAILED = "FAILED",
}

export enum RazorpayEventType {
  PAYMENT_CAPTURED = "payment.captured",
  ORDER_PAID = "order.paid",
  PAYMENT_FAILED = "payment.failed",
  PAYMENT_DISPUTED = "payment.dispute.created",
  DISPUTE_CREATED = "dispute.created",
  PAYMENT_AUTHORIZED = "payment.authorized",
}

export enum StripeEventType {
  PAYMENT_INTENT_SUCCEEDED = "payment_intent.succeeded",
  CHARGE_SUCCEEDED = "charge.succeeded",
  PAYMENT_INTENT_FAILED = "payment_intent.payment_failed",
  CHARGE_FAILED = "charge.failed",
  CHARGE_DISPUTE_CREATED = "charge.dispute.created",
  PAYMENT_INTENT_CREATED = "payment_intent.created",
}

export interface IngestWebhookResultDto {
  received: boolean;
  eventId?: string;
  idempotent?: boolean;
  status: string;
  inboxId?: string;
}

export interface ReplayWebhookDto {
  eventId: string;
}

export interface ReplayWebhookResultDto {
  replayed: boolean;
  eventId: string;
  status: string;
  message?: string;
}

export interface WebhookActor {
  id: string;
  role?: PlatformStaffRole | string;
  platformRole?: PlatformStaffRole | string;
  email?: string;
  isPlatformStaff: boolean;
}
