import { Logger } from "@nestjs/common";

export class RakeExtractor {
  // A simple list of common English stop words
  private static readonly STOP_WORDS = new Set([
    "a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any", "are", "aren't", "as", "at",
    "be", "because", "been", "before", "being", "below", "between", "both", "but", "by", "can't", "cannot", "could",
    "couldn't", "did", "didn't", "do", "does", "doesn't", "doing", "don't", "down", "during", "each", "few", "for",
    "from", "further", "had", "hadn't", "has", "hasn't", "have", "haven't", "having", "he", "he'd", "he'll", "he's",
    "her", "here", "here's", "hers", "herself", "him", "himself", "his", "how", "how's", "i", "i'd", "i'll", "i'm",
    "i've", "if", "in", "into", "is", "isn't", "it", "it's", "its", "itself", "let's", "me", "more", "most", "mustn't",
    "my", "myself", "no", "nor", "not", "of", "off", "on", "once", "only", "or", "other", "ought", "our", "ours",
    "ourselves", "out", "over", "own", "same", "shan't", "she", "she'd", "she'll", "she's", "should", "shouldn't",
    "so", "some", "such", "than", "that", "that's", "the", "their", "theirs", "them", "themselves", "then", "there",
    "there's", "these", "they", "they'd", "they'll", "they're", "they've", "this", "those", "through", "to", "too",
    "under", "until", "up", "very", "was", "wasn't", "we", "we'd", "we'll", "we're", "we've", "were", "weren't",
    "what", "what's", "when", "when's", "where", "where's", "which", "while", "who", "who's", "whom", "why", "why's",
    "with", "won't", "would", "wouldn't", "you", "you'd", "you'll", "you're", "you've", "your", "yours", "yourself",
    "yourselves"
  ]);

