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
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { RequirePermission } from "../common/decorators/permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { StaffRole, Permission } from "@cd-recruit/shared-types";
import { DriveService } from "./drive.service";
import {
  CreateDriveDto,
  UpdateDriveDto,
  ListDrivesQueryDto,
  SaveDriveQuestionsDto,
  AddCandidatesBulkDto,
} from "../common/dto/drive.dto";

@Controller("admin/drives")
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(
  StaffRole.ADMIN,
  StaffRole.HR_LEAD,
  StaffRole.HR_ASSOCIATE,
  StaffRole.REVIEWER,
  StaffRole.RECRUITER,
)
export class DriveController {
  constructor(private readonly driveService: DriveService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission(Permission.DRIVE_CREATE)
  async create(@Body() dto: CreateDriveDto, @CurrentUser() actor: any) {
    return this.driveService.create(dto, actor.id);
  }

  @Post("from-template/:roleTemplateId")
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission(Permission.DRIVE_CREATE)
  async createFromTemplate(
    @Param("roleTemplateId", ParseUUIDPipe) roleTemplateId: string,
    @Body() driveMeta: any,
    @CurrentUser() actor: any,
  ) {
    return this.driveService.createFromTemplate(roleTemplateId, driveMeta, actor?.id || actor?.sub || "system");
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
  async saveQuestionsPatch(
    @Param("driveId", ParseUUIDPipe) driveId: string,
    @Body() dto: SaveDriveQuestionsDto,
    @CurrentUser() actor: any,
  ) {
    return this.driveService.saveQuestions(driveId, dto, actor.id);
  }

  @Put(":driveId/questions")
  async saveQuestionsPut(
    @Param("driveId", ParseUUIDPipe) driveId: string,
    @Body() dto: SaveDriveQuestionsDto,
    @CurrentUser() actor: any,
  ) {
    return this.driveService.saveQuestions(driveId, dto, actor.id);
  }

  @Post(":driveId/candidates/bulk")
  @RequirePermission(Permission.CANDIDATE_INGEST_CSV)
  async addCandidatesBulk(
    @Param("driveId", ParseUUIDPipe) driveId: string,
    @Body() dto: AddCandidatesBulkDto,
    @CurrentUser() actor: any,
  ) {
    return this.driveService.addCandidatesBulk(driveId, dto.candidates, actor.id);
  }

  @Post(":driveId/generate-links")
  @RequirePermission(Permission.DRIVE_MANAGE)
  async generateLinks(
    @Param("driveId", ParseUUIDPipe) driveId: string,
    @CurrentUser() actor: any,
  ) {
    return this.driveService.generateLinks(driveId, actor.id);
  }

  @Delete(":driveId/candidates/:candidateId")
  async removeCandidate(
    @Param("driveId", ParseUUIDPipe) driveId: string,
    @Param("candidateId") candidateId: string,
    @CurrentUser() actor: any,
  ) {
    return this.driveService.removeCandidateFromDrive(driveId, candidateId, actor.id);
  }

  @Post(":driveId/unlock-editing")
  async unlockEditing(
    @Param("driveId", ParseUUIDPipe) driveId: string,
    @CurrentUser() actor: any,
  ) {
    return this.driveService.unlockEditing(driveId, actor?.id || actor?.sub || "system");
  }
}
