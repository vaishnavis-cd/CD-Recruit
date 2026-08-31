import { Module } from "@nestjs/common";
import { Judge0Client } from "./judge0.client";
import { Judge0Service } from "./judge0.service";
import { Judge0WebhookController } from "./judge0-webhook.controller";
import { Judge0WebhookGuard } from "./judge0-webhook.guard";

@Module({
  controllers: [Judge0WebhookController],
  providers: [Judge0Client, Judge0Service, Judge0WebhookGuard],
  exports: [Judge0Service, Judge0Client],
})
export class Judge0Module {}
