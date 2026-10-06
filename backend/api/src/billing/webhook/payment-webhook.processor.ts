import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { PaymentWebhookService } from "./payment-webhook.service";

@Processor("payment-webhook")
@Injectable()
export class PaymentWebhookProcessor extends WorkerHost {
  private readonly logger = new Logger(PaymentWebhookProcessor.name);

  constructor(private readonly paymentWebhookService: PaymentWebhookService) {
    super();
  }

  async process(job: Job<{ inboxId: string; provider?: string; eventId?: string }>): Promise<void> {
    const { inboxId } = job.data;
    this.logger.log(`[PaymentWebhookProcessor] Processing webhook job for inbox ID: ${inboxId}`);

    if (!inboxId) {
      this.logger.warn("[PaymentWebhookProcessor] Job received without inboxId; skipping");
      return;
    }

    await this.paymentWebhookService.processWebhookEventJob(inboxId);
  }
}
