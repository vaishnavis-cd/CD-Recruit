import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { RoleTemplateModule } from "../role-template/role-template.module";
import { DriveModule } from "../drive/drive.module";
import { PartnerCandidatesController } from "./partner-candidates.controller";
import { PartnerCandidatesService } from "./partner-candidates.service";
import { PartnerApiKeyGuard } from "../common/guards/partner-api-key.guard";
import { ConfigModule } from "@nestjs/config";

@Module({
  imports: [PrismaModule, RoleTemplateModule, DriveModule, ConfigModule],
  controllers: [PartnerCandidatesController],
  providers: [PartnerCandidatesService, PartnerApiKeyGuard],
  exports: [PartnerCandidatesService, PartnerApiKeyGuard],
})
export class PartnerModule {}
