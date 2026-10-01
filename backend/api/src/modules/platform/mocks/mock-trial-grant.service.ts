import { Injectable, Logger } from '@nestjs/common';

export interface TrialGrantResultDto {
  poolId: string;
  billingAccountId: string;
  creditsGranted: number; // Exactly 25
  validityDays: number;   // Exactly 30
  expiresAt: Date;
  ledgerEntryId: string;
  status: 'ACTIVE';
}

@Injectable()
export class MockTrialGrantService {
  private readonly logger = new Logger(MockTrialGrantService.name);

  async grantTrial(
    billingAccountId: string,
    corporateDomain: string,
  ): Promise<TrialGrantResultDto> {
    this.logger.log(`[MOCK] grantTrial called for account: ${billingAccountId}, domain: ${corporateDomain}`);
    const validityDays = 30;
    const expiresAt = new Date(Date.now() + validityDays * 86400000);

    return {
      poolId: `mock-trial-pool-${billingAccountId}`,
      billingAccountId,
      creditsGranted: 25,
      validityDays,
      expiresAt,
      ledgerEntryId: `mock-ledger-entry-${Date.now()}`,
      status: 'ACTIVE',
    };
  }
}
