import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  UseGuards,
  Req,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { PlatformJwtAuthGuard } from "../../auth/guards/platform-jwt-auth.guard";
import { PlatformRolesGuard } from "../../auth/guards/platform-roles.guard";
import { PlatformRoles } from "../../auth/decorators/platform-roles.decorator";
import { PlatformStaffRole } from "@cd-recruit/shared-types";
import { PaymentService } from "../../../billing/payment/payment.service";
import {
  ListPaymentsQueryDto,
  ManualInvoicePaymentDto,
} from "../dto/payment.dto";

@ApiTags("Platform Payments & Invoices")
@ApiBearerAuth()
@Controller("platform/billing/payments")
@UseGuards(PlatformJwtAuthGuard, PlatformRolesGuard)
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  /**
   * API-H2-16: Paginated payments and invoices list with webhook audit status.
   */
  @Get()
  @PlatformRoles(PlatformStaffRole.SUPPORT, PlatformStaffRole.FINANCE, PlatformStaffRole.OWNER)
  @ApiOperation({ summary: "List paginated payments and invoices (API-H2-16)" })
  async listPayments(@Query() query: ListPaymentsQueryDto) {
    return await this.paymentService.listPayments(query);
  }

  /**
   * API-H2-17: Record offline Enterprise PO payment and mint CONTRACT pool.
   */
  @Post("manual-invoice")
  @PlatformRoles(PlatformStaffRole.FINANCE, PlatformStaffRole.OWNER)
  @ApiOperation({ summary: "Record offline Enterprise PO payment (API-H2-17)" })
  async recordManualInvoice(
    @Req() req: any,
    @Body() dto: ManualInvoicePaymentDto,
  ) {
    const actor = req.user;
    return await this.paymentService.recordManualInvoicePayment(actor, dto);
  }
}
