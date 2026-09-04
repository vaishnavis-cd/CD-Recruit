import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from "@nestjs/common";
import type { Response } from "express";
import { FileInterceptor } from "@nestjs/platform-express";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
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
  BulkVerifyIdentityDto,
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

  @Get("results")
  async listResults(@Query() query: ListSessionsQueryDto) {
    return this.adminService.listSessions(query);
  }

  @Get("results/export")
  async exportResults(
    @Query() query: ListSessionsQueryDto,
    @Res() res: Response,
  ) {
    const csv = await this.adminService.exportResultsCsv(query);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="candidate_results_export_${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    return res.send(csv);
  }

  @Get("sessions/export")
  async exportSessions(
    @Query() query: ListSessionsQueryDto,
    @Res() res: Response,
  ) {
    const csv = await this.adminService.exportResultsCsv(query);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="candidate_sessions_export_${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    return res.send(csv);
  }

  @Get("sessions/:sessionId")
  async getSessionDetail(
    @Param("sessionId") sessionId: string,
  ) {
    return this.adminService.getSessionDetail(sessionId);
  }

  @Post("sessions/:sessionId/decision")
  @HttpCode(HttpStatus.CREATED)
  async recordDecision(
    @Param("sessionId") sessionId: string,
    @Body() dto: RecordDecisionDto,
    @CurrentUser() staff: any,
  ) {
    return this.adminService.recordDecision(sessionId, dto.decision, staff.id, dto.note);
  }

  @Get("sessions/:sessionId/events")
  async getSessionEvents(
    @Param("sessionId", ParseUUIDPipe) sessionId: string,
  ) {
    return this.adminService.getSessionEvents(sessionId);
  }

  @Get("sessions/:sessionId/integrity-flags")
  async getIntegrityFlags(
    @Param("sessionId", ParseUUIDPipe) sessionId: string,
  ) {
    return this.adminService.getIntegrityFlags(sessionId);
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
    @Param("inviteId", ParseUUIDPipe) inviteId: string,
    @CurrentUser() staff: any,
  ) {
    return this.inviteService.revokeInvite(inviteId, staff.id);
  }

  @Post("invites/:inviteId/extend")
  async extendExpiry(
    @Param("inviteId", ParseUUIDPipe) inviteId: string,
    @Body() dto: ExtendExpiryDto,
    @CurrentUser() staff: any,
  ) {
    return this.inviteService.extendExpiry(inviteId, new Date(dto.newExpiresAt), staff.id);
  }

  @Post("invites/:inviteId/regenerate")
  async regenerateToken(
    @Param("inviteId", ParseUUIDPipe) inviteId: string,
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

  @Delete("invites/:inviteId")
  @HttpCode(HttpStatus.OK)
  async deleteInvite(
    @Param("inviteId", ParseUUIDPipe) inviteId: string,
    @CurrentUser() staff: any,
  ) {
    return this.inviteService.deleteInvite(inviteId, staff.id);
  }

  @Post("invites/bulk-delete")
  @HttpCode(HttpStatus.OK)
  async bulkDelete(@Body() dto: BulkInviteActionDto, @CurrentUser() staff: any) {
    return this.inviteService.bulkDelete(dto.inviteIds, staff.id);
  }

  @Post("invites/:inviteId/id-proof")
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor("file"))
  async uploadIdProof(
    @Param("inviteId", ParseUUIDPipe) inviteId: string,
    @UploadedFile() file: any,
  ) {
    if (!file) {
      throw new BadRequestException("No image file uploaded in form field 'file'");
    }
    return this.inviteService.uploadIdProof(inviteId, file);
  }

  @Post("candidates/verify-identity/bulk")
  @HttpCode(HttpStatus.OK)
  async bulkVerifyCandidateIdentity(
    @Body() dto: BulkVerifyIdentityDto,
    @CurrentUser() staff: any,
  ) {
    return this.adminService.bulkVerifyCandidateIdentity(dto.candidateIds, staff.id);
  }

  @Post("candidates/:candidateId/verify-identity")
  @HttpCode(HttpStatus.OK)
  async verifyCandidateIdentity(
    @Param("candidateId", ParseUUIDPipe) candidateId: string,
    @CurrentUser() staff: any,
  ) {
    return this.adminService.verifyCandidateIdentity(candidateId, staff.id);
  }

  @Post("sessions/compare")
  @HttpCode(HttpStatus.OK)
  async compareSessions(@Body("sessionIds") sessionIds: string[]) {
    return this.adminService.compareSessionScores(sessionIds);
  }

  @Get("drives/:driveId/export")
  async exportDrive(@Param("driveId", ParseUUIDPipe) driveId: string) {
    return this.adminService.bulkExportByDrive(driveId);
  }
}
