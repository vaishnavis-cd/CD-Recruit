import { Injectable, Logger } from "@nestjs/common";
import { ClassificationResult, DocumentType } from "./ocr.types";

@Injectable()
export class DocumentClassifierService {
  private readonly logger = new Logger(DocumentClassifierService.name);

  /**
   * Classify document type from raw OCR text using regex and keyword signature scoring.
   */
  classify(rawText: string): ClassificationResult {
    if (!rawText || !rawText.trim()) {
      return {
        documentType: "UNKNOWN",
        confidence: 0.0,
        scores: { AADHAAR: 0, PAN: 0, PASSPORT: 0, UNKNOWN: 1.0 },
        matchedRules: ["EMPTY_TEXT"],
      };
    }

    const upperText = rawText.toUpperCase();
    const lines = rawText.split(/\r?\n/).map((l) => l.trim().toUpperCase());

    let aadhaarScore = 0;
    let panScore = 0;
    let passportScore = 0;

    const aadhaarRules: string[] = [];
    const panRules: string[] = [];
    const passportRules: string[] = [];

    // ==========================================
    // 1. PASSPORT SIGNATURES
    // ==========================================
    // MRZ Line 1 pattern: Starts with P< or P<IND or contains name chevrons
    const mrzLine1Regex = /P<[A-Z0-9<]{2,}/i;
    const mrzLine2Regex = /[A-Z0-9<]{8,}[0-9][A-Z<]{3}[0-9]{6}[0-9][MF<][0-9]{6}/i;
    const mrzDelimiterRegex = /[A-Z]{2,}<[A-Z]{2,}/;
    const passportNoRegex = /\b[A-PR-WYZ][0-9]{7}\b/;

    const hasMrzLine1 = lines.some((l) => mrzLine1Regex.test(l.replace(/\s+/g, "")));
    const hasMrzLine2 = lines.some((l) => mrzLine2Regex.test(l.replace(/\s+/g, "")));
    const hasMrzDelimiters = lines.some((l) => mrzDelimiterRegex.test(l.replace(/\s+/g, "")));
    const hasPassportNo = lines.some((l) => passportNoRegex.test(l));
    const chevronCount = (upperText.match(/<<+/g) || upperText.match(/<+/g) || []).length;

    if (hasMrzLine1) {
      passportScore += 50;
      passportRules.push("MRZ_LINE_1_DETECTED");
    }
    if (hasMrzLine2) {
      passportScore += 45;
      passportRules.push("MRZ_LINE_2_DETECTED");
    }
    if (hasMrzDelimiters && !hasMrzLine1) {
      passportScore += 40;
      passportRules.push("MRZ_DELIMITER_LINE_DETECTED");
    }
    if (hasPassportNo) {
      passportScore += 35;
      passportRules.push("PASSPORT_NUMBER_REGEX_MATCH");
    }
    if (chevronCount >= 2) {
      passportScore += 20;
      passportRules.push(`CHEVRON_SEQUENCES_${chevronCount}`);
    }

    const passportKeywords: Array<{ kw: string; points: number }> = [
      { kw: "PASSPORT", points: 25 },
      { kw: "REPUBLIC OF INDIA", points: 30 },
      { kw: "TYPE P", points: 25 },
      { kw: "PASSPORT NO", points: 25 },
      { kw: "PASSPORT NUMBER", points: 25 },
      { kw: "NATIONALITY", points: 15 },
      { kw: "PLACE OF BIRTH", points: 15 },
      { kw: "PLACE OF ISSUE", points: 15 },
      { kw: "GIVEN NAME", points: 15 },
      { kw: "SURNAME", points: 15 },
      { kw: "CODE IND", points: 20 },
    ];

    for (const { kw, points } of passportKeywords) {
      if (upperText.includes(kw)) {
        passportScore += points;
        passportRules.push(`KEYWORD_${kw.replace(/\s+/g, "_")}`);
      }
    }

    // ==========================================
    // 2. PAN CARD SIGNATURES
    // ==========================================
    const panRegex = /\b[A-Z]{5}[0-9]{4}[A-Z]\b/;
    const hasPanNumber = panRegex.test(upperText);

    if (hasPanNumber) {
      panScore += 45;
      panRules.push("PAN_REGEX_MATCH");
    }

    const panKeywords: Array<{ kw: string; points: number }> = [
      { kw: "INCOME TAX DEPARTMENT", points: 35 },
      { kw: "INCOMETAX", points: 25 },
      { kw: "PERMANENT ACCOUNT NUMBER", points: 35 },
      { kw: "PERMANENT ACCOUNT", points: 20 },
      { kw: "GOVT. OF INDIA", points: 15 },
      { kw: "GOVT OF INDIA", points: 15 },
      { kw: "FATHER'S NAME", points: 20 },
      { kw: "FATHERS NAME", points: 20 },
      { kw: "CARD", points: 5 },
      { kw: "SIGNATURE", points: 10 },
    ];

    for (const { kw, points } of panKeywords) {
      if (upperText.includes(kw)) {
        panScore += points;
        panRules.push(`KEYWORD_${kw.replace(/[\s\.\']+/g, "_")}`);
      }
    }

    // ==========================================
    // 3. AADHAAR CARD SIGNATURES
    // ==========================================
    const aadhaarRegex = /\b\d{4}\s?\d{4}\s?\d{4}\b/;
    const hasAadhaarNumber = lines.some((l) => aadhaarRegex.test(l.replace(/[^\d\s]/g, "")));

    if (hasAadhaarNumber && !hasPanNumber && !hasMrzLine1 && !hasMrzDelimiters) {
      aadhaarScore += 40;
      aadhaarRules.push("AADHAAR_UID_12_DIGITS");
    }

    const aadhaarKeywords: Array<{ kw: string; points: number }> = [
      { kw: "UNIQUE IDENTIFICATION", points: 35 },
      { kw: "AUTHORITY OF INDIA", points: 25 },
      { kw: "UIDAI", points: 35 },
      { kw: "MERA AADHAAR", points: 30 },
      { kw: "MERI PEHCHAN", points: 25 },
      { kw: "AADHAAR", points: 20 },
      { kw: "ENROLMENT NO", points: 20 },
      { kw: "VID", points: 15 },
      { kw: "HELP@UIDAI", points: 20 },
      { kw: "WWW.UIDAI.GOV.IN", points: 25 },
      { kw: "PEHCHAN", points: 15 },
    ];

    for (const { kw, points } of aadhaarKeywords) {
      if (upperText.includes(kw)) {
        aadhaarScore += points;
        aadhaarRules.push(`KEYWORD_${kw.replace(/[\s\.\@]+/g, "_")}`);
      }
    }

    // ==========================================
    // 4. SCORING & CLASSIFICATION DECISION
    // ==========================================
    const scores: Record<DocumentType, number> = {
      PASSPORT: passportScore,
      PAN: panScore,
      AADHAAR: aadhaarScore,
      UNKNOWN: 0,
    };

    const maxScore = Math.max(passportScore, panScore, aadhaarScore);
    const MIN_CONFIDENCE_THRESHOLD = 25;

    let detectedType: DocumentType = "UNKNOWN";
    let matchedRules: string[] = [];

    if (maxScore >= MIN_CONFIDENCE_THRESHOLD) {
      if (passportScore >= panScore && passportScore >= aadhaarScore) {
        detectedType = "PASSPORT";
        matchedRules = passportRules;
      } else if (panScore >= aadhaarScore) {
        detectedType = "PAN";
        matchedRules = panRules;
      } else {
        detectedType = "AADHAAR";
        matchedRules = aadhaarRules;
      }
    } else {
      matchedRules = ["NO_SIGNATURE_EXCEEDED_THRESHOLD"];
    }

    const normalizedConfidence = maxScore >= MIN_CONFIDENCE_THRESHOLD
      ? Math.min(1.0, parseFloat((maxScore / 100).toFixed(2)))
      : 0.0;

    return {
      documentType: detectedType,
      confidence: normalizedConfidence,
      scores,
      matchedRules,
    };
  }
}
