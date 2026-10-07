import {
  Controller,
  Get,
  Post,
  Body,
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
import { StaffRole, Permission, PoolType, GrantSource, DrivePoolFallthrough } from "@cd-recruit/shared-types";
import { CreditEnforcementService } from "./credit-enforcement.service";
import { PoolService } from "./pool.service";
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
    private readonly poolService: PoolService,
    private readonly prisma: PrismaService,
  ) { }

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

  @Post("drive/:driveId/fallthrough")
  @HttpCode(HttpStatus.OK)
  @RequirePermission(Permission.DRIVE_MANAGE)
  async updateDriveFallthrough(
    @Param("driveId", ParseUUIDPipe) driveId: string,
    @Body("fallthrough") fallthrough: DrivePoolFallthrough,
  ) {
    return this.prisma.drive.update({
      where: { id: driveId },
      data: { fallthrough },
      select: { id: true, name: true, fallthrough: true },
    });
  }

  @Get("account")
  @RequirePermission(Permission.SETTINGS_MANAGE)
  async getAccountBalance(@CurrentUser() actor: any) {
    let orgId = actor?.organizationId || actor?.orgId;
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

  @Get("ledger")
  @RequirePermission(Permission.SETTINGS_MANAGE)
  async getAccountLedger(@CurrentUser() actor: any) {
    let orgId = actor?.organizationId || actor?.orgId;
    const org = await this.prisma.organization.findFirst({
      where: orgId ? { id: orgId } : undefined,
      select: { id: true, billingAccountId: true },
    });

    if (!org?.billingAccountId) {
      return [];
    }

    const entries = await this.prisma.creditLedgerEntry.findMany({
      where: { billingAccountId: org.billingAccountId, shadow: false },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        creditPool: {
          select: { id: true, name: true, poolType: true },
        },
      },
    });

    return entries;
  }

  @Post("purchase")
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission(Permission.SETTINGS_MANAGE)
  async purchaseCredits(
    @CurrentUser() actor: any,
    @Body()
    dto: {
      poolType: PoolType;
      totalCredits: number;
      name?: string;
      validityDays?: number;
      driveId?: string;
      currency?: string;
      unitPriceMinor?: number;
    },
  ) {
    let orgId = actor?.organizationId || actor?.orgId;
    const org = await this.prisma.organization.findFirst({
      where: orgId ? { id: orgId } : undefined,
      select: { id: true, billingAccountId: true },
    });

    if (!org?.billingAccountId) {
      throw new Error("No billing account associated with this organization");
    }

    return this.poolService.createPool({
      billingAccountId: org.billingAccountId,
      organizationId: org.id,
      poolType: dto.poolType || PoolType.TALENT_RESERVE,
      name: dto.name || (dto.poolType === PoolType.DRIVE_PASS ? "Drive Pass Pack" : "Talent Reserve Bank"),
      source: GrantSource.PURCHASE,
      totalCredits: dto.totalCredits,
      validityDays: dto.validityDays || (dto.poolType === PoolType.DRIVE_PASS ? 7 : 365),
      driveId: dto.driveId,
      currency: dto.currency || "INR",
      unitPriceMinor: dto.unitPriceMinor || 6000,
      actorId: actor.id || "admin",
    });
  }

  @Get("invoices")
  @RequirePermission(Permission.SETTINGS_MANAGE)
  async getInvoices(@CurrentUser() actor: any) {
    let orgId = actor.organizationId || actor.orgId;
    const org = await this.prisma.organization.findFirst({
      where: orgId ? { id: orgId } : undefined,
      select: { id: true, billingAccountId: true },
    });

    if (!org?.billingAccountId) {
      return [];
    }

    return this.prisma.payment.findMany({
      where: { billingAccountId: org.billingAccountId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
  }
}
