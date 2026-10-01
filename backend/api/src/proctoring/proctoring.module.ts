import { Module } from "@nestjs/common";
import { ProctoringController } from "./proctoring.controller";
import { ProctoringService } from "./proctoring.service";
import { PrismaModule } from "../prisma/prisma.module";
import { SessionModule } from "../session/session.module";

@Module({
  imports: [PrismaModule, SessionModule],
  controllers: [ProctoringController],
  providers: [ProctoringService],
  exports: [ProctoringService],
})
export class ProctoringModule {}
