import { Injectable, Logger } from "@nestjs/common";
import { SqlQueryResult } from "./sql.types";

@Injectable()
export class ResultComparatorService {
  private readonly logger = new Logger(ResultComparatorService.name);

  /**
   * Normalize any value to a standard format for comparison.
   * e.g. dates to ISO string, numbers normalized, nulls mapped.
   */
  private normalizeValue(val: any): any {
    if (val === null || val === undefined) {
      return null;
    }
    if (val instanceof Date) {
      return val.toISOString();
    }
    if (typeof val === "number") {
      return val;
    }
    if (typeof val === "string") {
      const trimmed = val.trim();
      // If it looks like a numeric/decimal value, compare as a number
      if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
        const num = parseFloat(trimmed);
        if (!isNaN(num)) {
          return num;
        }
      }
      return trimmed;
    }
    return val;
  }

  /**
   * Sort the dataset rows to perform order-insensitive comparison.
   * We normalize all values before sorting.
   */
  private sortRows(rows: any[]): any[] {
    if (!Array.isArray(rows)) return [];
    return [...rows].sort((a, b) => {
      if (!a || typeof a !== "object") return -1;
      if (!b || typeof b !== "object") return 1;
      const canonicalA = JSON.stringify(
        Object.keys(a)
          .sort()
          .reduce((obj, key) => {
            obj[key] = this.normalizeValue(a[key]);
            return obj;
          }, {} as Record<string, any>),
      );
      const canonicalB = JSON.stringify(
        Object.keys(b)
          .sort()
          .reduce((obj, key) => {
            obj[key] = this.normalizeValue(b[key]);
            return obj;
          }, {} as Record<string, any>),
      );
      return canonicalA.localeCompare(canonicalB);
    });
  }

  /**
   * Compares the candidate dataset against the expected dataset.
   * Performs explicit column-set checking, row-count checking, and normalized canonical row comparison.
   */
  compare(candidateResult: SqlQueryResult, expectedResult: SqlQueryResult): boolean {
    try {
      if (!candidateResult || !expectedResult) {
        this.logger.debug("Comparison failed: missing candidate or expected query result object");
        return false;
      }

      // 1. Explicit Column-Set Comparison
      const candColsRaw = candidateResult.columns || [];
      const expColsRaw = expectedResult.columns || [];

      const candCols = candColsRaw.map((c) => String(c).toLowerCase()).sort();
      const expCols = expColsRaw.map((c) => String(c).toLowerCase()).sort();

      if (candCols.length !== expCols.length) {
        this.logger.debug(
          `Comparison failed: column count mismatch (candidate: ${candCols.length}, expected: ${expCols.length})`,
        );
        return false;
      }

      for (let i = 0; i < candCols.length; i++) {
        if (candCols[i] !== expCols[i]) {
          this.logger.debug(
            `Comparison failed: column mismatch at index ${i} (candidate: '${candCols[i]}', expected: '${expCols[i]}')`,
          );
          return false;
        }
      }

      // 2. Row count short-circuit check
      const candRows = candidateResult.rows || [];
      const expRows = expectedResult.rows || [];
      const candRowCount = candidateResult.rowCount !== undefined ? candidateResult.rowCount : candRows.length;
      const expRowCount = expectedResult.rowCount !== undefined ? expectedResult.rowCount : expRows.length;

      if (candRowCount !== expRowCount) {
        this.logger.debug(
          `Comparison failed: row count mismatch (candidate: ${candRowCount}, expected: ${expRowCount})`,
        );
        return false;
      }

      // 3. Sort rows of both datasets for order-insensitive comparison
      const sortedCandidate = this.sortRows(candRows);
      const sortedExpected = this.sortRows(expRows);

      // 4. Row-by-row canonical value comparison
      for (let i = 0; i < sortedCandidate.length; i++) {
        const candRow = sortedCandidate[i] || {};
        const expRow = sortedExpected[i] || {};

        const candKeys = Object.keys(candRow).sort();
        const expKeys = Object.keys(expRow).sort();

        for (let j = 0; j < candKeys.length; j++) {
          const cKey = candKeys[j];
          const eKey = expKeys[j];

          const cValNormalized = this.normalizeValue(candRow[cKey]);
          const eValNormalized = this.normalizeValue(expRow[eKey]);

          if (cValNormalized !== eValNormalized) {
            this.logger.debug(
              `Comparison failed at row ${i}, key '${cKey}': candidate value '${cValNormalized}' !== expected value '${eValNormalized}'`,
            );
            return false;
          }
        }
      }

      return true;
    } catch (err: any) {
      this.logger.error(`Error in ResultComparatorService: ${err.message}`);
      return false;
    }
  }
}