  /**
   * Extracts keywords from text.
   */
  public static extract(text: string): string[] {
    if (!text || !text.trim()) return [];

    // 1. Split text into sentences using punctuation
    const sentences = text.toLowerCase().split(/[.,\/#!$%\^&\*;:{}=\-_`~()?\n\r]/);

    // 2. Extract candidate phrases by splitting sentences on stop words
    const candidatePhrases: string[][] = [];
    for (const sentence of sentences) {
      const words = sentence.trim().split(/\s+/).filter(Boolean);
      if (words.length === 0) continue;

      let currentPhrase: string[] = [];
      for (const word of words) {
        // Clean word from non-alphanumeric chars
        const cleanWord = word.replace(/[^a-z0-9]/g, "");
        if (cleanWord.length === 0) continue;

        if (this.STOP_WORDS.has(cleanWord)) {
          if (currentPhrase.length > 0) {
            candidatePhrases.push(currentPhrase);
            currentPhrase = [];
          }
        } else {
          currentPhrase.push(cleanWord);
        }
      }
      if (currentPhrase.length > 0) {
        candidatePhrases.push(currentPhrase);
      }
    }

    // 3. Compute word frequencies and degrees (co-occurrences)
    const wordFreq: Record<string, number> = {};
    const wordDegree: Record<string, number> = {};

    for (const phrase of candidatePhrases) {
      const degree = phrase.length - 1;
      for (const word of phrase) {
        wordFreq[word] = (wordFreq[word] || 0) + 1;
        wordDegree[word] = (wordDegree[word] || 0) + degree;
      }
    }

    // Add freq to degree (standard RAKE degree calculation includes self)
    for (const word in wordFreq) {
      wordDegree[word] = (wordDegree[word] || 0) + wordFreq[word];
    }

    // 4. Calculate word scores
    const wordScores: Record<string, number> = {};
    for (const word in wordFreq) {
      wordScores[word] = wordDegree[word] / wordFreq[word];
    }

    // 5. Score candidate phrases
    const phraseScores: Array<{ phrase: string; score: number }> = [];
    const uniquePhrases = new Set<string>();

    for (const phrase of candidatePhrases) {
      const phraseStr = phrase.join(" ");
      if (uniquePhrases.has(phraseStr)) continue;
      uniquePhrases.add(phraseStr);

      let score = 0;
      for (const word of phrase) {
        score += wordScores[word] || 0;
      }
      phraseScores.push({ phrase: phraseStr, score });
    }

    // 6. Sort and return top candidates (e.g. top 1/3 or top 10)
    phraseScores.sort((a, b) => b.score - a.score);
    
    // Select top 8 or 1/3 of candidates
    const limit = Math.max(3, Math.min(8, Math.ceil(phraseScores.length / 3)));
    return phraseScores.slice(0, limit).map(p => p.phrase);
  }
}

export interface GuardrailValidationResult {
  passed: boolean;
  error?: string;
  failedStep?: number;
}

const logger = new Logger("AiPromptingGuardrails");

/**
 * Validates candidate's prompt submission against the 4 sequential guardrails.
 */
export function validatePromptGuardrails(
  prompt: string,
  content: any,
  scoringConfig: any
): GuardrailValidationResult {
  if (!prompt || !prompt.trim()) {
    return {
      passed: false,
      error: "Your prompt is too short. Please write a focused prompt addressing the scenario.",
      failedStep: 1
    };
  }

  // ----------------------------------------------------
  // STEP 1 — LENGTH CHECK
  // ----------------------------------------------------
  const words = prompt.trim().split(/\s+/).filter(Boolean);
  if (words.length < 10 || words.length > 300) {
    return {
      passed: false,
      error: "Your prompt is too short/long. Please write a focused prompt addressing the scenario.",
      failedStep: 1
    };
  }

  // ----------------------------------------------------
  // STEP 2 — PASTED CODE DETECTION
  // ----------------------------------------------------
  let symbolCount = 0;
  if (prompt.includes("{")) symbolCount++;
  if (prompt.includes("}")) symbolCount++;
  if (prompt.includes(";")) symbolCount++;
  if (prompt.includes("()") || /\(\)/.test(prompt)) symbolCount++;
  if (prompt.includes("=>")) symbolCount++;
  const hasCodeSymbols = symbolCount >= 2;

  const codeKeywords = [
    /\bdef\b/i,
    /\bfunction\b/i,
    /\bclass\b/i,
    /console\.log/i,
    /System\.out/i,
    /\bselect\b/i,
    /\bimport\b/i,
    /#include/i,
    /public\s+static/i,
    /\breturn\b/i
  ];
  let keywordCount = 0;
  for (const regex of codeKeywords) {
    if (regex.test(prompt)) keywordCount++;
  }
  const hasKeywords = keywordCount >= 2;

  // Check indentation pattern
  const lines = prompt.split("\n");
  let consecutiveIndentedLines = 0;
  let hasIndentationPattern = false;
  for (const line of lines) {
    if (/^[ \t]{4,}\S/.test(line)) {
      consecutiveIndentedLines++;
      if (consecutiveIndentedLines >= 2) {
        hasIndentationPattern = true;
        break;
      }
    } else if (line.trim().length > 0) {
      consecutiveIndentedLines = 0;
    }
  }

  let codeSignalsCount = 0;
  if (hasCodeSymbols) codeSignalsCount++;
  if (hasKeywords) codeSignalsCount++;
  if (hasIndentationPattern) codeSignalsCount++;

  if (codeSignalsCount >= 2) {
    return {
      passed: false,
      error: "This module evaluates prompt writing, not code submission. Please describe your approach in natural language.",
      failedStep: 2
    };
  }

  // ----------------------------------------------------
  // STEP 3 — CODE-REQUEST INTENT DETECTION
  // ----------------------------------------------------
  const lowerPrompt = prompt.toLowerCase();
  const sanitizedPrompt = lowerPrompt
    .replace(/error code/g, "safe_phrase")
    .replace(/zip code/g, "safe_phrase")
    .replace(/code of conduct/g, "safe_phrase");

  // Tier 2 words
  const tier2Words = ["script", "snippet", "syntax", "pseudocode", "compile", "executable"];
  let hasTier2 = false;
  for (const word of tier2Words) {
    if (new RegExp(`\\b${word}\\b`).test(sanitizedPrompt)) {
      hasTier2 = true;
      break;
    }
  }

  if (hasTier2) {
    return {
      passed: false,
      error: "This module doesn't generate code. Please write a prompt that addresses the business scenario directly.",
      failedStep: 3
    };
  }

  // Tier 1 words
  const tier1Words = ["solution", "function", "logic", "code", "program"];
  const questionAllowlist: string[] = (scoringConfig?.allowlist || content?.allowlist || []).map((w: string) => w.toLowerCase());

  let hasTier1 = false;
  for (const word of tier1Words) {
    if (questionAllowlist.includes(word)) continue; // Safe/expected word for this question
    if (new RegExp(`\\b${word}\\b`).test(sanitizedPrompt)) {
      hasTier1 = true;
      break;
    }
  }

  if (hasTier1) {
    // Check Anchors
    // Anchor A: Programming Languages
    const languages = ["python", "javascript", "java", "c++", "sql", "html", "css", "node", "react", "typescript", "ruby", "golang", "rust"];
    let hasLanguageAnchor = false;
    for (const lang of languages) {
      if (new RegExp(`\\b${lang.replace("+", "\\+")}\\b`).test(sanitizedPrompt)) {
        hasLanguageAnchor = true;
        break;
      }
    }

    // Anchor B: Code Symbols
    const hasSymbolsAnchor = prompt.includes("{") || prompt.includes("}") || prompt.includes(";") || prompt.includes("=>") || /\(\)/.test(prompt);

    // Anchor C: Dev tools
    const devTools = ["compile", "debug", "syntax error", "ide", "console", "terminal", "line of code"];
    let hasDevToolsAnchor = false;
    for (const tool of devTools) {
      if (sanitizedPrompt.includes(tool)) {
        hasDevToolsAnchor = true;
        break;
      }
    }

    // Anchor D: Explicit Phrases
    const explicitPhrases = ["write the code", "give me the code", "code for this", "the code to solve", "code that does"];
    let hasExplicitPhraseAnchor = false;
    for (const phrase of explicitPhrases) {
      if (sanitizedPrompt.includes(phrase)) {
        hasExplicitPhraseAnchor = true;
        break;
      }
    }

    if (hasLanguageAnchor || hasSymbolsAnchor || hasDevToolsAnchor || hasExplicitPhraseAnchor) {
      return {
        passed: false,
        error: "This module doesn't generate code. Please write a prompt that addresses the business scenario directly.",
        failedStep: 3
      };
    }
  }

  // ----------------------------------------------------
  // STEP 4 — RELEVANCE / OFF-TOPIC CHECK
  // ----------------------------------------------------
  const questionKeywords: string[] = content?.extractedKeywords || scoringConfig?.extractedKeywords || [];
  const questionTopic = content?.title || content?.prompt || "the technical scenario";

  if (questionKeywords.length > 0) {
    const promptCleanWords = lowerPrompt.split(/\s+/).map(w => w.replace(/[^a-z0-9]/g, "")).filter(Boolean);
    let keywordMatches = 0;

    for (const keyword of questionKeywords) {
      const keywordLower = keyword.toLowerCase();
      // Check full keyword phrase match
      if (lowerPrompt.includes(keywordLower)) {
        keywordMatches++;
        continue;
      }

      // Check partial/stemmed match of words in keyword phrase
      const kwWords = keywordLower.split(/\s+/).filter(Boolean);
      for (const kwWord of kwWords) {
        const isMatch = promptCleanWords.some(pWord => 
          pWord === kwWord ||
          (kwWord.length >= 4 && pWord.startsWith(kwWord.substring(0, kwWord.length - 2))) ||
          (pWord.length >= 4 && kwWord.startsWith(pWord.substring(0, pWord.length - 2)))
        );
        if (isMatch) {
          keywordMatches++;
          break; // Matched this keyword phrase
        }
      }
    }

    // Secondary named-entity check: Capitalized words excluding first word of sentences
    const sentences = prompt.split(/[.!?]/);
    const capitalizedEntities: string[] = [];
    for (const sentence of sentences) {
      const sentenceWords = sentence.trim().split(/\s+/).filter(Boolean);
      if (sentenceWords.length <= 1) continue;
      // Check words after first word
      for (let i = 1; i < sentenceWords.length; i++) {
        const word = sentenceWords[i];
        if (/^[A-Z][a-zA-Z]*$/.test(word)) {
          capitalizedEntities.push(word.toLowerCase().replace(/[^a-z0-9]/g, ""));
        }
      }
    }

    const questionWords = new Set(
      (content?.prompt || content?.text || "")
        .toLowerCase()
        .split(/\s+/)
        .map(w => w.replace(/[^a-z0-9]/g, ""))
        .filter(Boolean)
    );

    let entityOverlap = 0;
    for (const entity of capitalizedEntities) {
      if (questionWords.has(entity)) {
        entityOverlap++;
      }
    }

    // Relevance verification
    if (keywordMatches === 0) {
      // Check if named entity heuristic rescues it (borderline pass)
      const hasEntities = capitalizedEntities.length > 0;
      const hasOverlap = entityOverlap > 0;
      if (hasEntities && hasOverlap) {
        logger.log("Borderline pass granted via capitalized entities overlap.");
      } else {
        return {
          passed: false,
          error: `Your prompt doesn't reference the given scenario. Please write a prompt that directly addresses ${questionTopic}.`,
          failedStep: 4
        };
      }
    }
  }

  return { passed: true };
}
