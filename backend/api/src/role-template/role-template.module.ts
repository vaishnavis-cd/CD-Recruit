import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { RoleTemplateService } from "./role-template.service";
import { RoleTemplateController } from "./role-template.controller";
import { DepartmentModuleConfigService } from "./department-module-config.service";
import { AllocationEngineService } from "./allocation-engine.service";

@Module({
  imports: [PrismaModule],
  controllers: [RoleTemplateController],
  providers: [
    RoleTemplateService,
    DepartmentModuleConfigService,
    AllocationEngineService,
  ],
  exports: [
    RoleTemplateService,
    DepartmentModuleConfigService,
    AllocationEngineService,
  ],
})
export class RoleTemplateModule {}
