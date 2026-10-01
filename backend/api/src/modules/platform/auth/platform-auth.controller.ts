import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { PlatformAuthService } from './platform-auth.service';
import { PlatformLoginDto } from './dto/platform-login.dto';
import { VerifyMfaDto, ConfirmMfaDto } from './dto/verify-mfa.dto';
import { PlatformAuthGuard } from './guards/platform-auth.guard';
import { RequireMfa } from './decorators/require-mfa.decorator';
import { CurrentPlatformStaff } from './decorators/platform-staff.decorator';
import { AuthenticatedPlatformStaff } from './interfaces/platform-auth-payload.interface';

@Controller('api/v1/platform/auth')
export class PlatformAuthController {
  constructor(private readonly authService: PlatformAuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: PlatformLoginDto, @Req() req: Request) {
    const clientIp = req.ip || req.socket.remoteAddress || '127.0.0.1';
    return this.authService.login(dto, clientIp);
  }

  @Post('mfa/verify')
  @HttpCode(HttpStatus.OK)
  async verifyMfa(@Body() dto: VerifyMfaDto, @Req() req: Request) {
    const clientIp = req.ip || req.socket.remoteAddress || '127.0.0.1';
    return this.authService.verifyMfa(dto, clientIp);
  }

  @Post('mfa/setup')
  @UseGuards(PlatformAuthGuard)
  @RequireMfa(false) // Allows access during the setup phase before MFA is locked
  async setupMfa(@CurrentPlatformStaff() staff: AuthenticatedPlatformStaff) {
    return this.authService.setupMfa(staff.id);
  }

  @Post('mfa/confirm')
  @UseGuards(PlatformAuthGuard)
  @RequireMfa(false)
  @HttpCode(HttpStatus.OK)
  async confirmMfa(
    @CurrentPlatformStaff() staff: AuthenticatedPlatformStaff,
    @Body() dto: ConfirmMfaDto,
  ) {
    return this.authService.confirmMfa(staff.id, dto);
  }

  @Get('me')
  @UseGuards(PlatformAuthGuard)
  async getProfile(@CurrentPlatformStaff() staff: AuthenticatedPlatformStaff) {
    return {
      id: staff.id,
      email: staff.email,
      fullName: staff.fullName,
      role: staff.role,
      mfaEnabled: staff.mfaEnabled,
      mfaVerified: staff.mfaVerified,
    };
  }

  @Post('logout')
  @UseGuards(PlatformAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout() {
    return { success: true, message: 'Logged out successfully' };
  }
}
