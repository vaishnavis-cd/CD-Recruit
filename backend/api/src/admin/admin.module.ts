import { Module } from "@nestjs/common";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { InviteService } from "./invite.service";
import { DashboardService } from "./dashboard.service";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  controllers: [AdminController],
  providers: [AdminService, InviteService, DashboardService],
  exports: [AdminService, InviteService, DashboardService],
})
export class AdminModule {}
