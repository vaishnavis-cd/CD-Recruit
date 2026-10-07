import { Injectable, Logger, ConflictException } from '@nestjs/common';
import * as crypto from 'crypto';
import {
  ITrialGrantService,
  TrialGrantResultDto,
} from '../onboarding/interfaces/billing-integration.interface';

@Injectable()
export class MockTrialGrantService implements ITrialGrantService {
  private readonly logger = new Logger(MockTrialGrantService.name);

  async grantTrial(
    billingAccountId: string,
    corporateDomain: string,
    context?: { transactionClient?: any },
  ): Promise<TrialGrantResultDto> {
    this.logger.log(`[MOCK] grantTrial called for account: ${billingAccountId}, domain: ${corporateDomain}`);

    const validityDays = 30;
    const expiresAt = new Date(Date.now() + validityDays * 86400000);
    const poolId = `pool-trial-${crypto.randomUUID()}`;
    const ledgerEntryId = `led-trial-${crypto.randomUUID()}`;

    // Mocks must NOT write to real billing.* tables (credit_pool, credit_ledger_entry)
    // to prevent reconciliation drift in Half 2. Store in memory.
    const result: TrialGrantResultDto = {
      poolId,
      billingAccountId,
      creditsGranted: 25,
      validityDays,
      expiresAt,
      ledgerEntryId,
      status: 'ACTIVE',
    };

    return result;
  }
}
