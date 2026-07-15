import { Controller, Get, Query } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { StaffRole } from "@cd-recruit/shared-types";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get("dev-token")
  getDevToken(
    @Query("staffId") staffId = "dev-staff-id-123",
    @Query("email") email = "recruiter@example.com",
    @Query("role") role = StaffRole.RECRUITER,
  ) {
    const token = this.authService.generateStaffToken(staffId, email, role);
    return { token };
  }
}
