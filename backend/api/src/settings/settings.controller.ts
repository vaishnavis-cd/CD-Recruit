import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { StaffRole } from "@cd-recruit/shared-types";
import { SettingsService } from "./settings.service";
import { UpdateStaffRoleDto, UpdateScoringConfigDto, UpdateRetentionConfigDto, ListAuditLogQueryDto, UpdateAppealWindowConfigDto } from "../common/dto/settings.dto";
import { Department, ModuleType } from "@prisma/client";

@Controller("admin/settings")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(StaffRole.ADMIN) // Settings are restricted to ADMIN role only
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get("staff")
  async listStaff() {
    return this.settingsService.listStaff();
  }

  @Post("staff")
  async createStaff(
    @Body() dto: { name: string; email: string; role: StaffRole },
    @CurrentUser() actor: any,
  ) {
    return this.settingsService.createStaff(dto, actor);
  }

  @Delete("staff/:staffId")
  async deleteStaff(
    @Param("staffId", ParseUUIDPipe) staffId: string,
    @CurrentUser() actor: any,
  ) {
    return this.settingsService.deleteStaff(staffId, actor);
  }

  @Patch("staff/:staffId/role")
  async updateStaffRole(
    @Param("staffId", ParseUUIDPipe) staffId: string,
    @Body() dto: UpdateStaffRoleDto,
    @CurrentUser() actor: any,
  ) {
    return this.settingsService.updateStaffRole(staffId, dto.role, actor);
  }

  @Get("scoring")
  async getScoringConfig() {
    return this.settingsService.getScoringConfig();
  }

  @Patch("scoring")
  async updateScoringConfig(
    @Body() dto: UpdateScoringConfigDto,
    @CurrentUser() actor: any,
  ) {
    return this.settingsService.updateScoringConfig(
      dto.aiConfidenceThreshold,
      dto.passRateThreshold,
      actor,
      dto.aiIntensity,
    );
  }

  @Get("system")
  async getSystemConfig() {
    return this.settingsService.getTimingThresholds();
  }

  @Patch("system")
  async updateSystemConfig(
    @Body() dto: any,
    @CurrentUser() actor: any,
  ) {
    return this.settingsService.updateTimingThresholds(dto, actor);
  }

  @Get("retention")
  async getRetentionConfig() {
    return this.settingsService.getRetentionConfig();
  }

  @Patch("retention")
  async updateRetentionConfig(
    @Body() dto: UpdateRetentionConfigDto,
    @CurrentUser() actor: any,
  ) {
    return this.settingsService.updateRetentionConfig(
      dto.biometricRetentionDays,
      actor,
    );
  }

  @Get("appeal-window")
  async getAppealWindowConfig() {
    return this.settingsService.getAppealWindowConfig();
  }

  @Patch("appeal-window")
  async updateAppealWindowConfig(
    @Body() dto: UpdateAppealWindowConfigDto,
    @CurrentUser() actor: any,
  ) {
    return this.settingsService.updateAppealWindowConfig(
      dto.appealWindowDays,
      actor,
    );
  }

  @Get("audit-log")
  async listAuditLogs(@Query() query: ListAuditLogQueryDto) {
    return this.settingsService.listAuditLogs(query);
  }

  @Get("audit-logs")
  async listAuditLogsAlias(@Query() query: ListAuditLogQueryDto) {
    return this.settingsService.listAuditLogs(query);
  }

  @Get("modules")
  @Roles(StaffRole.ADMIN, StaffRole.RECRUITER)
  async getModuleSettings() {
    return this.settingsService.getModuleSettings();
  }

  @Patch("modules")
  async updateModuleSetting(
    @Body() dto: { department: Department; moduleType: ModuleType; isEnabled: boolean },
    @CurrentUser() actor: any,
  ) {
    return this.settingsService.updateModuleSetting(
      dto.department,
      dto.moduleType,
      dto.isEnabled,
      actor,
    );
  }

  @Patch("modules/bulk-department")
  async bulkUpdateDepartmentModules(
    @Body() dto: { department: Department; isEnabled: boolean },
    @CurrentUser() actor: any,
  ) {
    return this.settingsService.bulkUpdateDepartmentModules(
      dto.department,
      dto.isEnabled,
      actor,
    );
  }
}
