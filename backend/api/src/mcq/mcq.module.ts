import { Module } from "@nestjs/common";
import { McqController } from "./mcq.controller";
import { McqService } from "./mcq.service";
import { PrismaModule } from "../prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [McqController],
  providers: [McqService],
  exports: [McqService],
})
export class McqModule {}
