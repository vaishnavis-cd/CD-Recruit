import {
  Controller,
  Get,
  Post,
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
import { AdminService } from "./admin.service";
import { InviteService } from "./invite.service";
import { DashboardService } from "./dashboard.service";
import {
  ListSessionsQueryDto,
  RecordDecisionDto,
  CreateInviteDto,
  ListInvitesQueryDto,
  ExtendExpiryDto,
  BulkInviteActionDto,
} from "../common/dto/admin.dto";

@Controller("admin")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(StaffRole.RECRUITER, StaffRole.ADMIN)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly inviteService: InviteService,
    private readonly dashboardService: DashboardService,
  ) {}

  @Get("dashboard/stats")
  async getDashboardStats(@Query() query: any) {
    return this.dashboardService.getDashboardStats(query);
  }

  @Get("dashboard/action-queue")
  async getActionQueue() {
    return this.dashboardService.getActionQueue();
  }

  @Get("dashboard/export")
  async exportStats(@Query() query: any) {
    return this.dashboardService.getDashboardStats(query);
  }

  @Get("sessions")
  async listSessions(@Query() query: ListSessionsQueryDto) {
    return this.adminService.listSessions(query);
  }

  @Get("sessions/:sessionId")
  async getSessionDetail(
    @Param("sessionId", UUIDValidationPipe) sessionId: string,
  ) {
    return this.adminService.getSessionDetail(sessionId);
  }

  @Post("sessions/:sessionId/decision")
  @HttpCode(HttpStatus.CREATED)
  async recordDecision(
    @Param("sessionId", UUIDValidationPipe) sessionId: string,
    @Body() dto: RecordDecisionDto,
    @CurrentUser() staff: any,
  ) {
    return this.adminService.recordDecision(sessionId, dto.decision, staff.id, dto.note);
  }

  @Get("sessions/:sessionId/events")
  async getSessionEvents(
    @Param("sessionId", UUIDValidationPipe) sessionId: string,
  ) {
    return this.adminService.getSessionEvents(sessionId);
  }

  @Get("sessions/:sessionId/integrity-flags")
  async getIntegrityFlags(
    @Param("sessionId", UUIDValidationPipe) sessionId: string,
  ) {
    return this.adminService.getIntegrityFlags(sessionId);
  }

  @Get("role-templates")
  async listRoleTemplates() {
    return this.adminService.listRoleTemplates();
  }

  @Post("invites")
  @HttpCode(HttpStatus.CREATED)
  async createInvite(@Body() dto: CreateInviteDto, @CurrentUser() staff: any) {
    return this.inviteService.createInvite(dto, staff.id);
  }

  @Get("invites")
  async listInvites(@Query() query: ListInvitesQueryDto) {
    return this.inviteService.listInvites(query);
  }

  @Post("invites/:inviteId/revoke")
  async revokeInvite(
    @Param("inviteId", UUIDValidationPipe) inviteId: string,
    @CurrentUser() staff: any,
  ) {
    return this.inviteService.revokeInvite(inviteId, staff.id);
  }

  @Post("invites/:inviteId/extend")
  async extendExpiry(
    @Param("inviteId", UUIDValidationPipe) inviteId: string,
    @Body() dto: ExtendExpiryDto,
    @CurrentUser() staff: any,
  ) {
    return this.inviteService.extendExpiry(inviteId, new Date(dto.newExpiresAt), staff.id);
  }

  @Post("invites/:inviteId/regenerate")
  async regenerateToken(
    @Param("inviteId", UUIDValidationPipe) inviteId: string,
    @CurrentUser() staff: any,
  ) {
    return this.inviteService.regenerateToken(inviteId, staff.id);
  }

  @Post("invites/bulk-revoke")
  @HttpCode(HttpStatus.OK)
  async bulkRevoke(@Body() dto: BulkInviteActionDto, @CurrentUser() staff: any) {
    return this.inviteService.bulkRevoke(dto.inviteIds, staff.id);
  }

  @Post("invites/bulk-resend")
  @HttpCode(HttpStatus.OK)
  async bulkResend(@Body() dto: BulkInviteActionDto, @CurrentUser() staff: any) {
    return this.inviteService.bulkResend(dto.inviteIds, staff.id);
  }

  @Post("sessions/compare")
  @HttpCode(HttpStatus.OK)
  async compareSessions(@Body("sessionIds") sessionIds: string[]) {
    return this.adminService.compareSessionScores(sessionIds);
  }

  @Get("drives/:driveId/export")
  async exportDrive(@Param("driveId", UUIDValidationPipe) driveId: string) {
    return this.adminService.bulkExportByDrive(driveId);
  }
}
