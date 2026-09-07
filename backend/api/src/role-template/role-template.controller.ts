import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { RequirePermission } from "../common/decorators/permissions.decorator";
import { StaffRole, Permission } from "@cd-recruit/shared-types";
import { Department, ExperienceLevel } from "@prisma/client";
import { CandidateCategory } from "../common/utils/experience-tier.util";
import { RoleTemplateService } from "./role-template.service";
import { CreateRoleTemplateDto, UpdateRoleTemplateDto } from "./dto/role-template.dto";

@Controller("admin/role-templates")
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(
  StaffRole.ADMIN,
  StaffRole.HR_LEAD,
  StaffRole.HR_ASSOCIATE,
  StaffRole.REVIEWER,
  StaffRole.RECRUITER,
)
export class RoleTemplateController {
  constructor(private readonly roleTemplateService: RoleTemplateService) {}

  @Get()
  async findAll(
    @Query("department") department?: Department,
    @Query("level") level?: ExperienceLevel,
    @Query("category") category?: CandidateCategory,
    @Query("experienceTier") experienceTier?: string,
    @Query("isActive") isActive?: string,
  ) {
    const activeBool = isActive !== undefined ? isActive === "true" : undefined;
    return this.roleTemplateService.findAll({
      department,
      level,
      category,
      experienceTier,
      isActive: activeBool,
    });
  }

  @Get("active")
  async findActive(
    @Query("department") department: Department,
    @Query("level") level?: string,
    @Query("category") category?: string,
    @Query("experienceTier") experienceTier?: string,
  ) {
    return this.roleTemplateService.findActiveTemplate(
      department,
      category || level,
      experienceTier,
    );
  }

  @Get("by-department/:department")
  async findByDepartment(@Param("department") department: Department) {
    return this.roleTemplateService.findActiveTemplatesForDepartment(department);
  }

  @Get(":id")
  async findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.roleTemplateService.findOne(id);
  }

  @Post()
  @RequirePermission(Permission.ROLE_TEMPLATE_EDIT)
  async create(@Body() body: CreateRoleTemplateDto) {
    return this.roleTemplateService.create(body);
  }

  @Put(":id")
  @RequirePermission(Permission.ROLE_TEMPLATE_EDIT)
  async update(@Param("id", ParseUUIDPipe) id: string, @Body() body: UpdateRoleTemplateDto) {
    return this.roleTemplateService.update(id, body);
  }

  @Patch(":id")
  @RequirePermission(Permission.ROLE_TEMPLATE_EDIT)
  async patch(@Param("id", ParseUUIDPipe) id: string, @Body() body: UpdateRoleTemplateDto) {
    return this.roleTemplateService.update(id, body);
  }

  @Post(":id/publish-version")
  @RequirePermission(Permission.ROLE_TEMPLATE_EDIT)
  async publishNewVersion(@Param("id", ParseUUIDPipe) id: string) {
    return this.roleTemplateService.publishNewVersion(id);
  }

  @Post(":id/activate")
  @RequirePermission(Permission.ROLE_TEMPLATE_EDIT)
  async activate(@Param("id", ParseUUIDPipe) id: string) {
    return this.roleTemplateService.activateTemplate(id);
  }

  @Delete(":id")
  @RequirePermission(Permission.ROLE_TEMPLATE_EDIT)
  async remove(@Param("id", ParseUUIDPipe) id: string) {
    return this.roleTemplateService.remove(id);
  }
}
