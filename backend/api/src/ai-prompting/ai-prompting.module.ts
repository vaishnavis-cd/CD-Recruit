import { Module } from "@nestjs/common";
import { AiPromptingController } from "./ai-prompting.controller";
import { AiPromptingService } from "./ai-prompting.service";
import { PrismaModule } from "../prisma/prisma.module";
import { AiEvaluationModule } from "../integrations/ai/ai-evaluation.module";

@Module({
  imports: [PrismaModule, AiEvaluationModule],
  controllers: [AiPromptingController],
  providers: [AiPromptingService],
  exports: [AiPromptingService],
})
export class AiPromptingModule {}
