import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import appConfig from "./config/app.config";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { AdminModule } from "./admin/admin.module";
import { DriveModule } from "./drive/drive.module";
import { QuestionModule } from "./question/question.module";
import { SettingsModule } from "./settings/settings.module";
import { HealthModule } from "./health/health.module";
import { MinioModule } from "./integrations/minio/minio.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
    }),
    PrismaModule,
    AuthModule,
    AdminModule,
    DriveModule,
    QuestionModule,
    SettingsModule,
    HealthModule,
    MinioModule,
  ],
})
export class AppModule {}
