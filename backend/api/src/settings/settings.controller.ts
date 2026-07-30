import {
  Controller,
  Get,
  Patch,
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

@Controller("admin/settings")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(StaffRole.ADMIN) // Settings are restricted to ADMIN role only
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get("staff")
  async listStaff() {
    return this.settingsService.listStaff();
  }

  @Patch("staff/:staffId/role")
  async updateStaffRole(
    @Param("staffId", ParseUUIDPipe) staffId: string,
    @Body() dto: UpdateStaffRoleDto,
    @CurrentUser() actor: any,
  ) {
    return this.settingsService.updateStaffRole(staffId, dto.role, actor.id);
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
      actor.id,
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
    return this.settingsService.updateTimingThresholds(dto, actor.id);
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
      actor.id,
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
      actor.id,
    );
  }

  @Get("audit-log")
  async listAuditLogs(@Query() query: ListAuditLogQueryDto) {
    return this.settingsService.listAuditLogs(query);
  }
}
