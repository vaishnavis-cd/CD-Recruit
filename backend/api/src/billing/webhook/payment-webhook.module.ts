import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "../../prisma/prisma.module";
import { PaymentModule } from "../payment/payment.module";
import { CreditPoolModule } from "../pool/credit-pool.module";
import { PaymentWebhookService } from "./payment-webhook.service";
import { PaymentWebhookProcessor } from "./payment-webhook.processor";
import {
  PaymentWebhookController,
  PaymentWebhookReplayController,
} from "./payment-webhook.controller";

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    PaymentModule,
    CreditPoolModule,
  ],
  controllers: [
    PaymentWebhookController,
    PaymentWebhookReplayController,
  ],
  providers: [
    PaymentWebhookService,
    PaymentWebhookProcessor,
  ],
  exports: [PaymentWebhookService],
})
export class PaymentWebhookModule {}
