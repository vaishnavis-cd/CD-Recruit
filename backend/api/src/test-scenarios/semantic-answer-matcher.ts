import { Logger } from "@nestjs/common";

export interface MatchResult {
  score: number; // 0 to 100
  matchedConcepts: string[];
  missingConcepts: string[];
  matchType: "exact" | "semantic_fallback" | "none";
}

export class SemanticAnswerMatcher {
  private static readonly logger = new Logger(SemanticAnswerMatcher.name);

  // Common engineering synonyms mapping
  private static readonly SYNONYM_MAP: Record<string, string[]> = {
    bug: ["defect", "issue", "problem", "error", "failure"],
    fix: ["resolve", "remediate", "correct", "address", "patch", "implement", "implementing"],
    test: ["verify", "validate", "check", "run", "execute", "perform", "testing", "tests"],
    caller: ["client", "consumer", "dependent", "user"],
    affected: ["impacted", "changed", "modified", "dependent"],
    requirements: ["specification", "specs", "criteria", "guidelines"],
    reproduce: ["recreate", "simulate", "trigger", "problem", "failure"],
    investigate: ["identify", "find", "determine", "analyze", "debug"],
    clarify: ["understand", "explain", "confirm", "ask", "investigate", "analyse", "analyze"],
    coding: ["code", "program", "programming", "develop", "developing", "write", "writing", "implement", "implementing", "fix"],
    regression: ["behavior", "functionality", "changed", "impacted"],
    secret: ["key", "keys", "credential", "credentials", "token", "tokens", "password"],
    exposure: ["leak", "leaked", "leakage", "compromise"],
    procedures: ["procedure", "process", "policy", "policies", "protocol", "protocols"],
    query: ["execution", "search", "request", "call"],
    cardinality: ["rows", "row", "counts", "count", "size"],
    shape: ["structure", "form", "pattern", "syntax"],
    growth: ["growing", "grow", "increase", "expansion"],
    remove: ["delete", "leaked", "destroy", "clear", "strip", "rotate", "eliminate", "restrict"],
    security: ["incident", "safety", "safeguard", "compliance", "procedures"],
  };

  // Stop words to ignore during token overlap matching
  private static readonly STOP_WORDS = new Set([
    "a", "an", "the", "and", "or", "but", "if", "then", "else", "when", 
    "at", "by", "for", "with", "about", "against", "between", "into", 
    "through", "during", "before", "after", "above", "below", "to", 
    "from", "up", "down", "in", "out", "on", "off", "over", "under", 
    "again", "further", "then", "once", "here", "there", "all", "any", 
    "both", "each", "few", "more", "most", "other", "some", "such", 
    "own", "same", "so", "than", "too", "very", "s", "t", "can", "will", 
    "just", "should", "now", "d", "ll", "m", "o", "re", "ve", "y", "plus"
  ]);

  // Negation words to protect meaning
  private static readonly NEGATION_WORDS = new Set([
    "not", "never", "without", "dont", "shouldnt", "avoid", "cannot", "cant", "no", "didnt", "wont", "ignore"
  ]);

  private static readonly TECH_PHRASES = [
    "root cause",
    "regression test",
    "regression testing",
    "affected caller",
    "affected callers",
    "impacted caller",
    "impacted callers",
    "unit test",
    "unit testing",
    "integration test",
    "integration testing",
    "reproduce issue",
    "reproduce bug",
    "reproduce problem",
    "implement fix",
    "validation logic",
    "database constraint",
    "security procedures",
    "security procedure",
    "incident process",
    "query plan",
    "execution plan",
    "data growth",
    "dataset growth",
    "query shape",
    "query structure",
  ];

  private static readonly GENERIC_VERBS = new Set([
    "use", "run", "do", "make", "have", "get", "go", "take", "put", "find", "identify", "show", "give", "write", "need", "should", "must", "follow", "remove", "check"
  ]);

