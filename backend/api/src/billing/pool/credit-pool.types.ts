import { PlatformStaffRole } from "@cd-recruit/shared-types";
import { LedgerActor } from "../ledger/ledger.types";

export enum PoolType {
  DRIVE_PASS = "DRIVE_PASS",
  TALENT_RESERVE = "TALENT_RESERVE",
  ENTERPRISE = "ENTERPRISE",
}

export enum PoolStatus {
  QUEUED = "QUEUED",
  ACTIVE = "ACTIVE",
  SUSPENDED = "SUSPENDED",
  EXHAUSTED = "EXHAUSTED",
  EXPIRED = "EXPIRED",
  CANCELLED = "CANCELLED",
}

export enum PoolGrantSource {
  PURCHASE = "PURCHASE",
  CONTRACT = "CONTRACT",
  TRIAL = "TRIAL",
  PROMO = "PROMO",
  GOODWILL = "GOODWILL",
  MIGRATION = "MIGRATION",
  ROLLOVER = "ROLLOVER",
}

export interface CreatePoolDto {
  billingAccountId: string;
  poolType: PoolType | string;
  name: string;
  source: PoolGrantSource | string;
  totalCredits: number;
  driveId?: string | null;
  validityDays?: number | null;
  maxWaitDays?: number;
  status?: PoolStatus | string;
  unitPriceMinor?: number | null;
  currency?: string | null;
  paymentId?: string | null;
  termsVersion?: string | null;
  termsAcceptedBy?: string | null;
  termsAcceptedAt?: Date | string | null;
  expiresAt?: Date | string | null;
  clockStartedAt?: Date | string | null;
  reason?: string;
}

export interface CreditPoolContext {
  actor?: LedgerActor;
  reason?: string;
  ticketRef?: string;
  requestId?: string;
  tx?: any;
}

export interface CreditPoolSummary {
  id: string;
  billingAccountId: string;
  driveId: string | null;
  poolType: string;
  name: string;
  source: string;
  totalCredits: number;
  cachedRemaining: number;
  validityDays: number | null;
  maxWaitDays: number;
  queueOrder: number | null;
  status: string;
  purchasedAt: Date;
  clockStartedAt: Date | null;
  activatedAt: Date | null;
  expiresAt: Date | null;
  unitPriceMinor: number | null;
  currency: string | null;
  paymentId: string | null;
  createdAt: Date;
}

export interface CreditPoolDetailDto {
  id: string;
  billingAccountId: string;
  billingAccountName: string;
  billingCountry: string;
  currency: string;
  driveId: string | null;
  poolType: string;
  name: string;
  source: string;
  totalCredits: number;
  cachedRemaining: number;
  validityDays: number | null;
  maxWaitDays: number;
  queueOrder: number | null;
  status: string;
  purchasedAt: Date;
  clockStartedAt: Date | null;
  activatedAt: Date | null;
  expiresAt: Date | null;
  daysRemaining: number | null;
  isExpired: boolean;
  isGeneral: boolean;
  unitPriceMinor: number | null;
  paymentId: string | null;
  paymentInvoiceNumber: string | null;
  termsVersion: string | null;
  termsAcceptedBy: string | null;
  termsAcceptedAt: Date | null;
  createdAt: Date;
  recentLedgerEntries: Array<{
    id: string;
    entryType: string;
    amount: number;
    balanceAfter: number | null;
    reason: string;
    createdAt: Date;
  }>;
}
