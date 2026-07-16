import { Module } from "@nestjs/common";
import { CodingController } from "./coding.controller";
import { CodingService } from "./coding.service";
import { PrismaModule } from "../prisma/prisma.module";
import { Judge0Module } from "../integrations/judge0/judge0.module";

@Module({
  imports: [PrismaModule, Judge0Module],
  controllers: [CodingController],
  providers: [CodingService],
  exports: [CodingService],
})
export class CodingModule {}