  /**
   * Normalizes text by lowercasing, replacing punctuation with spaces,
   * removing multiple spaces, and returning a clean string.
   */
  public static normalizeText(text: string): string {
    if (!text) return "";
    return text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // remove unicode accents
      .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()\[\]?\"']/g, " ") // replace punctuation with spaces
      .replace(/\s+/g, " ") // collapse multiple spaces
      .trim();
  }

  /**
   * Simple morphological normalization to handle basic plurals and forms.
   * Avoids destructive stemming of technical terms.
   */
  private static stemWord(word: string): string {
    // Keep critical technical terms untouched
    const exceptions = new Set(["authentication", "authorization", "postgres", "redis", "nosql", "dns", "os"]);
    if (exceptions.has(word) || word.length <= 3) return word;

    if (word.endsWith("ies")) {
      return word.slice(0, -3) + "y";
    }
    if (word.endsWith("es") && !word.endsWith("aes") && !word.endsWith("ees") && !word.endsWith("oes")) {
      return word.slice(0, -2);
    }
    if (word.endsWith("s") && !word.endsWith("ss") && !word.endsWith("is") && !word.endsWith("us")) {
      return word.slice(0, -1);
    }
    return word;
  }

  /**
   * Helper to check if two tokens are semantically equivalent (direct or synonyms).
   */
  private static areTokensEquivalent(tok1: string, tok2: string): boolean {
    const stem1 = this.stemWord(tok1);
    const stem2 = this.stemWord(tok2);
    if (stem1 === stem2) return true;

    // Check synonym map
    for (const [key, synonyms] of Object.entries(this.SYNONYM_MAP)) {
      const isTok1Syn = key === stem1 || synonyms.includes(stem1);
      const isTok2Syn = key === stem2 || synonyms.includes(stem2);
      if (isTok1Syn && isTok2Syn) return true;
    }

    return false;
  }

  /**
   * Check if a phrase concept is present in the normalized answer text.
   */
  private static isConceptPresent(conceptPhrase: string, normalizedAnswer: string): boolean {
    const conceptTokens = conceptPhrase.split(/\s+/).filter(t => t.length > 0);
    if (conceptTokens.length === 0) return false;

    const answerTokens = normalizedAnswer.split(/\s+/).filter(t => t.length > 0 && !this.STOP_WORDS.has(t));

    // For multi-word phrases, we look for consecutive matches with synonym tolerance
    for (let i = 0; i <= answerTokens.length - conceptTokens.length; i++) {
      let phraseMatched = true;
      for (let j = 0; j < conceptTokens.length; j++) {
        if (!this.areTokensEquivalent(conceptTokens[j], answerTokens[i + j])) {
          phraseMatched = false;
          break;
        }
      }
      if (phraseMatched) return true;
    }
    return false;
  }

  /**
   * Extracts multi-word phrase concepts and key terms from the expected answer.
   */
  public static extractConcepts(expectedAnswer: string): string[] {
    const normalized = this.normalizeText(expectedAnswer);
    const cleanTokens = normalized.split(/\s+/).filter(t => !this.STOP_WORDS.has(t) && t.length > 0);
    let remainingText = cleanTokens.join(" ");

    const concepts: string[] = [];

    // 1. First extract known technical phrases from expected text
    for (const phrase of this.TECH_PHRASES) {
      const phraseTokens = phrase.split(/\s+/);
      // Check if all tokens of the phrase exist consecutively in the remaining text
      let found = false;
      const remainingTokens = remainingText.split(/\s+/);
      for (let i = 0; i <= remainingTokens.length - phraseTokens.length; i++) {
        let match = true;
        for (let j = 0; j < phraseTokens.length; j++) {
          if (!this.areTokensEquivalent(phraseTokens[j], remainingTokens[i + j])) {
            match = false;
            break;
          }
        }
        if (match) {
          found = true;
          break;
        }
      }

      if (found) {
        concepts.push(phrase);
        // Remove the phrase from remainingText to avoid double matching as single words
        remainingText = remainingTokens.filter((_, idx) => {
          // Check if index falls in matched range
          const matchStart = remainingTokens.findIndex((_, startIdx) => {
            let subMatch = true;
            for (let j = 0; j < phraseTokens.length; j++) {
              if (startIdx + j >= remainingTokens.length || !this.areTokensEquivalent(phraseTokens[j], remainingTokens[startIdx + j])) {
                subMatch = false;
                break;
              }
            }
            return subMatch;
          });
          return matchStart === -1 || idx < matchStart || idx >= matchStart + phraseTokens.length;
        }).join(" ");
      }
    }

    // 2. Add remaining single words as concepts
    const remainingWords = remainingText.split(/\s+/).filter(t => t.length > 2);
    for (const word of remainingWords) {
      if (!this.GENERIC_VERBS.has(word)) {
        concepts.push(word);
      }
    }

    return Array.from(new Set(concepts));
  }

