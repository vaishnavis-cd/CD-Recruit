import { Module, forwardRef } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { PlatformAuditService } from "./platform-audit.service";
import { PlatformAuditExplorerService } from "./platform-audit-explorer.service";
import { PlatformAuditController } from "./platform-audit.controller";
import { PlatformAuthModule } from "../auth/platform-auth.module";

@Module({
  imports: [PrismaModule, forwardRef(() => PlatformAuthModule)],
  controllers: [PlatformAuditController],
  providers: [PlatformAuditService, PlatformAuditExplorerService],
  exports: [PlatformAuditService, PlatformAuditExplorerService],
})
export class PlatformAuditModule {}
