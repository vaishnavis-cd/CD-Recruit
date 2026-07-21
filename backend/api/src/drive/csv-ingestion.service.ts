import { Injectable, BadRequestException } from "@nestjs/common";

export interface ParsedCandidateRow {
  name: string;
  candidateEmail: string;
}

export interface CsvParseResult {
  valid: ParsedCandidateRow[];
  errors: string[];
}

@Injectable()
export class CsvIngestionService {
  private readonly emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  /**
   * Parse a raw CSV text content or buffer into structured candidate rows.
   */
  parseCandidateCsv(csvContent: string): CsvParseResult {
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

    if (nameIdx === -1 || emailIdx === -1) {
      throw new BadRequestException("CSV headers must contain 'name' and 'email' columns");
    }

    const valid: ParsedCandidateRow[] = [];
    const errors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const columns = lines[i].split(",").map((c) => c.trim());
      const name = columns[nameIdx] ?? "";
      const email = columns[emailIdx] ?? "";

      if (!name || !email) {
        errors.push(`Row ${i + 1}: Missing name or email`);
        continue;
      }

      if (!this.emailRegex.test(email)) {
        errors.push(`Row ${i + 1}: Invalid email address '${email}'`);
        continue;
      }

      valid.push({ name, candidateEmail: email.toLowerCase() });
    }

    return { valid, errors };
  }
}
