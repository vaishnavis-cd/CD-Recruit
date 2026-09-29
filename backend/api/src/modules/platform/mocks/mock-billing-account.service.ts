import { Injectable, Logger } from '@nestjs/common';

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

export interface BillingAccountSummaryDto {
  id: string;
  name: string;
  legalEntityName: string;
  billingCountry: string;
  currency: string;
  taxId: string;
  status: string;
  overdraftLimit: number;
  overdraftUsed: number;
  hasPaidPurchase: boolean;
  trialDomain: string | null;
  trialGrantedAt: Date | null;
  totalAvailableCredits: number;
  breakdown: {
    activeDrivePassCredits: number;
    talentReserveCredits: number;
    trialCreditsRemaining: number;
  };
  pools: Array<{
    id: string;
    name: string;
    poolType: string;
    source: string;
    status: string;
    totalCredits: number;
    cachedRemaining: number;
    expiresAt: Date;
    daysRemaining: number;
  }>;
  reconciliationStatus: 'PASSED' | 'FAILED' | 'IN_PROGRESS';
}

@Injectable()
export class MockBillingAccountService {
  private readonly logger = new Logger(MockBillingAccountService.name);

  async createForOrganization(
    organizationId: string,
    params: {
      accountName: string;
      billingCountry: string;
      currency?: string;
      legalEntityName?: string;
      taxId?: string;
      trialDomain?: string;
    },
  ): Promise<BillingAccountResultDto> {
    this.logger.log(`[MOCK] createForOrganization called for org: ${organizationId}`);
    return {
      id: `mock-billing-acct-${organizationId}`,
      organizationId,
      name: params.accountName,
      billingCountry: params.billingCountry || 'IN',
      currency: params.currency || (params.billingCountry === 'IN' ? 'INR' : 'USD'),
      status: 'ACTIVE',
      trialDomain: params.trialDomain || null,
      createdAt: new Date(),
    };
  }

  async getAccountSummary(accountId: string): Promise<BillingAccountSummaryDto> {
    this.logger.log(`[MOCK] getAccountSummary called for account: ${accountId}`);
    return {
      id: accountId,
      name: 'Mock Enterprise Payer',
      legalEntityName: 'Mock Enterprise Payer Private Limited',
      billingCountry: 'IN',
      currency: 'INR',
      taxId: '29ABCDE1234F1Z5',
      status: 'ACTIVE',
      overdraftLimit: 0,
      overdraftUsed: 0,
      hasPaidPurchase: true,
      trialDomain: 'mockcorp.com',
      trialGrantedAt: new Date(Date.now() - 10 * 86400000),
      totalAvailableCredits: 250,
      breakdown: {
        activeDrivePassCredits: 50,
        talentReserveCredits: 200,
        trialCreditsRemaining: 0,
      },
      pools: [
        {
          id: 'mock-pool-1',
          name: 'Campus Drive 2026',
          poolType: 'DRIVE_PASS',
          source: 'PURCHASE',
          status: 'ACTIVE',
          totalCredits: 100,
          cachedRemaining: 50,
          expiresAt: new Date(Date.now() + 14 * 86400000),
          daysRemaining: 14,
        },
      ],
      reconciliationStatus: 'PASSED',
    };
  }
}
