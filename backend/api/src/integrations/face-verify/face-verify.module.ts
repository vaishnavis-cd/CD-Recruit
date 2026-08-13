import { Module, Global } from "@nestjs/common";
import { FaceVerifyClient } from "./face-verify.client";

@Global()
@Module({
  providers: [FaceVerifyClient],
  exports: [FaceVerifyClient],
})
export class FaceVerifyModule {}
