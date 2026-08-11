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
import { Roles } from "../common/decorators/roles.decorator";
import { StaffRole } from "@cd-recruit/shared-types";
import { RoleTemplateService } from "./role-template.service";
import { Department, ExperienceLevel } from "@prisma/client";
import { CreateRoleTemplateDto, UpdateRoleTemplateDto } from "./dto/role-template.dto";

@Controller("admin/role-templates")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(StaffRole.RECRUITER, StaffRole.ADMIN)
export class RoleTemplateController {
  constructor(private readonly roleTemplateService: RoleTemplateService) {}

  @Get()
  async findAll(
    @Query("department") department?: Department,
    @Query("level") level?: ExperienceLevel,
    @Query("isActive") isActive?: string,
  ) {
    const activeBool = isActive !== undefined ? isActive === "true" : undefined;
    return this.roleTemplateService.findAll({ department, level, isActive: activeBool });
  }

  @Get("active")
  async findActive(
    @Query("department") department: Department,
    @Query("level") level: ExperienceLevel,
  ) {
    return this.roleTemplateService.findActiveTemplate(department, level);
  }

  @Get(":id")
  async findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.roleTemplateService.findOne(id);
  }

  @Post()
  async create(@Body() body: CreateRoleTemplateDto) {
    return this.roleTemplateService.create(body);
  }

  @Put(":id")
  async update(@Param("id", ParseUUIDPipe) id: string, @Body() body: UpdateRoleTemplateDto) {
    return this.roleTemplateService.update(id, body);
  }

  @Patch(":id")
  async patch(@Param("id", ParseUUIDPipe) id: string, @Body() body: UpdateRoleTemplateDto) {
    return this.roleTemplateService.update(id, body);
  }

  @Post(":id/publish-version")
  async publishNewVersion(@Param("id", ParseUUIDPipe) id: string) {
    return this.roleTemplateService.publishNewVersion(id);
  }

  @Delete(":id")
  async remove(@Param("id", ParseUUIDPipe) id: string) {
    return this.roleTemplateService.remove(id);
  }
}
