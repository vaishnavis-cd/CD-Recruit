import { Module, Global } from "@nestjs/common";
import { AssessmentEngineRegistry } from "./assessment-engine-registry.service";

@Global()
@Module({
  providers: [AssessmentEngineRegistry],
  exports: [AssessmentEngineRegistry],
})
export class AssessmentModule {}
