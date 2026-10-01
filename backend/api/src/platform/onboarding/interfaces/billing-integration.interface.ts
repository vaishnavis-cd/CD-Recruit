import { ConflictException, BadRequestException } from '@nestjs/common';

export const BILLING_ACCOUNT_SERVICE = Symbol('BILLING_ACCOUNT_SERVICE');
export const TRIAL_GRANT_SERVICE = Symbol('TRIAL_GRANT_SERVICE');

export interface BillingAccountResultDto {
  id: string;
  organizationId: string;
  name: string;
  billingCountry: string;
  currency: string;
  status: 'ACTIVE' | 'RESTRICTED' | 'SUSPENDED';
  trialDomain: string | null;
  createdAt: Date;
}

export interface TrialGrantResultDto {
  poolId: string;
  billingAccountId: string;
  creditsGranted: number;
  validityDays: number;
  expiresAt: Date;
  ledgerEntryId: string;
  status: 'ACTIVE';
}

export interface CreateBillingAccountParams {
  accountName: string;
  billingCountry: string;
  currency?: string;
  legalEntityName?: string;
  taxId?: string;
  trialDomain?: string;
}

export interface IBillingAccountService {
  createForOrganization(
    organizationId: string,
    params: CreateBillingAccountParams,
    context?: { transactionClient?: any },
  ): Promise<BillingAccountResultDto>;
}

export interface ITrialGrantService {
  grantTrial(
    billingAccountId: string,
    corporateDomain: string,
    context?: { transactionClient?: any },
  ): Promise<TrialGrantResultDto>;
}
