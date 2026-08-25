import { Injectable, Logger } from "@nestjs/common";
import { createWorker } from "tesseract.js";
import sharp from "sharp";

export interface AadhaarOcrResult {
  name: string | null;
  aadhaarNumber: string | null;
  dob: string | null;
  confidence: number;
  rawText: string;
}

@Injectable()
export class AadhaarOcrService {
  private readonly logger = new Logger(AadhaarOcrService.name);

  /**
   * Pre-processes an ID image buffer with sharp for optimal OCR accuracy.
   */
  async preprocessImage(imageBuffer: Buffer): Promise<Buffer> {
    try {
      return await sharp(imageBuffer)
        .rotate() // Auto-orient using EXIF
        .resize({ width: 1600, withoutEnlargement: true })
        .grayscale()
        .normalize()
        .sharpen()
        .toBuffer();
    } catch (err: any) {
      this.logger.warn(`Sharp image preprocessing warning: ${err.message}. Using raw buffer.`);
      return imageBuffer;
    }
  }

  /**
   * Runs Tesseract OCR and parses Aadhaar-specific anchors (Aadhaar number, DOB, Name).
   */
  async parseAadhaar(imageBuffer: Buffer): Promise<AadhaarOcrResult> {
    let rawText = "";

    try {
      const processedBuffer = await this.preprocessImage(imageBuffer);

      const worker = await createWorker("eng");
      const { data } = await worker.recognize(processedBuffer);
      await worker.terminate();

      rawText = data.text || "";
    } catch (err: any) {
      this.logger.error(`Tesseract OCR processing failed: ${err.message}`);
      return {
        name: null,
        aadhaarNumber: null,
        dob: null,
        confidence: 0.0,
        rawText: `OCR_ERROR: ${err.message}`,
      };
    }

    return this.extractAadhaarDetails(rawText);
  }

  /**
   * Heuristic parser for Aadhaar OCR text.
   */
  extractAadhaarDetails(rawText: string): AadhaarOcrResult {
    if (!rawText || !rawText.trim()) {
      return { name: null, aadhaarNumber: null, dob: null, confidence: 0.0, rawText: "" };
    }

    const lines = rawText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    // 1. Anchor 1: 12-digit Aadhaar Number (\d{4}\s?\d{4}\s?\d{4})
    const aadhaarRegex = /\b(\d{4}\s?\d{4}\s?\d{4})\b/;
    let aadhaarNumber: string | null = null;
    let aadhaarLineIdx = -1;

    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(aadhaarRegex);
      if (match) {
        aadhaarNumber = match[1].replace(/\s+/g, "");
        aadhaarLineIdx = i;
        break;
      }
    }

    // 2. Anchor 2: DOB or Year of Birth line
    const dobRegex = /\b(?:DOB|Date of Birth|Year of Birth|YOB)\s*[:\s]?\s*(\d{2}[\/\.-]\d{2}[\/\.-]\d{4}|\d{4})\b/i;
    let dob: string | null = null;
    let dobLineIdx = -1;

    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(dobRegex);
      if (match) {
        dob = match[1];
        dobLineIdx = i;
        break;
      }
    }

    // 3. Name Line Extraction
    // Take the Latin-script line immediately preceding the DOB or Aadhaar anchor line
    let candidateNameLineIndex = -1;
    if (dobLineIdx > 0) {
      candidateNameLineIndex = dobLineIdx - 1;
    } else if (aadhaarLineIdx > 0) {
      candidateNameLineIndex = aadhaarLineIdx - 1;
    }

    let extractedName: string | null = null;

    const noiseWords = [
      "GOVERNMENT OF INDIA",
      "GOVT OF INDIA",
      "UNIQUE IDENTIFICATION",
      "AUTHORITY OF INDIA",
      "MALE",
      "FEMALE",
      "TRANSGENDER",
      "ENROLLMENT",
      "AADHAAR",
      "ADDRESS",
      "FATHER",
      "MOTHER",
      "HUSBAND",
      "INDIA",
    ];

    if (candidateNameLineIndex >= 0) {
      // Search backwards up to 3 lines from the anchor
      for (let i = candidateNameLineIndex; i >= Math.max(0, candidateNameLineIndex - 3); i--) {
        const line = lines[i];

        // Clean line of OCR noise symbols (pipes |, equal signs =, brackets [], digits)
        const cleanedLine = line.replace(/[^A-Za-z\s\.\-']/g, " ").replace(/\s+/g, " ").trim();

        if (cleanedLine.length >= 3) {
          const upperLine = cleanedLine.toUpperCase();
          const isNoise = noiseWords.some((nw) => upperLine.includes(nw));
          if (!isNoise) {
            extractedName = cleanedLine;
            break;
          }
        }
      }
    }

    // If no candidate line found before anchors, search top 5 lines for a clean Latin name
    if (!extractedName) {
      for (let i = 0; i < Math.min(lines.length, 5); i++) {
        const line = lines[i];
        if (/^[A-Za-z\s\.\-']{3,}$/.test(line)) {
          const upperLine = line.toUpperCase();
          if (!noiseWords.some((nw) => upperLine.includes(nw))) {
            extractedName = line.trim();
            break;
          }
        }
      }
    }

    // Calculate Confidence Score
    let confidence = 0.2; // Base confidence
    if (aadhaarNumber && dob) {
      confidence = 0.9;
    } else if (aadhaarNumber || dob) {
      confidence = 0.6;
    }
    if (extractedName && extractedName.length >= 3) {
      confidence += 0.1;
    }

    return {
      name: extractedName,
      aadhaarNumber,
      dob,
      confidence: Math.min(1.0, parseFloat(confidence.toFixed(2))),
      rawText,
    };
  }
}
