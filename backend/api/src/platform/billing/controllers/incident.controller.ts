import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Req,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { PlatformJwtAuthGuard } from "../../auth/guards/platform-jwt-auth.guard";
import { PlatformRolesGuard } from "../../auth/guards/platform-roles.guard";
import { PlatformRoles } from "../../auth/decorators/platform-roles.decorator";
import { PlatformStaffRole } from "@cd-recruit/shared-types";
import { LedgerService } from "../../../billing/ledger/ledger.service";
import { DeclareIncidentWindowDto } from "../dto/incident.dto";

@ApiTags("Platform Billing Incidents")
@ApiBearerAuth()
@Controller("platform/billing/incidents")
@UseGuards(PlatformJwtAuthGuard, PlatformRolesGuard)
export class IncidentController {
  constructor(private readonly ledgerService: LedgerService) {}

  /**
   * API-H2-23: List declared incident windows and remediation status.
   */
  @Get()
  @PlatformRoles(PlatformStaffRole.SUPPORT, PlatformStaffRole.FINANCE, PlatformStaffRole.OWNER)
  @ApiOperation({ summary: "List declared incident windows (API-H2-23)" })
  async listIncidents() {
    return await this.ledgerService.listIncidentWindows();
  }

  /**
   * API-H2-24: Declare an incident window and trigger automated T3 session credit reversals.
   */
  @Post()
  @PlatformRoles(PlatformStaffRole.FINANCE, PlatformStaffRole.OWNER)
  @ApiOperation({ summary: "Declare incident window and trigger automated T3 reversals (API-H2-24)" })
  async declareIncident(
    @Req() req: any,
    @Body() dto: DeclareIncidentWindowDto,
  ) {
    const actor = req.user;
    return await this.ledgerService.declareIncidentWindow(actor, dto);
  }
}
