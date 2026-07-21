import { Module } from "@nestjs/common";
import { CandidateService } from "./candidate.service";
import { CandidateRepository } from "./candidate.repository";

@Module({
  providers: [CandidateService, CandidateRepository],
  exports: [CandidateService, CandidateRepository],
})
export class CandidateModule {}
