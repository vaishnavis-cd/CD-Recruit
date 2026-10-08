import { Module } from "@nestjs/common";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { InviteService } from "./invite.service";
import { DashboardService } from "./dashboard.service";
import { AuthModule } from "../auth/auth.module";
import { SessionModule } from "../session/session.module";
import { FaceVerifyOnnxModule } from "../integrations/face-verify-onnx/face-verify-onnx.module";
import { OcrModule } from "../integrations/ocr/ocr.module";
import { CreditPoolModule } from "../billing/pool/credit-pool.module";
import { LedgerModule } from "../billing/ledger/ledger.module";
import { PrismaModule } from "../prisma/prisma.module";

@Module({
  imports: [
    AuthModule,
    SessionModule,
    FaceVerifyOnnxModule,
    OcrModule,
    CreditPoolModule,
    LedgerModule,
    PrismaModule,
  ],
  controllers: [AdminController],
  providers: [AdminService, InviteService, DashboardService],
  exports: [AdminService, InviteService, DashboardService],
})
export class AdminModule {}
