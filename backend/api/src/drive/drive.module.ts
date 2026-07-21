import { Module } from "@nestjs/common";
import { DriveController } from "./drive.controller";
import { SampleCsvController } from "./sample-csv.controller";
import { DriveService } from "./drive.service";
import { DriveRepository } from "./drive.repository";
import { CsvIngestionService } from "./csv-ingestion.service";
import { CandidateIngestionService } from "./candidate-ingestion.service";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  controllers: [DriveController, SampleCsvController],
  providers: [
    DriveService,
    DriveRepository,
    CsvIngestionService,
    CandidateIngestionService,
  ],
  exports: [
    DriveService,
    DriveRepository,
    CsvIngestionService,
    CandidateIngestionService,
  ],
})
export class DriveModule {}
