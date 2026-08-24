import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { FaceVerifyOnnxService } from "./face-verify-onnx.service";

@Module({
  imports: [ConfigModule],
  providers: [FaceVerifyOnnxService],
  exports: [FaceVerifyOnnxService],
})
export class FaceVerifyOnnxModule {}
