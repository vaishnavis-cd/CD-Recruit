import { Module } from "@nestjs/common";
import { AadhaarOcrService } from "./aadhaar-ocr.service";
import { NameMatchService } from "../../common/services/name-match.service";

@Module({
  providers: [AadhaarOcrService, NameMatchService],
  exports: [AadhaarOcrService, NameMatchService],
})
export class OcrModule {}
