import { PlatformStaffRole, PaymentProvider, PaymentStatus } from "@cd-recruit/shared-types";
import { PoolType } from "../pool/credit-pool.types";

export { PaymentProvider, PaymentStatus, PoolType };

/**
 * Standard Platform Staff Actor representation for payment operations.
 * Enforces Artifact 06 §3.2 (Only FINANCE and OWNER can record payments or refunds).
 */
export interface PaymentActor {
  id: string;
  role?: PlatformStaffRole | string;
  platformRole?: PlatformStaffRole | string;
  email?: string;
  isPlatformStaff: boolean;
}

/**
 * DTO for recording offline enterprise PO invoice payment.
 * Per Artifact 04 (§2.4 API-H2-17) and Artifact 06 (§1.4).
 */
export interface RecordManualInvoicePaymentDto {
  billingAccountId: string;
  invoiceNumber: string;
  poNumber?: string;
  priceBookEntryId: string;
  quantityCredits: number;
  amountMinor?: number;
  taxMinor?: number;
  currency?: string;
  capturedAt?: string | Date;
  poolType?: PoolType | string;
  poolName?: string;
  reason?: string;
  ticketRef?: string;
}

/**
 * DTO for creating a direct payment intent or external transaction record.
 * Tracks gateway checkout intents (e.g. status: CREATED).
 */
export interface CreatePaymentRecordDto {
  billingAccountId: string;
  provider: PaymentProvider | string;
  providerPaymentId: string;
  providerOrderId?: string | null;
  priceBookEntryId: string;
  quantityCredits: number;
  amountMinor: number;
  taxMinor?: number | null;
  currency: string;
  invoiceNumber?: string | null;
  status?: PaymentStatus | string;
  capturedAt?: string | Date | null;
  reason?: string;
  ticketRef?: string;
}

/**
 * DTO for capturing an existing payment record in CREATED state.
 */
export interface CapturePaymentDto {
  capturedAt?: string | Date;
  providerPaymentId?: string;
  providerOrderId?: string;
  poolName?: string;
  poolType?: PoolType | string;
  reason?: string;
  ticketRef?: string;
}

/**
 * DTO for issuing cash refunds on captured payments.
 * Enforces unconsumed-only boundaries (Artifact 02 §6.3, Artifact 06 §1.4).
 */
export interface IssueRefundDto {
  paymentId: string;
  quantityCredits?: number;
  amountMinor?: number;
  poolId?: string;
  reason?: string;
  ticketRef?: string;
  idempotencyKey?: string;
}

/**
 * Canonical Payment DTO returned by PaymentService.
 * Maps 1:1 to billing.payment.
 */
export interface PaymentResultDto {
  id: string;
  billingAccountId: string;
  provider: string;
  providerPaymentId: string;
  providerOrderId: string | null;
  status: string;
  priceBookEntryId: string;
  quantityCredits: number;
  unitPriceMinor: number;
  amountMinor: number;
  taxMinor: number | null;
  currency: string;
  invoiceNumber: string | null;
  capturedAt: Date | null;
  createdAt: Date;
  creditPoolId?: string | null;
  creditLedgerEntryId?: string | null;
  refundedCredits?: number;
  refundedAmountMinor?: number;
}

/**
 * Options for querying payment records.
 */
export interface ListPaymentsOptions {
  billingAccountId?: string;
  status?: PaymentStatus | string;
  provider?: PaymentProvider | string;
  invoiceNumber?: string;
  startDate?: string | Date;
  endDate?: string | Date;
  page?: number;
  limit?: number;
}

/**
 * Paginated envelope for payments list.
 */
export interface PaginatedPaymentsResultDto {
  data: PaymentResultDto[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

/**
 * DTO for dispute/chargeback on a payment.
 */
export interface DisputePaymentDto {
  reason?: string;
  ticketRef?: string;
}

/**
 * DTO for marking a payment as failed.
 */
export interface FailPaymentDto {
  reason?: string;
}

