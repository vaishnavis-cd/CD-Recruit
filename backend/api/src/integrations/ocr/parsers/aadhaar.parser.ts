import { DocumentOcrResult } from "../ocr.types";

export class AadhaarParser {
  /**
   * Deterministic parser for Aadhaar OCR text.
   */
  static parse(rawText: string, classificationConfidence = 0.9): DocumentOcrResult {
    if (!rawText || !rawText.trim()) {
      return {
        documentType: "AADHAAR",
        extractedName: null,
        documentNumber: null,
        dob: null,
        confidence: 0.0,
        rawText: "",
      };
    }

    const lines = rawText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    // 1. Locate 12-digit Aadhaar Number (\d{4}\s?\d{4}\s?\d{4})
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

    // 2. Locate DOB Line (keyword DOB / Date of Birth / Year of Birth OR date pattern)
    let dob: string | null = null;
    let dobLineIdx = -1;

    const dateRegex = /\b(\d{2}[\/\.-]\d{2}[\/\.-]\d{4})\b/;

    for (let i = 0; i < lines.length; i++) {
      const upper = lines[i].toUpperCase();
      if (
        upper.includes("DOB") ||
        upper.includes("DATE OF BIRTH") ||
        upper.includes("YEAR OF BIRTH") ||
        upper.includes("YOB") ||
        upper.includes("DOB:")
      ) {
        dobLineIdx = i;
        const dMatch = lines[i].match(dateRegex);
        if (dMatch) {
          dob = dMatch[1];
        } else {
          // Check for 8-digit or 10-digit unspaced date e.g. 0511072004 or 05102004
          const digits = lines[i].replace(/[^0-9]/g, "");
          if (digits.length === 8) {
            dob = `${digits.substring(0, 2)}/${digits.substring(2, 4)}/${digits.substring(4, 8)}`;
          }
        }
        break;
      }

      // Check if line matches DD/MM/YYYY directly
      const dMatch = lines[i].match(dateRegex);
      if (dMatch && dobLineIdx === -1) {
        dob = dMatch[1];
        dobLineIdx = i;
      }
    }

    // 3. Locate Gender Line (MALE / FEMALE / TRANSGENDER)
    let genderLineIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      const upper = lines[i].toUpperCase();
      if (upper.includes("MALE") || upper.includes("FEMALE") || upper.includes("TRANSGENDER")) {
        genderLineIdx = i;
        break;
      }
    }

    // 4. Candidate Name Extraction
    let extractedName: string | null = null;

    const noiseWords = [
      "GOVERNMENT OF INDIA",
      "GOVT OF INDIA",
      "GOVERNMENT",
      "UNIQUE IDENTIFICATION",
      "AUTHORITY OF INDIA",
      "MALE",
      "FEMALE",
      "TRANSGENDER",
      "ENROLLMENT",
      "ENROLMENT",
      "AADHAAR",
      "ADDRESS",
      "FATHER",
      "MOTHER",
      "HUSBAND",
      "INDIA",
      "BHARAT",
      "SARKAR",
      "PEHCHAN",
      "MERA",
      "MERI",
      "VID",
      "HELP",
    ];

    const cleanAadhaarNameLine = (line: string): string => {
      return line
        .replace(/.*(?:GOVERNMENT OF INDIA|GOVT OF INDIA)\s*/i, "")
        .replace(/[^A-Za-z\s\.\-']/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    };

    const isAadhaarNoise = (cleaned: string): boolean => {
      if (!cleaned || cleaned.length < 3) return true;
      const upper = cleaned.toUpperCase();
      if (noiseWords.some((nw) => upper === nw || upper.includes(nw))) return true;
      const words = cleaned.split(/\s+/).filter((w) => w.length >= 2);
      if (words.length === 0) return true;
      return false;
    };

    // Candidate anchor: search backwards from DOB line or Gender line
    const anchorIdx = dobLineIdx > 0
      ? dobLineIdx
      : genderLineIdx > 0
      ? genderLineIdx
      : aadhaarLineIdx > 0
      ? Math.min(aadhaarLineIdx, 4)
      : Math.min(lines.length, 5);

    // Search backwards from the anchor line towards top
    for (let i = anchorIdx - 1; i >= 0; i--) {
      const cleaned = cleanAadhaarNameLine(lines[i]);
      if (!isAadhaarNoise(cleaned)) {
        extractedName = cleaned;
        break;
      }
    }

    // Fallback: search top 5 lines for a clean Latin name
    if (!extractedName) {
      for (let i = 0; i < Math.min(lines.length, 5); i++) {
        const cleaned = cleanAadhaarNameLine(lines[i]);
        if (!isAadhaarNoise(cleaned)) {
          extractedName = cleaned;
          break;
        }
      }
    }

    // 5. Calculate Confidence Score
    let confidence = 0.5;
    if (aadhaarNumber && dob) {
      confidence = 1.0;
    } else if (aadhaarNumber || dob) {
      confidence = 0.8;
    }
    if (extractedName && extractedName.length >= 3) {
      confidence = Math.min(1.0, confidence + 0.1);
    }

    return {
      documentType: "AADHAAR",
      extractedName,
      documentNumber: aadhaarNumber,
      dob,
      confidence: Math.min(1.0, parseFloat(confidence.toFixed(2))),
      rawText,
      metadata: {
        aadhaarNumber,
        classificationConfidence,
        rawLines: lines,
      },
    };
  }
}
