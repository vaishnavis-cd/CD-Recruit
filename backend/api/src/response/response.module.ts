import { Module } from "@nestjs/common";
import { ResponseController } from "./response.controller";
import { ResponseService } from "./response.service";
import { PrismaModule } from "@app/prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [ResponseController],
  providers: [ResponseService],
  exports: [ResponseService],
})
export class ResponseModule {}
