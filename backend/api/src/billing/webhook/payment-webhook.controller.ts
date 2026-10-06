import {
  Controller,
  Post,
  Param,
  Headers,
  Req,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  RawBodyRequest,
} from "@nestjs/common";
import { Request } from "express";
import { PaymentWebhookService } from "./payment-webhook.service";
import { ReplayWebhookDto } from "./payment-webhook.types";
import { PlatformJwtAuthGuard } from "../../platform/auth/guards/platform-jwt-auth.guard";
import { PlatformRolesGuard } from "../../platform/auth/guards/platform-roles.guard";
import { PlatformRoles } from "../../platform/auth/decorators/platform-roles.decorator";
import { PlatformStaffRole } from "@cd-recruit/shared-types";

/**
 * Public Webhook Ingress Controller (API-H2-18).
 * Public internet endpoint for payment gateway webhooks.
 * Authentication is performed purely via cryptographic HMAC signature verification.
 */
@Controller("billing/webhooks")
export class PaymentWebhookController {
  constructor(private readonly paymentWebhookService: PaymentWebhookService) {}

  /**
   * POST /api/v1/billing/webhooks/:provider
   * Ingests, authenticates, persists, and queues external payment provider webhook events.
   */
  @Post(":provider")
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Param("provider") provider: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Req() req: RawBodyRequest<Request>,
  ) {
    const rawBody =
      req.rawBody ||
      (Buffer.isBuffer(req.body)
        ? req.body
        : typeof req.body === "string"
        ? Buffer.from(req.body, "utf8")
        : Buffer.from(JSON.stringify(req.body || {}), "utf8"));

    return await this.paymentWebhookService.ingestWebhookEvent(provider, headers, rawBody);
  }
}

/**
 * Administrative Webhook Replay Controller (API-H2-19).
 * Protected endpoint for Platform Staff (FINANCE, OWNER only).
 */
@Controller("platform/billing/payments")
export class PaymentWebhookReplayController {
  constructor(private readonly paymentWebhookService: PaymentWebhookService) {}

  /**
   * POST /api/v1/platform/billing/payments/replay-webhook
   * Replays a failed or stuck webhook event from the inbox table.
   */
  @Post("replay-webhook")
  @UseGuards(PlatformJwtAuthGuard, PlatformRolesGuard)
  @PlatformRoles(PlatformStaffRole.FINANCE, PlatformStaffRole.OWNER)
  @HttpCode(HttpStatus.OK)
  async replayWebhook(@Req() req: any, @Body() dto: ReplayWebhookDto) {
    const actor = req.user;
    return await this.paymentWebhookService.replayWebhookEvent(actor, dto.eventId);
  }
}
