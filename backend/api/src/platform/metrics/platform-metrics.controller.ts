import { Controller, Get, UseGuards } from '@nestjs/common';
import { PlatformJwtAuthGuard } from '../auth/guards/platform-jwt-auth.guard';
import { PlatformRolesGuard } from '../auth/guards/platform-roles.guard';
import {
  PlatformRoles,
  PLATFORM_READ_ROLES,
} from '../auth/decorators/platform-roles.decorator';
import { PlatformMetricsService } from './platform-metrics.service';
import { PlatformMetricsOverviewResponseDto } from './dto/platform-metrics.dto';

@Controller('platform/metrics')
@UseGuards(PlatformJwtAuthGuard, PlatformRolesGuard)
export class PlatformMetricsController {
  constructor(private readonly metricsService: PlatformMetricsService) {}

  @Get('overview')
  @PlatformRoles(...PLATFORM_READ_ROLES)
  async getOverviewMetrics(): Promise<PlatformMetricsOverviewResponseDto> {
    return this.metricsService.getOverviewMetrics();
  }
}
