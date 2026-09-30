import {
  Controller,
  Get,
  Query,
  UseGuards,
  Req,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { PlatformJwtAuthGuard } from "../../auth/guards/platform-jwt-auth.guard";
import { PlatformRolesGuard } from "../../auth/guards/platform-roles.guard";
import { PlatformRoles } from "../../auth/decorators/platform-roles.decorator";
import { PlatformStaffRole } from "@cd-recruit/shared-types";
import { FinanceMetricsService } from "../../../billing/metrics/finance-metrics.service";
import { FinanceMetricsQueryDto } from "../dto/finance-metrics.dto";

@ApiTags("Platform Finance Dashboard")
@ApiBearerAuth()
@Controller("platform/finance/metrics")
@UseGuards(PlatformJwtAuthGuard, PlatformRolesGuard)
export class FinanceMetricsController {
  constructor(private readonly financeMetricsService: FinanceMetricsService) {}

  /**
   * API-H2-20: Platform-wide financial aggregates, margin alarms, uncollateralized debt.
   */
  @Get()
  @PlatformRoles(PlatformStaffRole.FINANCE, PlatformStaffRole.OWNER)
  @ApiOperation({ summary: "Get executive financial overview and metrics (API-H2-20)" })
  async getMetrics(@Req() req: any, @Query() query: FinanceMetricsQueryDto) {
    const actor = req.user;
    const filter = {
      period: query.period,
      startDate: query.startDate,
      endDate: query.endDate,
    };

    if (query.billingAccountId) {
      return await this.financeMetricsService.getAccountMetrics(
        query.billingAccountId,
        filter,
        actor,
      );
    }

    return await this.financeMetricsService.getFinancialOverview(filter, actor);
  }
}
