import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Req,
} from "@nestjs/common";
import { IsOptional, IsString, IsEmail, IsEnum } from "class-validator";
import { AuthService } from "./auth.service";
import { StaffRole } from "@cd-recruit/shared-types";
import {
  StaffLoginDto,
  RefreshTokenDto,
  StaffLogoutDto,
  StaffLoginResponse,
  StaffRefreshResponse,
} from "../common/dto/auth.dto";

export class DevTokenQueryDto {
  @IsOptional()
  @IsString()
  staffId?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsEnum(StaffRole)
  role?: StaffRole;
}

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /api/v1/auth/login
   * Authenticates staff using email and password, returning an access and refresh token.
   */
  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: StaffLoginDto): Promise<StaffLoginResponse> {
    return this.authService.loginStaff(dto);
  }

  /**
   * POST /api/v1/auth/refresh
   * Validates and rotates the staff refresh token, returning a new access and refresh token pair.
   */
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshTokenDto): Promise<StaffRefreshResponse> {
    return this.authService.refreshStaffToken(dto);
  }

  /**
   * POST /api/v1/auth/logout
   * Invalidates the staff refresh token in PostgreSQL.
   */
  @Post("logout")
  @HttpCode(HttpStatus.OK)
  async logout(
    @Body() dto: StaffLogoutDto,
    @Req() req: any,
  ): Promise<{ ok: boolean; message: string }> {
    const staffId = req.user?.id;
    return this.authService.logoutStaff(dto, staffId);
  }

  @Get("dev-token")
  getDevToken(@Query() query: DevTokenQueryDto) {
    if (process.env.NODE_ENV === "production") {
      throw new ForbiddenException("dev-token endpoint is disabled in production");
    }
    const role = query.role ? query.role : StaffRole.ADMIN;
    const staffId = query.staffId || (role === StaffRole.ADMIN ? "admin-staff-id-123" : "dev-staff-id-123");
    const email = query.email || (role === StaffRole.ADMIN ? "admin@cdrecruit.local" : "recruiter@example.com");
    const token = this.authService.generateStaffToken(staffId, email, role);
    return { token };
  }
}


