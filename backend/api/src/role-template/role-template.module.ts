import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { RoleTemplateService } from "./role-template.service";

@Module({
  imports: [PrismaModule],
  providers: [RoleTemplateService],
  exports: [RoleTemplateService],
})
export class RoleTemplateModule {}
