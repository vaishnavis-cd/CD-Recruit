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
  async getDashboardStats() {
    return this.dashboardService.getDashboardStats();
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
    return this.adminService.recordDecision(sessionId, dto.decision, staff.id);
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
}
