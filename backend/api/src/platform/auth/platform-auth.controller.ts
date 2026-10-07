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
  PlatformChangePasswordDto,
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
  async login(@Body() dto: PlatformLoginDto, @Req() req: any): Promise<PlatformLoginResponse> {
    return this.platformAuthService.login(dto, req.ip);
  }

  /**
   * POST /api/v1/platform/auth/change-password
   * Mandatory password change for newly invited staff or forced reset.
   */
  @Post("change-password")
  @UseGuards(PlatformJwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async changePassword(@Req() req: any, @Body() dto: PlatformChangePasswordDto) {
    const staffId = req.user.sub || req.user.id;
    return this.platformAuthService.changePassword(staffId, dto, req.ip);
  }

  /**
   * POST /api/v1/platform/auth/mfa/verify
   * Completes MFA challenge verification.
   */
  @Post("mfa/verify")
  @HttpCode(HttpStatus.OK)
  async verifyMfa(@Body() dto: PlatformMfaVerifyDto, @Req() req: any): Promise<PlatformTokenResponse> {
    return this.platformAuthService.verifyMfa(dto, req.ip);
  }

  /**
   * POST /api/v1/platform/auth/mfa/setup
   * Generates a new TOTP secret & QR code data URL for authenticated staff.
   */
  @Post("mfa/setup")
  @UseGuards(PlatformJwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async setupMfa(@Req() req: any) {
    const staffId = req.user.sub || req.user.id;
    return this.platformAuthService.setupMfa(staffId, req.ip);
  }

  /**
   * POST /api/v1/platform/auth/mfa/confirm
   * Verifies the first code and activates MFA on the account.
   */
  @Post("mfa/confirm")
  @UseGuards(PlatformJwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async confirmMfa(@Req() req: any, @Body() dto: any) {
    const staffId = req.user.sub || req.user.id;
    return this.platformAuthService.confirmMfa(staffId, dto, req.ip);
  }

  /**
   * POST /api/v1/platform/auth/refresh
   * Rotates platform refresh token.
   */
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: PlatformRefreshTokenDto, @Req() req: any): Promise<PlatformTokenResponse> {
    return this.platformAuthService.refresh(dto, req.ip);
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