  /**
   * Detects if there is a mismatch in negation states.
   * Compares the parity (odd/even) of negation counts to handle double negations correctly.
   */
  private static detectNegationMismatch(candNorm: string, expNorm: string): boolean {
    const candTokens = candNorm.split(/\s+/);
    const expTokens = expNorm.split(/\s+/);

    const candNegCount = candTokens.filter(t => this.NEGATION_WORDS.has(t)).length;
    const expNegCount = expTokens.filter(t => this.NEGATION_WORDS.has(t)).length;

    return (candNegCount % 2) !== (expNegCount % 2);
  }

  /**
   * Main answer matching logic.
   */
  public static matchAnswer(candidateAnswer: string, expectedAnswer: string): MatchResult {
    const candNorm = this.normalizeText(candidateAnswer);
    const expNorm = this.normalizeText(expectedAnswer);

    if (!candNorm || !expNorm) {
      return { score: 0, matchedConcepts: [], missingConcepts: [], matchType: "none" };
    }

    // 1. Exact Match Check
    if (candNorm === expNorm) {
      const concepts = this.extractConcepts(expectedAnswer);
      return {
        score: 100,
        matchedConcepts: concepts,
        missingConcepts: [],
        matchType: "exact"
      };
    }

    // 2. Negation Check: If negation state doesn't match, cap maximum possible score at 0
    if (this.detectNegationMismatch(candNorm, expNorm)) {
      this.logger.debug("Negation mismatch detected. Capping score at 0.");
      const concepts = this.extractConcepts(expectedAnswer);
      return {
        score: 0,
        matchedConcepts: [],
        missingConcepts: concepts,
        matchType: "none"
      };
    }

    // 3. Concept Coverage Evaluation
    const expectedConcepts = this.extractConcepts(expectedAnswer);
    if (expectedConcepts.length === 0) {
      // Fallback to simple token overlap if no concepts extracted
      const expTokens = expNorm.split(/\s+/).filter(t => !this.STOP_WORDS.has(t) && t.length > 2);
      const candTokens = candNorm.split(/\s+/).filter(t => t.length > 0);
      if (expTokens.length === 0) return { score: 100, matchedConcepts: [], missingConcepts: [], matchType: "exact" };

      let matches = 0;
      for (const t of expTokens) {
        if (candTokens.some(ct => this.areTokensEquivalent(t, ct))) {
          matches++;
        }
      }
      const score = Math.round((matches / expTokens.length) * 100);
      return {
        score,
        matchedConcepts: [],
        missingConcepts: [],
        matchType: "semantic_fallback"
      };
    }

    const matchedConcepts: string[] = [];
    const missingConcepts: string[] = [];

    for (const concept of expectedConcepts) {
      if (this.isConceptPresent(concept, candNorm)) {
        matchedConcepts.push(concept);
      } else {
        missingConcepts.push(concept);
      }
    }

    // Calculate score based on concept coverage percentage
    const rawScore = (matchedConcepts.length / expectedConcepts.length) * 100;
    const score = Math.min(100, Math.max(0, Math.round(rawScore)));

    return {
      score,
      matchedConcepts,
      missingConcepts,
      matchType: "semantic_fallback"
    };
  }
}
