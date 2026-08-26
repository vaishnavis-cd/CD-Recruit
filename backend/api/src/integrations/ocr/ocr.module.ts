import { Module } from "@nestjs/common";
import { AadhaarOcrService } from "./aadhaar-ocr.service";
import { DocumentOcrService } from "./document-ocr.service";
import { OcrEngineService } from "./ocr-engine.service";
import { DocumentClassifierService } from "./document-classifier.service";
import { NameMatchService } from "../../common/services/name-match.service";

@Module({
  providers: [
    OcrEngineService,
    DocumentClassifierService,
    DocumentOcrService,
    AadhaarOcrService,
    NameMatchService,
  ],
  exports: [
    OcrEngineService,
    DocumentClassifierService,
    DocumentOcrService,
    AadhaarOcrService,
    NameMatchService,
  ],
})
export class OcrModule {}
