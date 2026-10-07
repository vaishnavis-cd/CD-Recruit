import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PlatformJwtAuthGuard } from '../auth/guards/platform-jwt-auth.guard';
import { PlatformRolesGuard } from '../auth/guards/platform-roles.guard';
import {
  PlatformRoles,
  PLATFORM_STAFF_ADMIN_ROLES,
  PLATFORM_READ_ROLES,
} from '../auth/decorators/platform-roles.decorator';
import { PlatformStaffService } from './platform-staff.service';
import {
  ListPlatformStaffQueryDto,
  ListPlatformStaffResponseDto,
  PlatformStaffListItemDto,
  CreatePlatformStaffDto,
  UpdateStaffRoleDto,
  StaffActionReasonDto,
  ResetStaffPasswordDto,
  StaffOptionDto,
} from './dto/platform-staff.dto';

@Controller('platform/staff')
@UseGuards(PlatformJwtAuthGuard, PlatformRolesGuard)
export class PlatformStaffController {
  constructor(private readonly staffService: PlatformStaffService) {}

  /**
   * GET /api/v1/platform/staff/options
   * Dropdown selector for assigning internal owners (Zero PII email).
   * Accessible by OWNER, FINANCE, SUPPORT.
   */
  @Get('options')
  @PlatformRoles(...PLATFORM_READ_ROLES)
  async getStaffOptions(): Promise<StaffOptionDto[]> {
    return this.staffService.getStaffOptions();
  }

  /**
   * GET /api/v1/platform/staff
   * Paginated list of platform staff (OWNER only).
   */
  @Get()
  @PlatformRoles(...PLATFORM_STAFF_ADMIN_ROLES)
  async listStaff(
    @Query() query: ListPlatformStaffQueryDto,
  ): Promise<ListPlatformStaffResponseDto> {
    return this.staffService.listStaff(query);
  }

  /**
   * POST /api/v1/platform/staff
   * Create new platform staff member (OWNER only).
   */
  @Post()
  @PlatformRoles(...PLATFORM_STAFF_ADMIN_ROLES)
  async createStaff(
    @Body() dto: CreatePlatformStaffDto,
    @Req() req: any,
  ): Promise<PlatformStaffListItemDto> {
    const actor = {
      id: req.user.id || req.user.sub,
      role: req.user.role || req.user.platformRole,
    };
    return this.staffService.createStaff(dto, actor);
  }

  /**
   * PATCH /api/v1/platform/staff/:id/role
   * Update staff role (OWNER only).
   */
  @Patch(':id/role')
  @HttpCode(HttpStatus.OK)
  @PlatformRoles(...PLATFORM_STAFF_ADMIN_ROLES)
  async updateRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStaffRoleDto,
    @Req() req: any,
  ) {
    const actor = {
      id: req.user.id || req.user.sub,
      role: req.user.role || req.user.platformRole,
    };
    return this.staffService.updateRole(id, dto, actor);
  }

  /**
   * POST /api/v1/platform/staff/:id/deactivate
   * Deactivate staff member (OWNER only).
   */
  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @PlatformRoles(...PLATFORM_STAFF_ADMIN_ROLES)
  async deactivateStaff(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StaffActionReasonDto,
    @Req() req: any,
  ) {
    const actor = {
      id: req.user.id || req.user.sub,
      role: req.user.role || req.user.platformRole,
    };
    return this.staffService.deactivateStaff(id, dto, actor);
  }

  /**
   * POST /api/v1/platform/staff/:id/reactivate
   * Reactivate staff member (OWNER only).
   */
  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  @PlatformRoles(...PLATFORM_STAFF_ADMIN_ROLES)
  async reactivateStaff(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StaffActionReasonDto,
    @Req() req: any,
  ) {
    const actor = {
      id: req.user.id || req.user.sub,
      role: req.user.role || req.user.platformRole,
    };
    return this.staffService.reactivateStaff(id, dto, actor);
  }

  /**
   * POST /api/v1/platform/staff/:id/reset-mfa
   * Reset TOTP MFA for staff member (OWNER only).
   */
  @Post(':id/reset-mfa')
  @HttpCode(HttpStatus.OK)
  @PlatformRoles(...PLATFORM_STAFF_ADMIN_ROLES)
  async resetMfa(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StaffActionReasonDto,
    @Req() req: any,
  ) {
    const actor = {
      id: req.user.id || req.user.sub,
      role: req.user.role || req.user.platformRole,
    };
    return this.staffService.resetMfa(id, dto, actor);
  }

  /**
   * POST /api/v1/platform/staff/:id/reset-password
   * Reset password for staff member (OWNER only).
   */
  @Post(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  @PlatformRoles(...PLATFORM_STAFF_ADMIN_ROLES)
  async resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetStaffPasswordDto,
    @Req() req: any,
  ) {
    const actor = {
      id: req.user.id || req.user.sub,
      role: req.user.role || req.user.platformRole,
    };
    return this.staffService.resetPassword(id, dto, actor);
  }
}
