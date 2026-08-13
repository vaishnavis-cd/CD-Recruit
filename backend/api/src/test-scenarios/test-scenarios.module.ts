import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AiEvaluationModule } from "../integrations/ai/ai-evaluation.module";
import { TestScenariosController } from "./test-scenarios.controller";
import { TestScenariosService } from "./test-scenarios.service";

@Module({
  imports: [PrismaModule, AiEvaluationModule],
  controllers: [TestScenariosController],
  providers: [TestScenariosService],
  exports: [TestScenariosService],
})
export class TestScenariosModule {}
