import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { PlatformAuthModule } from '../auth/platform-auth.module';
import { PlatformTenantsModule } from '../tenants/platform-tenants.module';
import { PlatformMetricsController } from './platform-metrics.controller';
import { PlatformMetricsService } from './platform-metrics.service';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => PlatformAuthModule),
    forwardRef(() => PlatformTenantsModule),
  ],
  controllers: [PlatformMetricsController],
  providers: [PlatformMetricsService],
  exports: [PlatformMetricsService],
})
export class PlatformMetricsModule {}
