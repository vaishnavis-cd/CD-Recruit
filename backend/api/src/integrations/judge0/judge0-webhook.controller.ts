import {
  Controller,
  All,
  Query,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Logger,
} from "@nestjs/common";
import { Judge0WebhookGuard } from "./judge0-webhook.guard";
import { JUDGE0_ACCUMULATE_AND_LOCK_LUA } from "./judge0-webhook.lua";
import { RedisService } from "../../common/redis/redis.service";
import { QueueProviderPort } from "../../queue/queue-provider.port";

@Controller("webhooks/judge0")
export class Judge0WebhookController {
  private readonly logger = new Logger(Judge0WebhookController.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly queueProvider: QueueProviderPort,
  ) {}

  @All()
  @HttpCode(HttpStatus.OK)
  @UseGuards(Judge0WebhookGuard)
  async handleCallback(
    @Query("executionId") executionId: string,
    @Query("totalTests") totalTestsStr: string,
    @Body() body: any,
  ) {
    const totalTests = parseInt(totalTestsStr, 10);
    const token = body?.token;

    if (!executionId || !token || isNaN(totalTests)) {
      this.logger.warn(`Malformed Judge0 webhook received: executionId=${executionId}, token=${token}`);
      return { ok: true };
    }

    const resultsKey = `execution:${executionId}:results`;
    const enqueuedKey = `execution:${executionId}:enqueued`;

    const shouldEnqueue = await this.redisService.eval(
      JUDGE0_ACCUMULATE_AND_LOCK_LUA,
      2,
      resultsKey,
      enqueuedKey,
      token,
      JSON.stringify(body),
      totalTests,
      600, // 10 minutes TTL
    );

    if (shouldEnqueue === 1) {
      this.logger.log(`All ${totalTests} test cases received for execution ${executionId}. Enqueuing outbound result.`);
      const rawResults = await this.redisService.hgetall(resultsKey);
      const judge0Results = Object.values(rawResults).map((r) => {
        try {
          return JSON.parse(r);
        } catch {
          return r;
        }
      });

      await this.queueProvider.enqueue(
        "execution-outbound",
        "save-result",
        {
          executionId,
          judge0Results,
        },
      );
    }

    return { ok: true };
  }
}
