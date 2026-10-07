import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { TenantAccessService } from './tenant-access.service';

@Module({
  imports: [PrismaModule],
  providers: [TenantAccessService],
  exports: [TenantAccessService],
})
export class TenantAccessModule {}
