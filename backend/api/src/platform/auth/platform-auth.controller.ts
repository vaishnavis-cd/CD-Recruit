import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
} from "@nestjs/common";
import { PlatformAuthService } from "./platform-auth.service";
import {
  PlatformLoginDto,
  PlatformMfaVerifyDto,
  PlatformRefreshTokenDto,
  PlatformDevTokenQueryDto,
  PlatformLoginResponse,
  PlatformTokenResponse,
} from "./dto/platform-auth.dto";
import { PlatformJwtAuthGuard } from "./guards/platform-jwt-auth.guard";
import { PlatformRolesGuard } from "./guards/platform-roles.guard";
import { PlatformRoles } from "./decorators/platform-roles.decorator";
import { PlatformStaffRole } from "@cd-recruit/shared-types";

@Controller("platform/auth")
export class PlatformAuthController {
  constructor(private readonly platformAuthService: PlatformAuthService) {}

  /**
   * POST /api/v1/platform/auth/login
   * Authenticates against platform.platform_staff.
   */
  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: PlatformLoginDto): Promise<PlatformLoginResponse> {
    return this.platformAuthService.login(dto);
  }

  /**
   * POST /api/v1/platform/auth/mfa/verify
   * Completes MFA challenge verification.
   */
  @Post("mfa/verify")
  @HttpCode(HttpStatus.OK)
  async verifyMfa(@Body() dto: PlatformMfaVerifyDto): Promise<PlatformTokenResponse> {
    return this.platformAuthService.verifyMfa(dto);
  }

  /**
   * POST /api/v1/platform/auth/refresh
   * Rotates platform refresh token.
   */
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: PlatformRefreshTokenDto): Promise<PlatformTokenResponse> {
    return this.platformAuthService.refresh(dto);
  }

  /**
   * GET /api/v1/platform/auth/dev-token
   * Development only: Generates a signed platform token for local testing.
   */
  @Get("dev-token")
  async getDevToken(@Query() query: PlatformDevTokenQueryDto) {
    return this.platformAuthService.getDevToken(query);
  }

  /**
   * GET /api/v1/platform/auth/me
   * Minimal protected route to verify PlatformJwtAuthGuard.
   */
  @Get("me")
  @UseGuards(PlatformJwtAuthGuard)
  async getProfile(@Req() req: any) {
    return {
      user: req.user,
    };
  }

  /**
   * GET /api/v1/platform/auth/finance-only
   * Protected route to verify PlatformRolesGuard for FINANCE role (and OWNER hierarchy).
   */
  @Get("finance-only")
  @UseGuards(PlatformJwtAuthGuard, PlatformRolesGuard)
  @PlatformRoles(PlatformStaffRole.FINANCE)
  async financeOnlyRoute(@Req() req: any) {
    return {
      message: "Finance access granted",
      user: req.user,
    };
  }
}
