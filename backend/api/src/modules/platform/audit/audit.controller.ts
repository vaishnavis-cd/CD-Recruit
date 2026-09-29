import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuditService } from './audit.service';
import { QueryAuditLogDto } from './dto/record-audit-event.dto';
import { PlatformAuthGuard } from '../auth/guards/platform-auth.guard';
import { PlatformRolesGuard } from '../auth/guards/platform-roles.guard';
import { Roles } from '../auth/decorators/platform-roles.decorator';
import { PlatformStaffRole } from '@cd-recruit/shared-types';

@Controller('api/v1/platform/audit')
@UseGuards(PlatformAuthGuard, PlatformRolesGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @Roles(PlatformStaffRole.SUPPORT, PlatformStaffRole.FINANCE, PlatformStaffRole.OWNER)
  async getAuditLogs(@Query() query: QueryAuditLogDto) {
    return this.auditService.queryPlatformAudit(query);
  }
}
