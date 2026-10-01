import {
  Controller,
  Get,
  Post,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { PlatformJwtAuthGuard } from "../../auth/guards/platform-jwt-auth.guard";
import { PlatformRolesGuard } from "../../auth/guards/platform-roles.guard";
import { PlatformRoles } from "../../auth/decorators/platform-roles.decorator";
import { PlatformStaffRole } from "@cd-recruit/shared-types";
import { ReconciliationService } from "../../../billing/reconciliation/reconciliation.service";

@ApiTags("Platform Billing Reconciliation")
@ApiBearerAuth()
@Controller("platform/billing/reconciliation")
@UseGuards(PlatformJwtAuthGuard, PlatformRolesGuard)
export class ReconciliationController {
  constructor(private readonly reconciliationService: ReconciliationService) {}

  /**
   * API-H2-21: Latest 7-point automated reconciliation run results and drift status.
   */
  @Get("latest")
  @PlatformRoles(PlatformStaffRole.SUPPORT, PlatformStaffRole.FINANCE, PlatformStaffRole.OWNER)
  @ApiOperation({ summary: "Get latest reconciliation run results (API-H2-21)" })
  async getLatestRun() {
    const latest = await this.reconciliationService.getLatestRun();
    if (!latest) {
      return {
        status: "UNAVAILABLE",
        driftDetected: false,
        message: "No reconciliation runs have been executed yet",
        checkResults: null,
      };
    }
    return latest;
  }

  /**
   * API-H2-22: Manually trigger a 7-point ledger replay audit.
   */
  @Post("run")
  @PlatformRoles(PlatformStaffRole.FINANCE, PlatformStaffRole.OWNER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Trigger manual 7-point reconciliation audit (API-H2-22)" })
  async triggerManualAudit(@Req() req: any) {
    const actor = req.user;
    return await this.reconciliationService.triggerManualAudit(actor);
  }
}
