import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { PlatformAuditModule } from '../audit/platform-audit.module';
import { PlatformAuthModule } from '../auth/platform-auth.module';
import { PlatformTenantsModule } from '../tenants/platform-tenants.module';
import { PlatformOnboardingController } from './platform-onboarding.controller';
import { PlatformOnboardingService } from './platform-onboarding.service';
import {
  BILLING_ACCOUNT_SERVICE,
  TRIAL_GRANT_SERVICE,
} from './interfaces/billing-integration.interface';
import { MockBillingAccountService } from '../mocks/mock-billing-account.service';
import { MockTrialGrantService } from '../mocks/mock-trial-grant.service';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => PlatformAuditModule),
    forwardRef(() => PlatformAuthModule),
    forwardRef(() => PlatformTenantsModule),
  ],
  controllers: [PlatformOnboardingController],
  providers: [
    PlatformOnboardingService,
    {
      provide: BILLING_ACCOUNT_SERVICE,
      useClass: MockBillingAccountService,
    },
    {
      provide: TRIAL_GRANT_SERVICE,
      useClass: MockTrialGrantService,
    },
  ],
  exports: [
    PlatformOnboardingService,
    BILLING_ACCOUNT_SERVICE,
    TRIAL_GRANT_SERVICE,
  ],
})
export class PlatformOnboardingModule {}
