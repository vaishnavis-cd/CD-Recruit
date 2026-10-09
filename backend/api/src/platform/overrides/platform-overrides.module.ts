import { Module, forwardRef } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { PlatformAuditModule } from "../audit/platform-audit.module";
import { PlatformAuthModule } from "../auth/platform-auth.module";
import { PlatformOverridesController } from "./platform-overrides.controller";
import { PlatformOverridesService } from "./platform-overrides.service";

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => PlatformAuditModule),
    forwardRef(() => PlatformAuthModule),
  ],
  controllers: [PlatformOverridesController],
  providers: [PlatformOverridesService],
  exports: [PlatformOverridesService],
})
export class PlatformOverridesModule {}
