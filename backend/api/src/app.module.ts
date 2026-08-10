import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";
import { BullModule } from "@nestjs/bullmq";

import appConfig from "./config/app.config";
import { configuration, AppConfig } from "./config/configuration";
import { PrismaModule } from "./prisma/prisma.module";
import { HealthModule } from "./health/health.module";
import { AuthModule } from "./auth/auth.module";
import { AdminModule } from "./admin/admin.module";
import { DriveModule } from "./drive/drive.module";
import { QuestionModule } from "./question/question.module";
import { SettingsModule } from "./settings/settings.module";
import { MinioModule } from "./integrations/minio/minio.module";
import { CandidateModule } from "./candidate/candidate.module";
import { SessionModule } from "./session/session.module";
import { QueueModule } from "./queue/queue.module";
import { CodingModule } from "./coding/coding.module";
import { SqlModule } from "./sql/sql.module";
import { ProctoringModule } from "./proctoring/proctoring.module";
import { AiEvaluationModule } from "./integrations/ai/ai-evaluation.module";
import { SimulationModule } from "./simulation/simulation.module";
import { AiPromptingModule } from "./ai-prompting/ai-prompting.module";
import { McqModule } from "./mcq/mcq.module";


import { RoleTemplateModule } from "./role-template/role-template.module";


const infraMode = process.env.INFRA_MODE ?? "local";

@Module({
  imports: [
    // ── Infrastructure ────────────────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, configuration],
      envFilePath: [
        require("path").resolve(process.cwd(), ".env"),
        require("path").resolve(process.cwd(), "../../.env"),
        "../.env",
        "../../.env",
        ".env",
      ],
    }),

    PrismaModule,

    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (_config: ConfigService<AppConfig, true>) => ({
        throttlers: [{ ttl: 60_000, limit: 10 }],
      }),
    }),

    ...(infraMode === "full"
      ? [
          BullModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (config: ConfigService<AppConfig, true>) => {
              const redisUrl = config.get("redisUrl", { infer: true });
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
        ]
      : []),

    // ── Feature modules ──────────────────────────────────────────────────
    HealthModule,
    AuthModule,
    AdminModule,
    DriveModule,
    QuestionModule,
    SettingsModule,
    MinioModule,
    CandidateModule,
    SessionModule,
    QueueModule,
    CodingModule,
    SqlModule,
    ProctoringModule,
    AiEvaluationModule,
    SimulationModule,
    AiPromptingModule,
    McqModule,
    RoleTemplateModule,

  ],
})
export class AppModule {}
