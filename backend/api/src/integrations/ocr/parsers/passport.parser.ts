import { DocumentOcrResult } from "../ocr.types";

export class PassportParser {
  /**
   * Deterministic MRZ-based and visual inspection parser for Indian Passports (ICAO Doc 9303).
   */
  static parse(rawText: string, classificationConfidence = 0.9): DocumentOcrResult {
    if (!rawText || !rawText.trim()) {
      return {
        documentType: "PASSPORT",
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

    const noiseWords = [
      "PASSPORT",
      "REPUBLIC OF INDIA",
      "REPUBLIC",
      "INDIA",
      "BHARAT",
      "TYPE",
      "COUNTRY CODE",
      "NATIONALITY",
      "INDIAN",
      "PLACE OF BIRTH",
      "PLACE OF ISSUE",
      "DATE OF ISSUE",
      "DATE OF EXPIRY",
      "DATE OF BIRTH",
      "GIVEN NAME",
      "GIVEN NAMES",
      "SURNAME",
      "SEX",
      "PHOTO",
      "NAME",
    ];

    // ==========================================
    // 1. VISUAL ZONE EXTRACTION
    // ==========================================
    let givenNameVisual = "";
    let surnameVisual = "";
    let visualPassportNo: string | null = null;
    let visualDob: string | null = null;
    const candidateVisualNames: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const upper = line.toUpperCase();

      if (upper.includes("GIVEN NAME") || upper.includes("GIVEN NAMES") || upper.includes("GIVENNAME")) {
        const val = line.replace(/.*GIVEN\s*NAME[S\s]*[:\/\-]?\s*/i, "").trim();
        const cleanedVal = val.replace(/[^A-Za-z\s\.\-']/g, " ").replace(/\s+/g, " ").trim();
        if (cleanedVal.length >= 2 && !cleanedVal.toUpperCase().startsWith("P<")) {
          givenNameVisual = cleanedVal;
        } else if (i + 1 < lines.length) {
          const next = lines[i + 1].replace(/[^A-Za-z\s\.\-']/g, " ").trim();
          if (next.length >= 2 && !next.toUpperCase().startsWith("P<") && !next.toUpperCase().includes("NATIONALITY")) {
            givenNameVisual = next;
          }
        }
      }

      if (upper.includes("SURNAME") && !upper.includes("GIVEN")) {
        const val = line.replace(/.*SURNAME\s*[:\/\-]?\s*/i, "").trim();
        const cleanedVal = val.replace(/[^A-Za-z\s\.\-']/g, " ").replace(/\s+/g, " ").trim();
        if (cleanedVal.length >= 2 && !cleanedVal.toUpperCase().startsWith("P<")) {
          surnameVisual = cleanedVal;
        } else if (i + 1 < lines.length) {
          const next = lines[i + 1].replace(/[^A-Za-z\s\.\-']/g, " ").trim();
          if (next.length >= 2 && !next.toUpperCase().startsWith("P<") && !next.toUpperCase().includes("GIVEN")) {
            surnameVisual = next;
          }
        }
      }

      if (upper.includes("PASSPORT NO") || upper.includes("PASSPORT NUMBER")) {
        const val = line.replace(/.*PASSPORT\s*NO[.\s]*[:\/\-]?\s*/i, "").trim();
        const pMatch = val.match(/([A-PR-WYZ][0-9]{7})/i);
        if (pMatch) visualPassportNo = pMatch[1].toUpperCase();
      }

      const pMatch = line.match(/\b([A-PR-WYZ][0-9]{7})\b/i);
      if (pMatch && !visualPassportNo) {
        visualPassportNo = pMatch[1].toUpperCase();
      }

      if (upper.includes("DATE OF BIRTH") || upper.includes("DOB")) {
        const dMatch = line.match(/(\d{2}[\/\.-]\d{2}[\/\.-]\d{4})/);
        if (dMatch) visualDob = dMatch[1];
      }

      // Check for clean uppercase visual name lines (e.g. KRUBANITH / SIVALINGAM PALANIVEL)
      const cleanLine = line.replace(/[^A-Za-z\s]/g, " ").replace(/\s+/g, " ").trim();
      const isPureUppercase = cleanLine === cleanLine.toUpperCase() && cleanLine.length >= 4;
      const isNotLabel = !line.endsWith(":") && !line.includes("—") && !line.includes("=") && !line.includes("<");

      if (isPureUppercase && isNotLabel) {
        const up = cleanLine.toUpperCase();
        if (!noiseWords.some((nw) => up === nw || up.includes(nw)) && !/[0-9]/.test(line)) {
          candidateVisualNames.push(cleanLine);
        }
      }
    }

    // ==========================================
    // 2. LOCATE & EXTRACT MRZ LINES (LINES 1 & 2)
    // ==========================================
    let mrzLine1: string | null = null;
    let mrzLine2: string | null = null;

    for (let i = 0; i < lines.length; i++) {
      const cleaned = lines[i].replace(/\s+/g, "").toUpperCase();
      if ((cleaned.startsWith("P<") || cleaned.includes("<<") || cleaned.includes("<")) && cleaned.length >= 15) {
        if (!mrzLine1 && /[A-Z]{3,}/.test(cleaned)) {
          mrzLine1 = cleaned;
          if (i + 1 < lines.length) {
            const nextCleaned = lines[i + 1].replace(/\s+/g, "").toUpperCase();
            if (nextCleaned.length >= 15 && /[0-9]/.test(nextCleaned)) {
              mrzLine2 = nextCleaned;
            }
          }
          break;
        }
      }
    }

    let mrzExtractedName: string | null = null;
    let passportNumber: string | null = visualPassportNo;
    let dob: string | null = visualDob;
    let expiryDate: string | null = null;
    let nationality: string | null = null;
    let mrzDetected = false;

    // ==========================================
    // 3. PARSE MRZ LINE 1: NAMES
    // ==========================================
    if (mrzLine1) {
      mrzDetected = true;
      let namePart = mrzLine1
        .replace(/^P<[A-Z]{3}/i, "")
        .replace(/^P</i, "")
        .replace(/^INA\s?IAR</i, "")
        .replace(/^IND</i, "");

      namePart = namePart.replace(/<<|<K|K<|KK/g, "<<");

      const splitNames = namePart.split("<<");
      const surname = (splitNames[0] || "").replace(/[^A-Za-z]/g, " ").replace(/\s+/g, " ").trim();

      let givenNames = "";
      if (splitNames.length > 1) {
        const rawGiven = splitNames.slice(1).join("<");
        const tokens = rawGiven.split(/[<]+/);
        const validWords: string[] = [];

        for (const tok of tokens) {
          const cleaned = tok.replace(/[^A-Za-z]/g, "").trim();
          if (/^[KLX<]+$/i.test(cleaned)) break;
          if (cleaned.length > 4 && !/[AEIOUY]/i.test(cleaned)) break;
          if (cleaned.length >= 2) validWords.push(cleaned);
        }
        givenNames = validWords.join(" ").trim();
      }

      if (givenNames && surname) {
        mrzExtractedName = `${givenNames} ${surname}`.trim();
      } else if (givenNames) {
        mrzExtractedName = givenNames;
      } else if (surname) {
        mrzExtractedName = surname;
      }
    }

    // ==========================================
    // 4. PARSE MRZ LINE 2: PASSPORT NO, DOB, EXPIRY
    // ==========================================
    if (mrzLine2) {
      const pNoMatch = mrzLine2.match(/([A-PR-WYZ][0-9]{7})/i);
      if (pNoMatch && !passportNumber) {
        passportNumber = pNoMatch[1].toUpperCase();
      }

      if (mrzLine2.length >= 19 && !dob) {
        const rawDob = mrzLine2.substring(13, 19);
        if (/^\d{6}$/.test(rawDob)) {
          const yy = parseInt(rawDob.substring(0, 2), 10);
          const mm = rawDob.substring(2, 4);
          const dd = rawDob.substring(4, 6);
          const currentYear = new Date().getFullYear() % 100;
          const fullYear = yy > currentYear ? 1900 + yy : 2000 + yy;
          dob = `${dd}/${mm}/${fullYear}`;
        }
      }
    }

    // ==========================================
    // 5. NAME RESOLUTION
    // ==========================================
    let finalExtractedName: string | null = null;
    if (givenNameVisual && surnameVisual) {
      finalExtractedName = `${givenNameVisual} ${surnameVisual}`.trim();
    } else if (mrzExtractedName && mrzExtractedName.includes(" ") && !/^[KLX\s]+$/i.test(mrzExtractedName)) {
      finalExtractedName = mrzExtractedName;
    } else if (candidateVisualNames.length > 0) {
      finalExtractedName = candidateVisualNames[0];
    } else if (mrzExtractedName && mrzExtractedName.length >= 3 && !/^[KLX\s]+$/i.test(mrzExtractedName)) {
      finalExtractedName = mrzExtractedName;
    } else if (givenNameVisual) {
      finalExtractedName = givenNameVisual;
    } else if (surnameVisual) {
      finalExtractedName = surnameVisual;
    }

    let confidence = 0.4;
    if (mrzDetected) confidence += 0.3;
    if (finalExtractedName && finalExtractedName.length >= 3) confidence += 0.2;
    if (passportNumber) confidence += 0.1;

    return {
      documentType: "PASSPORT",
      extractedName: finalExtractedName,
      documentNumber: passportNumber,
      dob,
      confidence: Math.min(1.0, parseFloat(confidence.toFixed(2))),
      rawText,
      metadata: {
        passportNumber,
        nationality,
        expiryDate,
        mrzDetected,
        classificationConfidence,
        rawLines: lines,
      },
    };
  }
}
