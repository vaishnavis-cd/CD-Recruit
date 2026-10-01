import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { PlatformAuditService } from "./platform-audit.service";
import { PlatformAuditController } from "./platform-audit.controller";
import { PlatformAuthModule } from "../auth/platform-auth.module";

@Module({
  imports: [PrismaModule, PlatformAuthModule],
  controllers: [PlatformAuditController],
  providers: [PlatformAuditService],
  exports: [PlatformAuditService],
})
export class PlatformAuditModule {}
