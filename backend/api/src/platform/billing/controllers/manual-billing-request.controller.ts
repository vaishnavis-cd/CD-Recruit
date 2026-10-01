import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { PlatformJwtAuthGuard } from "../../auth/guards/platform-jwt-auth.guard";
import { PlatformRolesGuard } from "../../auth/guards/platform-roles.guard";
import { PlatformRoles } from "../../auth/decorators/platform-roles.decorator";
import { PlatformStaffRole } from "@cd-recruit/shared-types";
import { ManualBillingRequestService } from "../../../billing/manual-request/manual-billing-request.service";
import {
  CreateManualRequestDto,
  RejectManualRequestDto,
  ListManualRequestsQueryDto,
  ManualRequestIdParamDto,
} from "../dto/manual-request.dto";

@ApiTags("Platform Manual Requests")
@ApiBearerAuth()
@Controller("platform/billing/requests")
@UseGuards(PlatformJwtAuthGuard, PlatformRolesGuard)
export class ManualBillingRequestController {
  constructor(private readonly manualBillingRequestService: ManualBillingRequestService) {}

  /**
   * API-H2-08: List maker-checker manual requests across tabs (My, Awaiting, All).
   */
  @Get()
  @PlatformRoles(PlatformStaffRole.SUPPORT, PlatformStaffRole.FINANCE, PlatformStaffRole.OWNER)
  @ApiOperation({ summary: "List maker-checker requests across tabs (API-H2-08)" })
  async listRequests(@Req() req: any, @Query() query: ListManualRequestsQueryDto) {
    const actor = req.user;
    return await this.manualBillingRequestService.listRequests(actor, query);
  }

  /**
   * API-H2-09: Create a new manual billing request (GRANT, ADJUST, REFUND, EXTEND).
   */
  @Post()
  @PlatformRoles(PlatformStaffRole.SUPPORT, PlatformStaffRole.FINANCE, PlatformStaffRole.OWNER)
  @ApiOperation({ summary: "Create a manual billing request (API-H2-09)" })
  async createRequest(@Req() req: any, @Body() dto: CreateManualRequestDto) {
    const actor = req.user;
    return await this.manualBillingRequestService.createRequest(actor, dto);
  }

  /**
   * API-H2-10: Approve and execute request through LedgerService (approver != requester).
   */
  @Post(":id/approve")
  @PlatformRoles(PlatformStaffRole.FINANCE, PlatformStaffRole.OWNER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Approve and execute manual billing request (API-H2-10)" })
  async approveRequest(@Req() req: any, @Param() params: ManualRequestIdParamDto) {
    const actor = req.user;
    return await this.manualBillingRequestService.approveRequest(actor, params.id);
  }

  /**
   * API-H2-11: Reject request with mandatory reason note.
   */
  @Post(":id/reject")
  @PlatformRoles(PlatformStaffRole.FINANCE, PlatformStaffRole.OWNER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Reject manual billing request with reason (API-H2-11)" })
  async rejectRequest(
    @Req() req: any,
    @Param() params: ManualRequestIdParamDto,
    @Body() dto: RejectManualRequestDto,
  ) {
    const actor = req.user;
    return await this.manualBillingRequestService.rejectRequest(actor, params.id, dto);
  }

  /**
   * API-H2-12: Cancel own pending request before decision.
   */
  @Post(":id/cancel")
  @PlatformRoles(PlatformStaffRole.SUPPORT, PlatformStaffRole.FINANCE, PlatformStaffRole.OWNER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Cancel own pending request (API-H2-12)" })
  async cancelRequest(@Req() req: any, @Param() params: ManualRequestIdParamDto) {
    const actor = req.user;
    return await this.manualBillingRequestService.cancelRequest(actor, params.id);
  }

  /**
   * API-H2-13: Safely retry execution of approved request using deterministic idempotency key.
   */
  @Post(":id/retry")
  @PlatformRoles(PlatformStaffRole.FINANCE, PlatformStaffRole.OWNER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Retry failed execution of approved request (API-H2-13)" })
  async retryExecution(@Req() req: any, @Param() params: ManualRequestIdParamDto) {
    const actor = req.user;
    return await this.manualBillingRequestService.retryExecution(actor, params.id);
  }
}
