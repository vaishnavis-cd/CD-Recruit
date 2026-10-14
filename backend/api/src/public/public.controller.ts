import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { PublicPricingService } from "./public-pricing.service";
import { PublicOnboardingService } from "./public-onboarding.service";
import {
  GetPublicPricingQueryDto,
  PublicPricingResponseDto,
} from "./dto/public-pricing.dto";
import {
  PublicClientSignupDto,
  PublicClientSignupResponseDto,
} from "./dto/public-onboarding.dto";

@ApiTags("Public Landing & Onboarding")
@Controller("public")
export class PublicController {
  constructor(
    private readonly pricingService: PublicPricingService,
    private readonly onboardingService: PublicOnboardingService,
  ) {}

  /**
   * GET /api/v1/public/pricing
   * Returns publicly accessible regional pricing catalog.
   */
  @Get("pricing")
  @ApiOperation({ summary: "Get public pricing catalog and tier comparisons" })
  async getPricing(
    @Query() query: GetPublicPricingQueryDto,
  ): Promise<PublicPricingResponseDto> {
    return await this.pricingService.getPublicPricing(query);
  }

  /**
   * POST /api/v1/public/onboarding/signup
   * Direct self-serve workspace onboarding for prospective clients.
   */
  @Post("onboarding/signup")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Self-serve client registration and workspace creation" })
  async registerCompany(
    @Body() dto: PublicClientSignupDto,
  ): Promise<PublicClientSignupResponseDto> {
    return await this.onboardingService.registerCompany(dto);
  }
}
