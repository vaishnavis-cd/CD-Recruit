import { BadRequestException } from "@nestjs/common";
import { PlatformStaffRole } from "@cd-recruit/shared-types";
import { PoolType } from "../pool/credit-pool.types";
import {
  SUPPORTED_BILLING_COUNTRIES,
  SupportedBillingCountry,
  COUNTRY_CURRENCY_MAP,
  deriveCurrencyForCountry,
} from "../account/billing-account.types";

export {
  SUPPORTED_BILLING_COUNTRIES,
  SupportedBillingCountry,
  COUNTRY_CURRENCY_MAP,
  deriveCurrencyForCountry,
  PoolType,
};

/**
 * Standard Platform Staff Actor representation for billing operations.
 */
export interface PriceBookActor {
  id: string;
  role?: PlatformStaffRole | string;
  platformRole?: PlatformStaffRole | string;
  email?: string;
  isPlatformStaff: boolean;
}

/**
 * Canonical PriceBookEntry DTO returned by PriceBookService.
 * Maps 1:1 to billing.price_book_entry.
 */
export interface PriceBookEntryResultDto {
  id: string;
  sku: string;
  poolType: string;
  credits: number;
  validityDays: number | null;
  billingCountry: string;
  currency: string;
  unitPriceMinor: number;
  version: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

/**
 * Input DTO for publishing a new version of a Price Book entry.
 * Per Artifact 04 (§2) and Artifact 02 (§7.1).
 */
export interface PublishPriceBookEntryDto {
  sku: string;
  poolType: PoolType | string;
  credits: number;
  validityDays?: number | null;
  billingCountry: string;
  currency?: string;
  unitPriceMinor: number;
  effectiveFrom?: string | Date;
  reason?: string;
  ticketRef?: string;
}

/**
 * Options for querying the price catalog.
 */
export interface ListCatalogOptions {
  country?: string;
  sku?: string;
  activeOnly?: boolean;
  asOf?: Date;
}

/**
 * Options for retiring an active price entry.
 */
export interface RetirePriceBookEntryOptions {
  retiredAt?: string | Date;
  reason?: string;
  ticketRef?: string;
}
