import { Module } from "@nestjs/common";
import { DriveController } from "./drive.controller";
import { SampleCsvController } from "./sample-csv.controller";
import { DriveService } from "./drive.service";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  controllers: [DriveController, SampleCsvController],
  providers: [DriveService],
  exports: [DriveService],
})
export class DriveModule {}
