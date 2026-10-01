import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { PlatformAuditModule } from '../audit/platform-audit.module';
import { PlatformAuthModule } from '../auth/platform-auth.module';
import { PlatformTenantsController } from './platform-tenants.controller';
import { PlatformTenantsService } from './platform-tenants.service';
import { TenantAccessModule } from './tenant-access.module';
import {
  TENANT_BILLING_SUMMARY_PROVIDER,
  NullTenantBillingSummaryProvider,
} from './providers/tenant-billing-summary.provider';

@Module({
  imports: [
    PrismaModule,
    TenantAccessModule,
    forwardRef(() => PlatformAuditModule),
    forwardRef(() => PlatformAuthModule),
  ],
  controllers: [PlatformTenantsController],
  providers: [
    PlatformTenantsService,
    {
      provide: TENANT_BILLING_SUMMARY_PROVIDER,
      useClass: NullTenantBillingSummaryProvider,
    },
  ],
  exports: [
    PlatformTenantsService,
    TenantAccessModule,
    TENANT_BILLING_SUMMARY_PROVIDER,
  ],
})
export class PlatformTenantsModule {}
