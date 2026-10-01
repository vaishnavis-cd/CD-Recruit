import {
  Controller,
  Get,
  Param,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { PlatformJwtAuthGuard } from "../../auth/guards/platform-jwt-auth.guard";
import { PlatformRolesGuard } from "../../auth/guards/platform-roles.guard";
import { PlatformRoles } from "../../auth/decorators/platform-roles.decorator";
import { PlatformStaffRole } from "@cd-recruit/shared-types";
import { CreditPoolService } from "../../../billing/pool/credit-pool.service";
import { CreditPoolIdParamDto } from "../dto/credit-pool.dto";

@ApiTags("Platform Credit Pools")
@ApiBearerAuth()
@Controller("platform/billing/pools")
@UseGuards(PlatformJwtAuthGuard, PlatformRolesGuard)
export class CreditPoolController {
  constructor(private readonly creditPoolService: CreditPoolService) {}

  /**
   * API-H2-05: Deep inspection of a single credit pool (validity, terms, ledger entries).
   */
  @Get(":id")
  @PlatformRoles(PlatformStaffRole.SUPPORT, PlatformStaffRole.FINANCE, PlatformStaffRole.OWNER)
  @ApiOperation({ summary: "Get single credit pool details (API-H2-05)" })
  async getPoolDetail(@Param() params: CreditPoolIdParamDto) {
    return await this.creditPoolService.getPoolById(params.id);
  }
}
