import { Injectable, Logger } from "@nestjs/common";
import * as fuzzball from "fuzzball";

export interface NameMatchResult {
  matched: boolean;
  similarity: number;
  threshold: number;
  extractedName: string;
  registeredName: string;
  normalizedExtractedName?: string;
  normalizedRegisteredName?: string;
}

@Injectable()
export class NameMatchService {
  private readonly logger = new Logger(NameMatchService.name);

  // Default similarity threshold placeholder (0.75 = 75% token sort similarity)
  private defaultThreshold = 0.75;

  /**
   * Normalizes a name string by removing honorifics, lowercasing,
   * stripping non-alphanumeric characters, and collapsing whitespace.
   */
  normalizeName(name: string): string {
    if (!name) return "";

    let normalized = name.toLowerCase().trim();

    // List of common Indian and general honorifics to strip
    const honorifics = [
      /\b(mr|mrs|ms|dr|prof|sri|shri|smt|shrimati|kumari|km)\b\.?/gi,
      /\b(father|mother|husband|wife|son|daughter)\s+of\b/gi,
      /\b(s\/o|d\/o|w\/o|c\/o)\b\.?/gi,
    ];

    for (const regex of honorifics) {
      normalized = normalized.replace(regex, " ");
    }

    // Remove punctuation & non-letter symbols (keep spaces and basic Latin letters)
    normalized = normalized.replace(/[^a-z\s]/gi, " ");

    // Collapse multi-spaces
    return normalized.replace(/\s+/g, " ").trim();
  }

  /**
   * Compares an extracted OCR name against a registered candidate name using token-sort ratio.
   */
  compareNames(
    registeredName: string,
    extractedName: string,
    customThreshold?: number,
  ): NameMatchResult {
    const threshold = customThreshold ?? this.defaultThreshold;

    const normReg = this.normalizeName(registeredName);
    const normExt = this.normalizeName(extractedName);

    if (!normReg || !normExt) {
      return {
        matched: false,
        similarity: 0.0,
        threshold,
        extractedName: extractedName || "",
        registeredName: registeredName || "",
        normalizedExtractedName: normExt,
        normalizedRegisteredName: normReg,
      };
    }

    // Fuzzball token_sort_ratio handles word reordering ("Vaishnavi S" vs "S Vaishnavi")
    const score0to100 = fuzzball.token_sort_ratio(normReg, normExt);
    const similarity = parseFloat((score0to100 / 100).toFixed(4));
    const matched = similarity >= threshold;

    return {
      matched,
      similarity,
      threshold,
      extractedName,
      registeredName,
      normalizedExtractedName: normExt,
      normalizedRegisteredName: normReg,
    };
  }
}
