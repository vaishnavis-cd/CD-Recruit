import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaService } from "./common/prisma.service";
import { SimulationController } from "./simulation/simulation.controller";
import { SimulationService } from "./simulation/simulation.service";
import { EventGenerationService } from "./simulation/event-generation.service";
import { CompetencyEngine } from "./simulation/competency-engine";
import { SessionLogService } from "./simulation/session-log.service";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env", "../../.env"],
    }),
  ],
  controllers: [SimulationController],
  providers: [
    PrismaService,
    SimulationService,
    SessionLogService,
    EventGenerationService,
    CompetencyEngine,
  ],
  exports: [PrismaService],
})
export class AppModule {}
