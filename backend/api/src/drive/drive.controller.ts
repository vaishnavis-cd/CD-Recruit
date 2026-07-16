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
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { UUIDValidationPipe } from "../common/pipes/uuid-validation.pipe";
import { StaffRole } from "@cd-recruit/shared-types";
import { DriveService } from "./drive.service";
import { CreateDriveDto, UpdateDriveDto, ListDrivesQueryDto } from "../common/dto/drive.dto";

@Controller("admin/drives")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(StaffRole.RECRUITER, StaffRole.ADMIN)
export class DriveController {
  constructor(private readonly driveService: DriveService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateDriveDto, @CurrentUser() staff: any) {
    return this.driveService.create(dto, staff.id);
  }

  @Get()
  async list(@Query() query: ListDrivesQueryDto) {
    return this.driveService.list(query);
  }

  @Get(":driveId")
  async findOne(@Param("driveId", UUIDValidationPipe) driveId: string) {
    return this.driveService.findOne(driveId);
  }

  @Patch(":driveId")
  async update(
    @Param("driveId", UUIDValidationPipe) driveId: string,
    @Body() dto: UpdateDriveDto,
    @CurrentUser() staff: any,
  ) {
    return this.driveService.update(driveId, dto, staff.id);
  }

  @Post(":driveId/duplicate")
  @HttpCode(HttpStatus.CREATED)
  async duplicate(
    @Param("driveId", UUIDValidationPipe) driveId: string,
    @CurrentUser() staff: any,
  ) {
    return this.driveService.duplicate(driveId, staff.id);
  }

  @Post(":driveId/close")
  async closeEarly(
    @Param("driveId", UUIDValidationPipe) driveId: string,
    @CurrentUser() staff: any,
  ) {
    return this.driveService.closeEarly(driveId, staff.id);
  }

  @Delete(":driveId")
  async delete(
    @Param("driveId", UUIDValidationPipe) driveId: string,
    @CurrentUser() staff: any,
  ) {
    return this.driveService.delete(driveId, staff.id);
  }
}
