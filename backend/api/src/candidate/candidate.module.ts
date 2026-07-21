import { Module } from "@nestjs/common";
import { CandidateService } from "./candidate.service";
import { CandidateController } from "./candidate.controller";

/**
 * CandidateModule — service + consent controller.
 *
 * Candidates are created as a side-effect of session start (not through their
 * own API surface). The consent endpoint is the only externally visible route.
 *
 * CandidateService is exported so SessionModule can inject it.
 */
@Module({
  controllers: [CandidateController],
  providers: [CandidateService],
  exports: [CandidateService],
})
export class CandidateModule {}
