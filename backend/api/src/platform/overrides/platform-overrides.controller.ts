import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { PlatformJwtAuthGuard } from "../auth/guards/platform-jwt-auth.guard";
import { PlatformRolesGuard } from "../auth/guards/platform-roles.guard";
import {
  PlatformRoles,
  PLATFORM_READ_ROLES,
  PLATFORM_MUTATION_ROLES,
} from "../auth/decorators/platform-roles.decorator";
import { PlatformOverridesService } from "./platform-overrides.service";
import {
  CreateOverrideDto,
  ListOverridesQueryDto,
  RevokeOverrideDto,
} from "./dto/platform-overrides.dto";

@ApiTags("Platform Operational Overrides")
@ApiBearerAuth()
@Controller("platform/overrides")
@UseGuards(PlatformJwtAuthGuard, PlatformRolesGuard)
export class PlatformOverridesController {
  constructor(private readonly overridesService: PlatformOverridesService) {}

  /**
   * GET /api/v1/platform/overrides
   * List all operational overrides across tenants
   */
  @Get()
  @PlatformRoles(...PLATFORM_READ_ROLES)
  @ApiOperation({ summary: "List operational overrides" })
  async listOverrides(@Query() query: ListOverridesQueryDto) {
    return await this.overridesService.listOverrides(query);
  }

  /**
   * POST /api/v1/platform/overrides
   * Declare general operational override
   */
  @Post()
  @PlatformRoles(...PLATFORM_MUTATION_ROLES)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Declare operational override" })
  async createOverride(@Req() req: any, @Body() dto: CreateOverrideDto) {
    return await this.overridesService.createOverride(req.user, dto);
  }

  /**
   * POST /api/v1/platform/overrides/proctoring
   * Declare proctoring relaxation override (called from UI modal)
   */
  @Post("proctoring")
  @PlatformRoles(...PLATFORM_MUTATION_ROLES)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Declare proctoring relaxation override" })
  async createProctoringOverride(@Req() req: any, @Body() dto: CreateOverrideDto) {
    dto.overrideType = "PROCTORING_RELAXATION";
    return await this.overridesService.createOverride(req.user, dto);
  }

  /**
   * POST /api/v1/platform/overrides/schedule
   * Declare schedule extension override
   */
  @Post("schedule")
  @PlatformRoles(...PLATFORM_MUTATION_ROLES)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Declare schedule extension override" })
  async createScheduleOverride(@Req() req: any, @Body() dto: CreateOverrideDto) {
    dto.overrideType = "SCHEDULE_EXTENSION";
    return await this.overridesService.createOverride(req.user, dto);
  }

  /**
   * POST /api/v1/platform/overrides/question-fix
   * Declare question correction override
   */
  @Post("question-fix")
  @PlatformRoles(...PLATFORM_MUTATION_ROLES)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Declare question fix override" })
  async createQuestionOverride(@Req() req: any, @Body() dto: CreateOverrideDto) {
    dto.overrideType = "QUESTION_CORRECTION";
    return await this.overridesService.createOverride(req.user, dto);
  }

  /**
   * POST /api/v1/platform/overrides/invite-ratio
   * Declare invite ratio override
   */
  @Post("invite-ratio")
  @PlatformRoles(...PLATFORM_MUTATION_ROLES)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Declare invite ratio override" })
  async createInviteRatioOverride(@Req() req: any, @Body() dto: CreateOverrideDto) {
    dto.overrideType = "INVITE_RATIO";
    return await this.overridesService.createOverride(req.user, dto);
  }

  /**
   * POST /api/v1/platform/overrides/:id/revoke
   * Revoke operational override early
   */
  @Post(":id/revoke")
  @PlatformRoles(...PLATFORM_MUTATION_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Revoke operational override early" })
  async revokeOverride(
    @Req() req: any,
    @Param("id") id: string,
    @Body() dto: RevokeOverrideDto,
  ) {
    await this.overridesService.revokeOverride(req.user, id, dto);
    return { success: true, message: `Override ${id} successfully revoked` };
  }

  /**
   * DELETE /api/v1/platform/overrides/:id
   * Revoke/remove operational override
   */
  @Delete(":id")
  @PlatformRoles(...PLATFORM_MUTATION_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Revoke operational override" })
  async deleteOverride(@Req() req: any, @Param("id") id: string) {
    await this.overridesService.revokeOverride(req.user, id);
    return { success: true, message: `Override ${id} successfully revoked` };
  }
}
