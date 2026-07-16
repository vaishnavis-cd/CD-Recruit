import { Module } from "@nestjs/common";
import { CandidateService } from "./candidate.service";

/**
 * CandidateModule — pure service module, no controller.
 *
 * Candidates are created as a side-effect of session start (not through their
 * own API surface), so there is intentionally no CandidateController.
 *
 * CandidateService is exported so SessionModule can inject it.
 */
@Module({
  providers: [CandidateService],
  exports: [CandidateService],
})
export class CandidateModule {}
