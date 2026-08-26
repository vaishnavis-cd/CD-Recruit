import { DocumentOcrResult } from "../ocr.types";

export class PanParser {
  /**
   * Corrects common OCR character confusions in a 10-character PAN string.
   */
  static normalizePanCandidate(candidate: string): string | null {
    if (!candidate || candidate.length !== 10) return null;
    const chars = candidate.toUpperCase().split("");

    const toLetter = (c: string) => {
      if (c === "0") return "O";
      if (c === "1") return "I";
      if (c === "2") return "Z";
      if (c === "5") return "S";
      if (c === "8") return "B";
      return c;
    };

    const toDigit = (c: string) => {
      if (c === "O" || c === "D" || c === "Q") return "0";
      if (c === "I" || c === "L" || c === "l" || c === "|" || c === "/") return "1";
      if (c === "Z") return "2";
      if (c === "S") return "5";
      if (c === "B") return "8";
      if (c === "G") return "6";
      return c;
    };

    for (let i = 0; i < 5; i++) chars[i] = toLetter(chars[i]);
    for (let i = 5; i < 9; i++) chars[i] = toDigit(chars[i]);
    chars[9] = toLetter(chars[9]);

    const result = chars.join("");
    return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(result) ? result : null;
  }

  /**
   * Deterministic parser for Indian PAN Card OCR text.
   */
  static parse(rawText: string, classificationConfidence = 0.9): DocumentOcrResult {
    if (!rawText || !rawText.trim()) {
      return {
        documentType: "PAN",
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

    const noiseKeywords = [
      "INCOME TAX",
      "INCOMETAX",
      "TAX DEPARTMENT",
      "DEPARTMENT",
      "GOVT OF INDIA",
      "GOVT. OF INDIA",
      "GOVT.OF INDIA",
      "GOVERNMENT OF INDIA",
      "GOVT",
      "PERMANENT ACCOUNT",
      "ACCOUNT NUMBER",
      "NUMBER CARD",
      "CARD",
      "SIGNATURE",
      "INDIA",
      "BHARAT",
      "AYAKAR",
      "VIBHAG",
      "PHOTO",
      "DATE OF BIRTH",
      "DOB",
      "FATHER",
      "FATHERS",
      "FATHER'S",
    ];

    // 1. Locate 10-character PAN Number
    let panNumber: string | null = null;
    let panLineIdx = -1;

    for (let i = 0; i < lines.length; i++) {
      const lineClean = lines[i].replace(/[^A-Za-z0-9]/g, "").toUpperCase();
      const directMatch = lineClean.match(/[A-Z]{5}[0-9]{4}[A-Z]/);
      if (directMatch) {
        panNumber = directMatch[0];
        panLineIdx = i;
        break;
      }
      if (lineClean.length === 10) {
        const normalized = this.normalizePanCandidate(lineClean);
        if (normalized) {
          panNumber = normalized;
          panLineIdx = i;
          break;
        }
      }
    }

    // 2. Locate DOB (DD/MM/YYYY or DD-MM-YYYY)
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

    // 3. Locate Father's Name label or anchor
    let fatherNameLineIdx = -1;
    let fatherName: string | null = null;

    for (let i = 0; i < lines.length; i++) {
      const upper = lines[i].toUpperCase();
      if (upper.includes("FATHER") || upper.includes("FATHERS") || upper.includes("FATHER'S")) {
        fatherNameLineIdx = i;
        if (i + 1 < lines.length) {
          const nextLine = lines[i + 1].replace(/[^A-Za-z\s\.\-']/g, " ").replace(/\s+/g, " ").trim();
          const nextUpper = nextLine.toUpperCase();
          if (nextLine.length >= 3 && !noiseKeywords.some((nw) => nextUpper === nw || nextUpper.startsWith(nw))) {
            fatherName = nextLine;
          }
        }
        break;
      }
    }

    // 4. Candidate Name Extraction
    let extractedName: string | null = null;

    const isHeaderOrNoise = (line: string): boolean => {
      const upper = line.toUpperCase();
      const cleaned = line.replace(/[^A-Za-z\s]/g, " ").replace(/\s+/g, " ").trim();
      if (!cleaned || cleaned.length < 3) return true;

      // Filter header keywords
      if (noiseKeywords.some((nw) => upper.includes(nw))) {
        return true;
      }

      // Filter lines containing PAN number
      if (/[A-Z]{5}[0-9]{4}[A-Z]/.test(cleaned.replace(/\s+/g, "").toUpperCase())) {
        return true;
      }

      // Filter lines composed solely of 1-2 character garbage words
      const words = cleaned.split(/\s+/).filter((w) => w.length >= 2);
      if (words.length === 0) return true;
      if (words.every((w) => w.length <= 2)) return true;

      return false;
    };

    const cleanCandidateLine = (line: string): string => {
      return line
        .replace(/.*(?:NAME|नाम)\s*[:\/\-]?\s*/i, "")
        .replace(/\b(?:nye|nani|sie|shas)\b/gi, "")
        .replace(/[^A-Za-z\s\.\-']/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    };

    // Candidate anchor boundary: search backwards from Father's Name or DOB line
    const anchorIdx = fatherNameLineIdx > 0 ? fatherNameLineIdx : dobLineIdx > 0 ? dobLineIdx : lines.length;

    // Search backwards from the anchor to pick the candidate name line directly preceding Father's Name
    for (let i = anchorIdx - 1; i >= 0; i--) {
      if (i === panLineIdx) continue;
      const line = lines[i];
      if (!isHeaderOrNoise(line)) {
        const cleaned = cleanCandidateLine(line);
        if (cleaned.length >= 3) {
          const upper = cleaned.toUpperCase();
          if (!noiseKeywords.some((nw) => upper === nw) && (!fatherName || upper !== fatherName.toUpperCase())) {
            extractedName = cleaned;
            break;
          }
        }
      }
    }

    // Fallback: Check if name was merged into Father's Name label line
    if (!extractedName && fatherNameLineIdx >= 0) {
      const line = lines[fatherNameLineIdx];
      const upper = line.toUpperCase();
      if (upper.includes("FATHER")) {
        const parts = line.split(/FATHER['S\s]*NAM[OE\s]*/i);
        for (const p of parts) {
          const cleanP = cleanCandidateLine(p);
          if (cleanP.length >= 3 && !noiseKeywords.some((nw) => cleanP.toUpperCase().includes(nw))) {
            if (!fatherName || cleanP.toUpperCase() !== fatherName.toUpperCase()) {
              extractedName = cleanP;
              break;
            }
          }
        }
      }
    }

    // Fallback: Forward scan top non-noise lines
    if (!extractedName) {
      for (let i = 0; i < lines.length; i++) {
        if (i === panLineIdx || i === dobLineIdx || i === fatherNameLineIdx) continue;
        const line = lines[i];
        if (!isHeaderOrNoise(line)) {
          const cleaned = cleanCandidateLine(line);
          if (cleaned.length >= 3 && (!fatherName || cleaned.toUpperCase() !== fatherName.toUpperCase())) {
            extractedName = cleaned;
            break;
          }
        }
      }
    }

    // 5. Calculate Confidence Score
    let confidence = 0.4;
    if (panNumber) confidence += 0.35;
    if (dob) confidence += 0.15;
    if (extractedName && extractedName.length >= 3) confidence += 0.1;

    return {
      documentType: "PAN",
      extractedName,
      documentNumber: panNumber,
      dob,
      confidence: Math.min(1.0, parseFloat(confidence.toFixed(2))),
      rawText,
      metadata: {
        panNumber,
        fatherName,
        classificationConfidence,
        rawLines: lines,
      },
    };
  }
}
