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
  ParseUUIDPipe,
} from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { StaffRole } from "@cd-recruit/shared-types";
import { DriveService } from "./drive.service";
import { CreateDriveDto, UpdateDriveDto, ListDrivesQueryDto, SaveDriveQuestionsDto, AddCandidatesBulkDto } from "../common/dto/drive.dto";

@Controller("admin/drives")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(StaffRole.RECRUITER, StaffRole.ADMIN)
export class DriveController {
  constructor(private readonly driveService: DriveService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateDriveDto, @CurrentUser() actor: any) {
    return this.driveService.create(dto, actor.id);
  }

  @Get()
  async list(@Query() query: ListDrivesQueryDto) {
    return this.driveService.list(query);
  }

  @Get(":driveId")
  async findOne(@Param("driveId", ParseUUIDPipe) driveId: string) {
    return this.driveService.findOne(driveId);
  }

  @Patch(":driveId")
  async update(
    @Param("driveId", ParseUUIDPipe) driveId: string,
    @Body() dto: UpdateDriveDto,
    @CurrentUser() actor: any,
  ) {
    return this.driveService.update(driveId, dto, actor.id);
  }

  @Post(":driveId/duplicate")
  async duplicate(
    @Param("driveId", ParseUUIDPipe) driveId: string,
    @CurrentUser() actor: any,
  ) {
    return this.driveService.duplicate(driveId, actor.id);
  }

  @Post(":driveId/close")
  async closeEarly(
    @Param("driveId", ParseUUIDPipe) driveId: string,
    @CurrentUser() actor: any,
  ) {
    return this.driveService.closeEarly(driveId, actor.id);
  }

  @Delete(":driveId")
  async delete(
    @Param("driveId", ParseUUIDPipe) driveId: string,
    @CurrentUser() actor: any,
  ) {
    return this.driveService.delete(driveId, actor.id);
  }

  @Patch(":driveId/questions")
  async saveQuestions(
    @Param("driveId", ParseUUIDPipe) driveId: string,
    @Body() dto: SaveDriveQuestionsDto,
    @CurrentUser() actor: any,
  ) {
    return this.driveService.saveQuestions(driveId, dto.questionIds, actor.id);
  }

  @Post(":driveId/candidates/bulk")
  async addCandidatesBulk(
    @Param("driveId", ParseUUIDPipe) driveId: string,
    @Body() dto: AddCandidatesBulkDto,
    @CurrentUser() actor: any,
  ) {
    return this.driveService.addCandidatesBulk(driveId, dto.candidates, actor.id);
  }

  @Post(":driveId/generate-links")
  async generateLinks(
    @Param("driveId", ParseUUIDPipe) driveId: string,
    @CurrentUser() actor: any,
  ) {
    return this.driveService.generateLinks(driveId, actor.id);
  }
}
