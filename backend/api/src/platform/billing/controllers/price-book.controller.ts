import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  UseGuards,
  Req,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { PlatformJwtAuthGuard } from "../../auth/guards/platform-jwt-auth.guard";
import { PlatformRolesGuard } from "../../auth/guards/platform-roles.guard";
import { PlatformRoles } from "../../auth/decorators/platform-roles.decorator";
import { PlatformStaffRole } from "@cd-recruit/shared-types";
import { PriceBookService } from "../../../billing/price/price-book.service";
import {
  ListPricingCatalogQueryDto,
  PublishPriceBookEntryDto,
} from "../dto/pricing.dto";

@ApiTags("Platform Pricing Catalog")
@ApiBearerAuth()
@Controller("platform/billing/pricing")
@UseGuards(PlatformJwtAuthGuard, PlatformRolesGuard)
export class PriceBookController {
  constructor(private readonly priceBookService: PriceBookService) {}

  /**
   * API-H2-14: View versioned Price Book catalog by country.
   */
  @Get()
  @PlatformRoles(PlatformStaffRole.SUPPORT, PlatformStaffRole.FINANCE, PlatformStaffRole.OWNER)
  @ApiOperation({ summary: "List Price Book catalog entries (API-H2-14)" })
  async listCatalog(@Query() query: ListPricingCatalogQueryDto) {
    return await this.priceBookService.listCatalog({
      country: query.country,
      activeOnly: query.activeOnly,
    });
  }

  /**
   * API-H2-15: Publish a new immutable Price Book entry version.
   */
  @Post()
  @PlatformRoles(PlatformStaffRole.FINANCE, PlatformStaffRole.OWNER)
  @ApiOperation({ summary: "Publish new versioned Price Book entry (API-H2-15)" })
  async publishNewVersion(
    @Req() req: any,
    @Body() dto: PublishPriceBookEntryDto,
  ) {
    const actor = req.user;
    return await this.priceBookService.publishNewVersion(actor, dto);
  }
}
