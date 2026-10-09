import { Module, Global } from '@nestjs/common';
import { PlatformAuthModule } from './auth/platform-auth.module';
import { PlatformAuditModule } from './audit/platform-audit.module';
import { PlatformTenantsModule } from './tenants/platform-tenants.module';
import { PlatformOnboardingModule } from './onboarding/platform-onboarding.module';
import { PlatformMetricsModule } from './metrics/platform-metrics.module';
import { PlatformStaffModule } from './staff/platform-staff.module';
import { PlatformOverridesModule } from './overrides/platform-overrides.module';
import { MockBillingAccountService } from './mocks/mock-billing-account.service';
import { MockTrialGrantService } from './mocks/mock-trial-grant.service';

@Global()
@Module({
  imports: [
    PlatformAuthModule,
    PlatformAuditModule,
    PlatformTenantsModule,
    PlatformOnboardingModule,
    PlatformMetricsModule,
    PlatformStaffModule,
    PlatformOverridesModule,
  ],
  providers: [
    MockBillingAccountService,
    MockTrialGrantService,
  ],
  exports: [
    PlatformAuthModule,
    PlatformAuditModule,
    PlatformTenantsModule,
    PlatformOnboardingModule,
    PlatformMetricsModule,
    PlatformStaffModule,
    PlatformOverridesModule,
    MockBillingAccountService,
    MockTrialGrantService,
  ],
})
export class PlatformModule {}

