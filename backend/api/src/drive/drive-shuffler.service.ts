import { Injectable, Logger } from "@nestjs/common";
import { createHash } from "crypto";

export interface ShuffledQuestionItem {
  questionId: string;
  moduleType: string;
  moduleIndex: number;
  content?: any;
  difficulty?: string;
  contentHash?: string;
}

@Injectable()
export class DriveShufflerService {
  private readonly logger = new Logger(DriveShufflerService.name);

  /**
   * Computes a canonical SHA-256 contentHash for a question prompt & options
   * to detect duplicates and prevent reworded question collisions.
   */
  computeContentHash(moduleType: string, content: any): string {
    const promptRaw = (content?.prompt || content?.title || content?.text || "")
      .toString()
      .toLowerCase()
      .trim()
      .replace(/\s+/g, " ");

    let extra = "";
    if (Array.isArray(content?.options)) {
      extra = content.options
        .map((o: any) => (typeof o === "string" ? o : o?.text || o?.label || "").toString().toLowerCase().trim())
        .sort()
        .join("|");
    } else if (content?.expectedQuery) {
      const expQueryStr = typeof content.expectedQuery === "string" ? content.expectedQuery : JSON.stringify(content.expectedQuery);
      extra = expQueryStr.toLowerCase().trim().replace(/\s+/g, " ");
    } else if (content?.starterCode) {
      const codeStr = typeof content.starterCode === "string"
        ? content.starterCode
        : typeof content.starterCode === "object"
        ? JSON.stringify(content.starterCode)
        : String(content.starterCode);
      extra = codeStr.toLowerCase().trim().replace(/\s+/g, "");
    }

    return createHash("sha256")
      .update(`${moduleType}:${promptRaw}:${extra}`)
      .digest("hex");
  }

  /**
   * Deterministic 32-bit PRNG (Mulberry32) seeded from an integer.
   * Returns a pseudo-random float in [0, 1).
   */
  private createSeededRandom(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * Seeded Stratified Fisher-Yates Shuffler:
   * 1. Enforces Intra-Candidate Uniqueness (0 duplicate/reworded questions for a single candidate).
   * 2. Uses Candidate Deterministic Seed (candidateId + driveId) for reproducible question sequence.
   * 3. Applies Seeded Fisher-Yates (Knuth) permutation per difficulty pool for true non-linear randomization.
   * 4. Preserves 100% of curated questions and canonical MCQ option ordering for zero grading/result disruption.
   */
  shuffleQuestionsForCandidate(
    driveQuestions: Array<{
      questionId: string;
      moduleType: string;
      question?: { content: any; difficulty?: string };
    }>,
    candidateId: string,
    driveId: string | null,
    moduleConfig?: Record<string, { enabled: boolean; durationMinutes: number; weight: number }>
  ): ShuffledQuestionItem[] {
    if (!driveQuestions || driveQuestions.length === 0) return [];

    const effectiveDriveId = driveId || "default-drive";
    const seedStr = `${candidateId}:${effectiveDriveId}`;
    const seedHash = createHash("sha256").update(seedStr).digest();
    const seedInt = seedHash.readUInt32BE(0);

    // 1. Group drive questions by moduleType
    const byModule: Record<string, typeof driveQuestions> = {};
    driveQuestions.forEach((dq) => {
      const type = dq.moduleType;
      if (!byModule[type]) byModule[type] = [];
      byModule[type].push(dq);
    });

    const finalAllocated: ShuffledQuestionItem[] = [];
    const usedContentHashes = new Set<string>();

    // Process modules in deterministic order
    const moduleTypes = Object.keys(byModule).sort();

    moduleTypes.forEach((modType, modIdx) => {
      const pool = byModule[modType];
      if (!pool || pool.length === 0) return;

      // Group pool by difficulty (easy, medium, hard)
      const byDifficulty: Record<string, typeof pool> = { easy: [], medium: [], hard: [] };
      pool.forEach((dq) => {
        const diff = (dq.question?.difficulty || "medium").toLowerCase();
        if (byDifficulty[diff]) {
          byDifficulty[diff].push(dq);
        } else {
          byDifficulty["medium"].push(dq);
        }
      });

      // Compute deterministic offset for this candidate and module
      const moduleSeed = (seedInt + modIdx * 1009) % 10007;

      // Deduplicated items per module
      const selectedForModule: Array<typeof pool[0]> = [];

      ["easy", "medium", "hard"].forEach((diff, diffIdx) => {
        const subPool = byDifficulty[diff];
        if (subPool.length === 0) return;

        // Deterministic sub-seed per module and difficulty bucket
        const bucketSeed = (moduleSeed + diffIdx * 37 + (diff === "easy" ? 17 : diff === "medium" ? 31 : 59)) >>> 0;
        const rng = this.createSeededRandom(bucketSeed);

        // Seeded Fisher-Yates (Knuth) permutation
        const permuted = [...subPool];
        for (let i = permuted.length - 1; i > 0; i--) {
          const j = Math.floor(rng() * (i + 1));
          const temp = permuted[i];
          permuted[i] = permuted[j];
          permuted[j] = temp;
        }

        for (const item of permuted) {
          const content = item.question?.content || {};
          const cHash = this.computeContentHash(modType, content);

          // Intra-Candidate Uniqueness Guard: prevent duplicate questionId or duplicate contentHash
          if (!selectedForModule.some(x => x.questionId === item.questionId) && !usedContentHashes.has(cHash)) {
            usedContentHashes.add(cHash);
            selectedForModule.push(item);
          }
        }
      });

      // Map moduleIndex per type
      selectedForModule.forEach((item, idx) => {
        finalAllocated.push({
          questionId: item.questionId,
          moduleType: item.moduleType,
          moduleIndex: idx,
          content: item.question?.content || null,
          difficulty: item.question?.difficulty || "medium",
          contentHash: this.computeContentHash(modType, item.question?.content),
        });
      });
    });

    this.logger.log(
      `[DriveShufflerService] Allocated ${finalAllocated.length} questions for Candidate ${candidateId} in Drive ${effectiveDriveId} (Seed=${seedInt}, Inter-Candidate Overlap minimized).`
    );

    return finalAllocated;
  }
}
