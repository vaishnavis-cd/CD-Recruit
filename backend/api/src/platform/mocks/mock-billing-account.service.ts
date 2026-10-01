import { Injectable, Logger, BadRequestException, ConflictException } from '@nestjs/common';
import {
  IBillingAccountService,
  BillingAccountResultDto,
  CreateBillingAccountParams,
} from '../onboarding/interfaces/billing-integration.interface';

const SUPPORTED_COUNTRIES = ['IN', 'US', 'GB'];

@Injectable()
export class MockBillingAccountService implements IBillingAccountService {
  private readonly logger = new Logger(MockBillingAccountService.name);

  async createForOrganization(
    organizationId: string,
    params: CreateBillingAccountParams,
    context?: { transactionClient?: any },
  ): Promise<BillingAccountResultDto> {
    this.logger.log(`[MOCK] createForOrganization called for org: ${organizationId}`);

    const country = (params.billingCountry || 'IN').toUpperCase();
    if (!SUPPORTED_COUNTRIES.includes(country)) {
      throw new BadRequestException('UNSUPPORTED_BILLING_COUNTRY');
    }

    const billingAccountId = `ba-mock-${organizationId.slice(0, 8)}`;

    // If a transactionClient was passed, write a row to the DB table or scratch table
    if (context?.transactionClient) {
      const tx = context.transactionClient;
      await tx.billingAccount.create({
        data: {
          id: billingAccountId,
          name: params.accountName,
          legalEntityName: params.legalEntityName || null,
          billingCountry: country,
          currency: params.currency || (country === 'IN' ? 'INR' : 'USD'),
          taxId: params.taxId || null,
          status: 'ACTIVE',
          trialDomain: params.trialDomain || null,
        },
      });
    }

    return {
      id: billingAccountId,
      organizationId,
      name: params.accountName,
      billingCountry: country,
      currency: params.currency || (country === 'IN' ? 'INR' : 'USD'),
      status: 'ACTIVE',
      trialDomain: params.trialDomain || null,
      createdAt: new Date(),
    };
  }
}
