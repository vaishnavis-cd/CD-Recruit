import { Module } from "@nestjs/common";
import { ProctoringController } from "./proctoring.controller";
import { ProctoringService } from "./proctoring.service";
import { PrismaModule } from "../prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [ProctoringController],
  providers: [ProctoringService],
  exports: [ProctoringService],
})
export class ProctoringModule {}
