import { Injectable, BadRequestException } from "@nestjs/common";
import { normalizeExperienceTier, CandidateCategory } from "../common/utils/experience-tier.util";

export interface ParsedCandidateRow {
  name: string;
  candidateEmail: string;
  level?: string;
  category?: CandidateCategory;
  experienceTier?: string;
}

export interface CsvParseResult {
  valid: ParsedCandidateRow[];
  errors: string[];
}

@Injectable()
export class CsvIngestionService {
  private readonly emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  /**
   * Parse a raw CSV text content or buffer into structured candidate rows (with level support).
   */
  parseCandidateCsv(csvContent: string, defaultCategory = CandidateCategory.FRESHER): CsvParseResult {
    if (!csvContent || !csvContent.trim()) {
      throw new BadRequestException("CSV file content is empty");
    }

    const lines = csvContent.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length <= 1) {
      throw new BadRequestException("CSV file must contain a header row and at least one candidate data row");
    }

    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const nameIdx = headers.findIndex((h) => h.includes("name"));
    const emailIdx = headers.findIndex((h) => h.includes("email"));
    const levelIdx = headers.findIndex((h) => h.includes("level") || h.includes("tier") || h.includes("exp"));

    if (nameIdx === -1 || emailIdx === -1) {
      throw new BadRequestException("CSV headers must contain 'name' and 'email' columns");
    }

    const valid: ParsedCandidateRow[] = [];
    const errors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const columns = lines[i].split(",").map((c) => c.trim());
      const name = columns[nameIdx] ?? "";
      const email = columns[emailIdx] ?? "";
      const rawLevel = levelIdx !== -1 ? (columns[levelIdx] ?? "") : "";

      if (!name || !email) {
        errors.push(`Row ${i + 1}: Missing name or email`);
        continue;
      }

      if (!this.emailRegex.test(email)) {
        errors.push(`Row ${i + 1}: Invalid email address '${email}'`);
        continue;
      }

      let category = defaultCategory;
      let experienceTier = defaultCategory === CandidateCategory.FRESHER ? "0-1" : "2-5";

      if (rawLevel) {
        const norm = normalizeExperienceTier(rawLevel, defaultCategory);
        if (norm) {
          category = norm.category;
          experienceTier = norm.tier;
        } else if (defaultCategory === CandidateCategory.EXPERIENCED) {
          errors.push(`Row ${i + 1}: Invalid experience level '${rawLevel}'. Expected '0-1', '2-5', '6-10', or '11-15'`);
          continue;
        }
      }

      valid.push({
        name,
        candidateEmail: email.toLowerCase(),
        level: experienceTier,
        category,
        experienceTier,
      });
    }

    return { valid, errors };
  }
}
