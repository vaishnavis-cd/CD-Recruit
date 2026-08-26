import { Module } from "@nestjs/common";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { InviteService } from "./invite.service";
import { DashboardService } from "./dashboard.service";
import { AuthModule } from "../auth/auth.module";
import { SessionModule } from "../session/session.module";
import { FaceVerifyOnnxModule } from "../integrations/face-verify-onnx/face-verify-onnx.module";
import { OcrModule } from "../integrations/ocr/ocr.module";

@Module({
  imports: [AuthModule, SessionModule, FaceVerifyOnnxModule, OcrModule],
  controllers: [AdminController],
  providers: [AdminService, InviteService, DashboardService],
  exports: [AdminService, InviteService, DashboardService],
})
export class AdminModule {}
