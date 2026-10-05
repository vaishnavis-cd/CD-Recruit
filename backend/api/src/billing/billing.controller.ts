import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { RequirePermission } from "../common/decorators/permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { StaffRole, Permission } from "@cd-recruit/shared-types";
import { CreditEnforcementService } from "./credit-enforcement.service";
import { LedgerService } from "./ledger/ledger.service";
import { PrismaService } from "../prisma/prisma.service";

@Controller("admin/billing")
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(
  StaffRole.ADMIN,
  StaffRole.HR_LEAD,
  StaffRole.HR_ASSOCIATE,
  StaffRole.RECRUITER,
)
export class BillingController {
  constructor(
    private readonly creditEnforcementService: CreditEnforcementService,
    private readonly ledgerService: LedgerService,
    private readonly prisma: PrismaService,
  ) {}

  @Get("drive/:driveId/capacity")
  @RequirePermission(Permission.DRIVE_MANAGE)
  async getDriveCapacity(
    @Param("driveId", ParseUUIDPipe) driveId: string,
  ) {
    return this.creditEnforcementService.getDriveCapacityStatus(driveId);
  }

  @Post("drive/:driveId/release-held")
  @HttpCode(HttpStatus.OK)
  @RequirePermission(Permission.DRIVE_MANAGE)
  async releaseHeldSessions(
    @Param("driveId", ParseUUIDPipe) driveId: string,
  ) {
    return this.creditEnforcementService.releaseHeldSessions(driveId);
  }

  @Get("account")
  @RequirePermission(Permission.SETTINGS_MANAGE)
  async getAccountBalance(@CurrentUser() actor: any) {
    let orgId = actor.organizationId || actor.orgId;
    if (!orgId) {
      const firstOrg = await this.prisma.organization.findFirst({
        select: { id: true, billingAccountId: true },
      });
      if (firstOrg) {
        orgId = firstOrg.id;
      }
    }

    if (!orgId) {
      return {
        billingAccountId: null,
        totalRemaining: 0,
        activePoolsRemaining: 0,
        queuedPoolsCount: 0,
        overdraftLimit: 0,
        overdraftUsed: 0,
        overdraftAvailable: 0,
        status: "ACTIVE",
        activePools: [],
        queuedPools: [],
      };
    }

    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { billingAccountId: true },
    });

    if (!org?.billingAccountId) {
      return {
        billingAccountId: null,
        totalRemaining: 0,
        activePoolsRemaining: 0,
        queuedPoolsCount: 0,
        overdraftLimit: 0,
        overdraftUsed: 0,
        overdraftAvailable: 0,
        status: "ACTIVE",
        activePools: [],
        queuedPools: [],
      };
    }

    return this.ledgerService.getAccountBalance(org.billingAccountId);
  }
}
