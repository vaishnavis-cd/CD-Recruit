import { Injectable, Logger } from "@nestjs/common";
import { DocumentOcrService } from "./document-ocr.service";
import { AadhaarParser } from "./parsers/aadhaar.parser";

export interface AadhaarOcrResult {
  name: string | null;
  aadhaarNumber: string | null;
  dob: string | null;
  confidence: number;
  rawText: string;
  documentType?: string;
  documentNumber?: string | null;
}

@Injectable()
export class AadhaarOcrService {
  private readonly logger = new Logger(AadhaarOcrService.name);

  constructor(private readonly documentOcrService: DocumentOcrService) {}

  /**
   * Pre-processes an ID image buffer with sharp for optimal OCR accuracy.
   */
  async preprocessImage(imageBuffer: Buffer): Promise<Buffer> {
    return (this.documentOcrService as any).ocrEngine?.preprocessImage(imageBuffer) || imageBuffer;
  }

  /**
   * Universal document parser (supports Aadhaar, PAN, Passport with auto-classification).
   */
  async parseAadhaar(imageBuffer: Buffer): Promise<AadhaarOcrResult> {
    const res = await this.documentOcrService.parseDocument(imageBuffer);
    return {
      name: res.extractedName,
      aadhaarNumber: res.documentNumber,
      documentNumber: res.documentNumber,
      documentType: res.documentType,
      dob: res.dob,
      confidence: res.confidence,
      rawText: res.rawText,
    };
  }

  /**
   * Direct Aadhaar details extractor from text.
   */
  extractAadhaarDetails(rawText: string): AadhaarOcrResult {
    const res = AadhaarParser.parse(rawText);
    return {
      name: res.extractedName,
      aadhaarNumber: res.documentNumber,
      documentNumber: res.documentNumber,
      documentType: res.documentType,
      dob: res.dob,
      confidence: res.confidence,
      rawText: res.rawText,
    };
  }
}
