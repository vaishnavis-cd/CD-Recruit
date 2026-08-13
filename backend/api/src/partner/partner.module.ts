import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { RoleTemplateModule } from "../role-template/role-template.module";
import { DriveModule } from "../drive/drive.module";
import { PartnerCandidatesController } from "./partner-candidates.controller";
import { PartnerRequisitionsController } from "./partner-requisitions.controller";
import { PartnerAdminController } from "./partner-admin.controller";
import { PartnerCandidatesService } from "./partner-candidates.service";
import { PartnerAdminService } from "./partner-admin.service";
import { PartnerApiKeyGuard } from "../common/guards/partner-api-key.guard";
import { ConfigModule } from "@nestjs/config";

@Module({
  imports: [PrismaModule, RoleTemplateModule, DriveModule, ConfigModule],
  controllers: [
    PartnerCandidatesController,
    PartnerRequisitionsController,
    PartnerAdminController,
  ],
  providers: [PartnerCandidatesService, PartnerAdminService, PartnerApiKeyGuard],
  exports: [PartnerCandidatesService, PartnerAdminService, PartnerApiKeyGuard],
})
export class PartnerModule {}
