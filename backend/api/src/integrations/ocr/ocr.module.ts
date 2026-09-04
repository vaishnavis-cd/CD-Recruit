import { Module } from "@nestjs/common";
import { IdOcrService } from "./id-ocr.service";
import { NameMatchService } from "../../common/services/name-match.service";

@Module({
  providers: [IdOcrService, NameMatchService],
  exports: [IdOcrService, NameMatchService],
})
export class OcrModule {}
