import { Module } from "@nestjs/common";
import { McqController } from "./mcq.controller";
import { McqService } from "./mcq.service";
import { PrismaModule } from "../prisma/prisma.module";
import { SessionModule } from "../session/session.module";

@Module({
  imports: [PrismaModule, SessionModule],
  controllers: [McqController],
  providers: [McqService],
  exports: [McqService],
})
export class McqModule {}
