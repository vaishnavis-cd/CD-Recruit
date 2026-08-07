import { Module } from "@nestjs/common";
import { CandidateController } from "./candidate.controller";
import { CandidateService } from "./candidate.service";
import { CandidateRepository } from "./candidate.repository";

@Module({
  controllers: [CandidateController],
  providers: [CandidateService, CandidateRepository],
  exports: [CandidateService, CandidateRepository],
})
export class CandidateModule {}
