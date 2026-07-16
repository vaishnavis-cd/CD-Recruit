import { Module } from "@nestjs/common";
import { DriveController } from "./drive.controller";
import { DriveService } from "./drive.service";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  controllers: [DriveController],
  providers: [DriveService],
  exports: [DriveService],
})
export class DriveModule {}
