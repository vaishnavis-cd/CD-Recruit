import { Injectable, Logger } from "@nestjs/common";
import { createWorker } from "tesseract.js";
import sharp from "sharp";

export type SupportedIdDocType = "AADHAAR" | "PAN" | "PASSPORT" | "DRIVING_LICENCE" | "GENERIC_ID";

export interface AadhaarOcrResult {
  docType?: SupportedIdDocType;
  name: string | null;
  aadhaarNumber?: string | null;
  idNumber?: string | null;
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
        .resize({ width: 1800, withoutEnlargement: true })
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
   * Runs Tesseract OCR on the image and automatically detects & extracts details
   * from Aadhaar, PAN Card, Passport, or Driving Licence.
   */
  async parseAadhaar(imageBuffer: Buffer): Promise<AadhaarOcrResult> {
    return this.parseIdDocument(imageBuffer);
  }

  /**
   * Unified Government ID Parser.
   */
  async parseIdDocument(imageBuffer: Buffer): Promise<AadhaarOcrResult> {
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
        docType: "GENERIC_ID",
        name: null,
        aadhaarNumber: null,
        idNumber: null,
        dob: null,
        confidence: 0.0,
        rawText: `OCR_ERROR: ${err.message}`,
      };
    }

    return this.extractIdDetails(rawText);
  }

  /**
   * Heuristic multi-document classifier & field extractor.
   */
  extractIdDetails(rawText: string): AadhaarOcrResult {
    if (!rawText || !rawText.trim()) {
      return {
        docType: "GENERIC_ID",
        name: null,
        aadhaarNumber: null,
        idNumber: null,
        dob: null,
        confidence: 0.0,
        rawText: "",
      };
    }

    const lines = rawText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    const upperText = rawText.toUpperCase();

    // 1. Detect Document Type
    if (
      upperText.includes("PASSPORT") ||
      upperText.includes("REPUBLIC OF INDIA") ||
      upperText.includes("P<IND") ||
      /P<[A-Z]{3}/.test(upperText)
    ) {
      return this.parsePassport(lines, rawText);
    }

    if (
      upperText.includes("INCOME TAX") ||
      upperText.includes("PERMANENT ACCOUNT") ||
      /\b[A-Z]{5}[0-9]{4}[A-Z]\b/.test(upperText)
    ) {
      return this.parsePanCard(lines, rawText);
    }

    if (
      upperText.includes("DRIVING") ||
      upperText.includes("LICENCE") ||
      upperText.includes("LICENSE") ||
      upperText.includes("UNION OF INDIA") ||
      /\bDL[\s-]?[0-9A-Z]{10,16}\b/i.test(upperText)
    ) {
      return this.parseDrivingLicence(lines, rawText);
    }

    // Default to Aadhaar Card parsing (or generic fallback)
    return this.parseAadhaarDocument(lines, rawText);
  }

  /**
   * 1. Aadhaar Card Parser
   */
  private parseAadhaarDocument(lines: string[], rawText: string): AadhaarOcrResult {
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
      for (let i = candidateNameLineIndex; i >= Math.max(0, candidateNameLineIndex - 3); i--) {
        const cleanedLine = lines[i].replace(/[^A-Za-z\s\.\-']/g, " ").replace(/\s+/g, " ").trim();
        if (cleanedLine.length >= 3) {
          const upperLine = cleanedLine.toUpperCase();
          if (!noiseWords.some((nw) => upperLine.includes(nw))) {
            extractedName = cleanedLine;
            break;
          }
        }
      }
    }

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

    let confidence = 0.2;
    if (aadhaarNumber && dob) confidence = 0.9;
    else if (aadhaarNumber || dob) confidence = 0.6;
    if (extractedName && extractedName.length >= 3) confidence += 0.1;

    return {
      docType: "AADHAAR",
      name: extractedName,
      aadhaarNumber,
      idNumber: aadhaarNumber,
      dob,
      confidence: Math.min(1.0, parseFloat(confidence.toFixed(2))),
      rawText,
    };
  }

  /**
   * 2. PAN Card Parser (Permanent Account Number)
   * Layout:
   * Header ("INCOME TAX DEPARTMENT") -> Name -> Father's Name -> Date of Birth -> PAN (ABCDE1234F)
   */
  private parsePanCard(lines: string[], rawText: string): AadhaarOcrResult {
    const panRegex = /\b([A-Z]{5}[0-9]{4}[A-Z])\b/;
    let panNumber: string | null = null;
    let panLineIdx = -1;

    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(panRegex);
      if (match) {
        panNumber = match[1];
        panLineIdx = i;
        break;
      }
    }

    const dobRegex = /\b(\d{2}[\/\.-]\d{2}[\/\.-]\d{4})\b/;
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

    const panNoise = [
      "INCOME TAX",
      "INCOMETAX",
      "DEPARTMENT",
      "GOVT OF INDIA",
      "GOVLOFINDIA",
      "GOVT. OF INDIA",
      "GOVERNMENT OF INDIA",
      "PERMANENT ACCOUNT",
      "ACCOUNT NUMBER",
      "NUMBER CARD",
      "SIGNATURE",
      "FATHER'S NAME",
      "FATHERS NAME",
      "FATHER",
      "DATE OF BIRTH",
      "BHARAT",
      "SARKAR",
      "AAYKAR",
      "VIBHAG",
      "FEAST",
      "AREA",
      "WBE",
      "RELMA",
      "POA",
      "BIAN",
      "SEER",
      "PEE",
      "EET",
      "LOE",
    ];

    // 1. Find the last header line index (e.g. "Permanent Account Number Card" or "INCOME TAX")
    let headerEndIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      const upper = lines[i].toUpperCase();
      if (
        upper.includes("INCOME") ||
        upper.includes("DEPARTMENT") ||
        upper.includes("PERMANENT") ||
        upper.includes("ACCOUNT") ||
        panRegex.test(lines[i])
      ) {
        headerEndIdx = i;
      }
    }

    // 2. Scan lines after the header/PAN number to find the candidate's name
    const candidateNameTokens: string[] = [];
    const startIdx = headerEndIdx >= 0 ? headerEndIdx + 1 : 0;

    for (let i = startIdx; i < lines.length; i++) {
      const line = lines[i];

      // Strip OCR noise symbols (smart quotes, bars, dashes, pluses)
      const cleaned = line
        .replace(/[“’”"~<>=|\$\+\\\/\-\[\]\(\)]/g, " ")
        .replace(/[^A-Za-z\s\.]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      if (cleaned.length >= 3) {
        const upper = cleaned.toUpperCase();
        const isNoise = panNoise.some((nw) => upper.includes(nw));
        const isPanNo = panRegex.test(line);
        const isDob = dobRegex.test(line);

        if (!isNoise && !isPanNo && !isDob) {
          // Extract valid name words (words with 3+ letters or single uppercase initials)
          const words = cleaned
            .split(/\s+/)
            .filter((w) => /^[A-Z]{2,}$/.test(w) || (/^[A-Z]$/.test(w) && w.length === 1))
            .filter((w) => !panNoise.includes(w.toUpperCase()));

          // If line has prominent uppercase name words (e.g. "HARSH G", "SHANMY")
          const validWordCount = words.filter((w) => w.length >= 3).length;
          if (validWordCount >= 1) {
            candidateNameTokens.push(words.join(" "));
            if (candidateNameTokens.length >= 2) break;
          }
        }
      }
    }

    let extractedName: string | null = null;
    if (candidateNameTokens.length > 0) {
      extractedName = candidateNameTokens.join(" ").trim();
    }

    let confidence = 0.3;
    if (panNumber) confidence += 0.4;
    if (dob) confidence += 0.2;
    if (extractedName && extractedName.length >= 3) confidence += 0.1;

    return {
      docType: "PAN",
      name: extractedName,
      idNumber: panNumber,
      aadhaarNumber: panNumber,
      dob,
      confidence: Math.min(1.0, parseFloat(confidence.toFixed(2))),
      rawText,
    };
  }

  /**
   * 3. Passport Parser (Includes MRZ string parsing & visual text zone)
   */
  private parsePassport(lines: string[], rawText: string): AadhaarOcrResult {
    let extractedName: string | null = null;
    let passportNumber: string | null = null;
    let dob: string | null = null;

    // Check for Machine Readable Zone (MRZ) - 2 lines of 44 characters starting with P<
    // Example: P<INDSHARMA<<HARSHIKA<<<<<<<<<<<<<<<<<<<<<<<
    const mrzLine1 = lines.find((l) => /^P<[A-Z0-9<]{30,}/i.test(l.replace(/\s+/g, "")));
    if (mrzLine1) {
      const cleanMrz = mrzLine1.replace(/\s+/g, "").toUpperCase();
      const parts = cleanMrz.slice(5).split("<<");
      if (parts.length >= 2) {
        const surname = parts[0].replace(/</g, " ").trim();
        const givenNames = parts[1].replace(/</g, " ").trim();
        extractedName = `${givenNames} ${surname}`.trim();
      } else if (parts.length === 1) {
        extractedName = parts[0].replace(/</g, " ").trim();
      }
    }

    // Check for Passport number format (1 letter followed by 7 digits e.g. Z1234567)
    const passNoRegex = /\b([A-Z][0-9]{7})\b/;
    for (const l of lines) {
      const m = l.match(passNoRegex);
      if (m) {
        passportNumber = m[1];
        break;
      }
    }

    // If MRZ wasn't detected, check visual inspection fields ("Given Name:", "Surname:")
    if (!extractedName) {
      let givenName = "";
      let surname = "";
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        if (/Given\s*Name/i.test(l)) {
          givenName = (lines[i + 1] || "").replace(/[^A-Za-z\s]/g, "").trim();
        }
        if (/Surname/i.test(l)) {
          surname = (lines[i + 1] || "").replace(/[^A-Za-z\s]/g, "").trim();
        }
      }
      if (givenName || surname) {
        extractedName = `${givenName} ${surname}`.trim();
      }
    }

    const dobRegex = /\b(\d{2}[\/\.-]\d{2}[\/\.-]\d{4})\b/;
    for (const l of lines) {
      const m = l.match(dobRegex);
      if (m) {
        dob = m[1];
        break;
      }
    }

    let confidence = 0.4;
    if (passportNumber) confidence += 0.3;
    if (extractedName && extractedName.length >= 3) confidence += 0.2;
    if (dob) confidence += 0.1;

    return {
      docType: "PASSPORT",
      name: extractedName,
      idNumber: passportNumber,
      aadhaarNumber: passportNumber,
      dob,
      confidence: Math.min(1.0, parseFloat(confidence.toFixed(2))),
      rawText,
    };
  }

  /**
   * 4. Driving Licence Parser (DL)
   */
  private parseDrivingLicence(lines: string[], rawText: string): AadhaarOcrResult {
    let dlNumber: string | null = null;
    let extractedName: string | null = null;
    let dob: string | null = null;

    // Standard Indian DL formats: DL-1420110012345, MH0220190001234, TN-01-2020-0001234
    const dlRegex = /\b([A-Z]{2}[-\s]?[0-9]{2}[-\s]?[0-9]{4}[-\s]?[0-9]{7}|[A-Z]{2}[0-9]{13,15})\b/i;
    for (const l of lines) {
      const m = l.match(dlRegex);
      if (m) {
        dlNumber = m[1].replace(/[-\s]/g, "");
        break;
      }
    }

    const dlNoise = [
      "UNION OF INDIA",
      "DRIVING LICENCE",
      "DRIVING LICENSE",
      "FORM 7",
      "TRANSPORT DEPARTMENT",
      "MOTOR VEHICLES DEPARTMENT",
      "AUTHORITY",
      "VALIDITY",
      "NON TRANSPORT",
      "TRANSPORT",
      "SIGNATURE",
      "BLOOD GROUP",
      "DOB",
      "DATE OF BIRTH",
    ];

    // Look for explicit "Name:" label or first valid alphabetic line
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const nameLabelMatch = l.match(/(?:Name|Holder['’]s\s*Name)\s*[:\-]?\s*([A-Za-z\s\.\-']+)/i);
      if (nameLabelMatch && nameLabelMatch[1].trim().length >= 3) {
        extractedName = nameLabelMatch[1].trim();
        break;
      }
    }

    if (!extractedName) {
      for (let i = 0; i < Math.min(lines.length, 6); i++) {
        const cleaned = lines[i].replace(/[^A-Za-z\s\.\-']/g, " ").replace(/\s+/g, " ").trim();
        if (cleaned.length >= 3) {
          const upper = cleaned.toUpperCase();
          if (!dlNoise.some((nw) => upper.includes(nw))) {
            extractedName = cleaned;
            break;
          }
        }
      }
    }

    const dobRegex = /\b(?:DOB|Date of Birth)\s*[:\s]?\s*(\d{2}[\/\.-]\d{2}[\/\.-]\d{4})\b/i;
    for (const l of lines) {
      const m = l.match(dobRegex);
      if (m) {
        dob = m[1];
        break;
      }
    }

    let confidence = 0.3;
    if (dlNumber) confidence += 0.4;
    if (extractedName && extractedName.length >= 3) confidence += 0.2;
    if (dob) confidence += 0.1;

    return {
      docType: "DRIVING_LICENCE",
      name: extractedName,
      idNumber: dlNumber,
      aadhaarNumber: dlNumber,
      dob,
      confidence: Math.min(1.0, parseFloat(confidence.toFixed(2))),
      rawText,
    };
  }
}

