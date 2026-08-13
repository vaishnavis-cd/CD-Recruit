import { Injectable, BadRequestException } from "@nestjs/common";
import { SQL_VALIDATION_PATTERNS } from "./sql.constants";

export type SqlQuestionType = "SELECT_ONLY" | "DML_ALLOWED";

@Injectable()
export class SqlValidatorService {
  /**
   * Pre-check candidate SQL query before any database execution.
   * Fast-fails disallowed statements or unsafe input patterns.
   */
  validateCandidateQuery(query: string, questionType: SqlQuestionType = "SELECT_ONLY"): void {
    if (!query || typeof query !== "string" || !query.trim()) {
      throw new BadRequestException("Query string cannot be empty.");
    }

    const trimmed = query.trim();

    // Remove comments for checks
    const cleanQuery = trimmed
      .replace(/--.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .trim();

    // Remove string literals for MULTI_STATEMENT checks to prevent false positives on semicolons inside strings
    const withoutStrings = cleanQuery
      .replace(/'([^'\\]|\\.)*'/g, "''")
      .replace(/"([^"\\]|\\.)*"/g, '""')
      .replace(/\$\$[\s\S]*?\$\$/g, '$$$$');

    const withoutTrailingSemicolon = withoutStrings.replace(/;\s*$/, "");

    // 1. Reject multi-statement queries (anything with content after a semicolon)
    if (SQL_VALIDATION_PATTERNS.MULTI_STATEMENT.test(withoutTrailingSemicolon)) {
      throw new BadRequestException("Only a single SQL statement is allowed.");
    }

    // 2. Reject non-SELECT/WITH queries if question specifies SELECT_ONLY
    if (questionType === "SELECT_ONLY" && !SQL_VALIDATION_PATTERNS.ALLOWED_START.test(cleanQuery)) {
      throw new BadRequestException("Only SELECT or WITH queries are permitted for this question.");
    }

    // 3. Reject forbidden functions and administration keywords
    if (SQL_VALIDATION_PATTERNS.FORBIDDEN_KEYWORDS.test(cleanQuery)) {
      throw new BadRequestException("This query contains a disallowed function or operation.");
    }
  }
}
