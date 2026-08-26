import { Injectable, Logger } from "@nestjs/common";
import { OcrEngineService } from "./ocr-engine.service";
import { DocumentClassifierService } from "./document-classifier.service";
import { AadhaarParser } from "./parsers/aadhaar.parser";
import { PanParser } from "./parsers/pan.parser";
import { PassportParser } from "./parsers/passport.parser";
import { DocumentOcrResult } from "./ocr.types";

@Injectable()
export class DocumentOcrService {
  private readonly logger = new Logger(DocumentOcrService.name);

  constructor(
    private readonly ocrEngine: OcrEngineService,
    private readonly classifier: DocumentClassifierService,
  ) {}

  /**
   * Universal document OCR pipeline:
   * 1. Preprocesses image and runs local Tesseract OCR
   * 2. Auto-classifies document type (Aadhaar / PAN / Passport / Unknown)
   * 3. Dispatches to deterministic parser module
   */
  async parseDocument(imageBuffer: Buffer): Promise<DocumentOcrResult> {
    const ocrOutput = await this.ocrEngine.recognize(imageBuffer);
    const rawText = ocrOutput.rawText;

    if (!rawText || rawText.startsWith("OCR_ERROR")) {
      return {
        documentType: "UNKNOWN",
        extractedName: null,
        documentNumber: null,
        dob: null,
        confidence: 0.0,
        rawText,
      };
    }

    const classification = this.classifier.classify(rawText);
    this.logger.log(
      `Document auto-classified as ${classification.documentType} (confidence: ${classification.confidence}, rules: [${classification.matchedRules.join(", ")}])`,
    );

    let parseResult: DocumentOcrResult;

    switch (classification.documentType) {
      case "PAN":
        parseResult = PanParser.parse(rawText, classification.confidence);
        break;
      case "PASSPORT":
        parseResult = PassportParser.parse(rawText, classification.confidence);
        break;
      case "AADHAAR":
        parseResult = AadhaarParser.parse(rawText, classification.confidence);
        break;
      default:
        // Try fallback parsing if unclassified but text exists
        parseResult = {
          documentType: "UNKNOWN",
          extractedName: null,
          documentNumber: null,
          dob: null,
          confidence: 0.2,
          rawText,
          metadata: {
            classificationConfidence: classification.confidence,
            rawLines: ocrOutput.lines,
          },
        };
        break;
    }

    return parseResult;
  }

  /**
   * Backwards-compatible Aadhaar parser method.
   */
  async parseAadhaar(imageBuffer: Buffer) {
    const res = await this.parseDocument(imageBuffer);
    return {
      name: res.extractedName,
      aadhaarNumber: res.documentNumber,
      dob: res.dob,
      confidence: res.confidence,
      rawText: res.rawText,
    };
  }
}
