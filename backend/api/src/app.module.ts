import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";
import { BullModule } from "@nestjs/bullmq";

import { configuration, AppConfig } from "@app/config/configuration";
import { PrismaModule } from "@app/prisma/prisma.module";
import { HealthModule } from "@app/health/health.module";
import { AuthModule } from "@app/auth/auth.module";
import { CandidateModule } from "@app/candidate/candidate.module";
import { SessionModule } from "@app/session/session.module";
import { QueueModule } from "@app/queue/queue.module";

/**
 * AppModule — root module.
 *
 * Import order is intentional:
 *   1. ConfigModule   — must be first; everything else reads from it
 *   2. PrismaModule   — @Global(), provides PrismaService to all modules
 *   3. ThrottlerModule — rate-limiting; applied per-route via guards
 *   4. BullModule     — Redis connection; queues registered in QueueModule
 *   5. Feature modules in dependency order
 *
 * Not imported here yet (added in their own phases):
 *   QuestionModule, ResponseModule, CodingModule, ProctoringModule,
 *   AdminModule, SimulationModule, WebsocketModule
 */
@Module({
  imports: [
    // ── Infrastructure ────────────────────────────────────────────────────

    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      // .env file location: backend/.env (one level up from backend/api)
      envFilePath: ["../.env", "../../.env"],
    }),

    PrismaModule,

    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (_config: ConfigService<AppConfig, true>) => ({
        // Default: 10 requests per 60 seconds per IP
        // Routes requiring tighter limits use InviteTokenRateLimitGuard
        throttlers: [{ ttl: 60_000, limit: 10 }],
      }),
    }),

    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const redisUrl = config.get("redisUrl", { infer: true });
        // Parse redis://host:port into the connection object BullMQ expects
        const url = new URL(redisUrl);
        return {
          connection: {
            host: url.hostname,
            port: parseInt(url.port || "6379", 10),
            password: url.password || undefined,
          },
        };
      },
    }),

    // ── Feature modules ──────────────────────────────────────────────────

    HealthModule,
    AuthModule,
    CandidateModule,
    SessionModule,
    QueueModule,
  ],
})
export class AppModule {}
