import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { RoleTemplateService } from "./role-template.service";
import { RoleTemplateController } from "./role-template.controller";

@Module({
  imports: [PrismaModule],
  controllers: [RoleTemplateController],
  providers: [RoleTemplateService],
  exports: [RoleTemplateService],
})
export class RoleTemplateModule {}
