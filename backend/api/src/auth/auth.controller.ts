import { Controller, Get, Query, ForbiddenException } from "@nestjs/common";
import { IsOptional, IsString, IsEmail, IsEnum } from "class-validator";
import { AuthService } from "./auth.service";
import { StaffRole } from "@cd-recruit/shared-types";

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

