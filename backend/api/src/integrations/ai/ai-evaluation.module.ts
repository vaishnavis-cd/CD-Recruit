import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AiEvaluationService } from "./ai-evaluation.service";

@Module({
  imports: [ConfigModule],
  providers: [AiEvaluationService],
  exports: [AiEvaluationService],
})
export class AiEvaluationModule {}
