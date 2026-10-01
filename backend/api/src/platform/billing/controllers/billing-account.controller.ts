import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  NotFoundException,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { PlatformJwtAuthGuard } from "../../auth/guards/platform-jwt-auth.guard";
import { PlatformRolesGuard } from "../../auth/guards/platform-roles.guard";
import { PlatformRoles } from "../../auth/decorators/platform-roles.decorator";
import { PlatformStaffRole } from "@cd-recruit/shared-types";
import { BillingAccountService } from "../../../billing/account/billing-account.service";
import { CreditPoolService } from "../../../billing/pool/credit-pool.service";
import {
  ListBillingAccountsQueryDto,
  BillingAccountIdParamDto,
} from "../dto/billing-account.dto";

@ApiTags("Platform Billing Accounts")
@ApiBearerAuth()
@Controller("platform/billing/accounts")
@UseGuards(PlatformJwtAuthGuard, PlatformRolesGuard)
export class BillingAccountController {
  constructor(
    private readonly billingAccountService: BillingAccountService,
    private readonly creditPoolService: CreditPoolService,
  ) {}

  /**
   * API-H2-01: Paginated list of billing accounts with remaining balances, overdraft, and status.
   */
  @Get()
  @PlatformRoles(PlatformStaffRole.SUPPORT, PlatformStaffRole.FINANCE, PlatformStaffRole.OWNER)
  @ApiOperation({ summary: "List billing accounts with balances and pagination (API-H2-01)" })
  async listAccounts(@Query() query: ListBillingAccountsQueryDto) {
    return await this.billingAccountService.listAccounts(query);
  }

  /**
   * API-H2-02: Full detail of a single billing account.
   */
  @Get(":id")
  @PlatformRoles(PlatformStaffRole.SUPPORT, PlatformStaffRole.FINANCE, PlatformStaffRole.OWNER)
  @ApiOperation({ summary: "Get single billing account details (API-H2-02)" })
  async getAccountDetail(@Param() params: BillingAccountIdParamDto) {
    const account = await this.billingAccountService.getAccountById(params.id);
    if (!account) {
      throw new NotFoundException(`Billing account '${params.id}' not found`);
    }
    return account;
  }

  /**
   * API-H2-03: Lightweight financial snapshot (balances, pools, badges) for Tenant 360 view.
   */
  @Get(":id/summary")
  @PlatformRoles(PlatformStaffRole.SUPPORT, PlatformStaffRole.FINANCE, PlatformStaffRole.OWNER)
  @ApiOperation({ summary: "Get financial summary for Tenant 360 (API-H2-03)" })
  async getAccountSummary(@Param() params: BillingAccountIdParamDto) {
    return await this.billingAccountService.getAccountSummary(params.id);
  }

  /**
   * API-H2-04: List all credit pools (active, queued, exhausted) for an account.
   */
  @Get(":id/pools")
  @PlatformRoles(PlatformStaffRole.SUPPORT, PlatformStaffRole.FINANCE, PlatformStaffRole.OWNER)
  @ApiOperation({ summary: "List credit pools for account (API-H2-04)" })
  async getAccountPools(@Param() params: BillingAccountIdParamDto) {
    return await this.creditPoolService.getAccountPools(params.id);
  }
}
