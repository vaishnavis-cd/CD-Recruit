import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { StaffRole } from "@cd-recruit/shared-types";
import { PartnerAdminService } from "./partner-admin.service";
import { CreatePartnerDto, UpdatePartnerDto } from "./dto/partner-admin.dto";

@Controller("admin/partners")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(StaffRole.RECRUITER, StaffRole.ADMIN)
export class PartnerAdminController {
  constructor(private readonly partnerAdminService: PartnerAdminService) {}

  @Get()
  async list() {
    return this.partnerAdminService.list();
  }

  @Post()
  async create(@Body() dto: CreatePartnerDto, @CurrentUser() actor: any) {
    return this.partnerAdminService.create(dto, actor?.id || actor?.sub || "system");
  }

  @Post(":id/rotate-key")
  async rotateKey(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() actor: any,
  ) {
    return this.partnerAdminService.rotateKey(id, actor?.id || actor?.sub || "system");
  }

  @Patch(":id")
  async update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdatePartnerDto,
    @CurrentUser() actor: any,
  ) {
    return this.partnerAdminService.update(id, dto, actor?.id || actor?.sub || "system");
  }

  @Delete(":id")
  async revoke(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() actor: any,
  ) {
    return this.partnerAdminService.revoke(id, actor?.id || actor?.sub || "system");
  }
}
