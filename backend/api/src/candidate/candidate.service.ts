import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Candidate } from "@prisma/client";
import { CandidateRepository } from "./candidate.repository";
import { ConsentTypeEnum } from "./consent.dto";

@Injectable()
export class CandidateService {
  private readonly logger = new Logger(CandidateService.name);

  constructor(private readonly candidateRepo: CandidateRepository) {}

  /**
   * Find an existing Candidate by email, or create one if none exists.
   *
   * Called by SessionService on every invite-token redemption. Candidates
   * are not created through a dedicated API — existence is a side-effect of
   * the first session-start for a given email address.
   *
   * Uses upsert so concurrent first-time redemptions for the same email are safe.
   */
  async findOrCreate(email: string, name: string): Promise<Candidate> {
    const candidate = await this.candidateRepo.upsertCandidate(email, name);
    this.logger.debug(`findOrCreate: candidate ${candidate.id} (${email})`);
    return candidate;
  }

  /**
   * Persist a consent record for a candidate, identified via their active session.
   *
   * Each consent step (TERMS, BIOMETRIC, SELFIE, AUDIO) must be recorded before
   * the candidate is allowed to advance. This satisfies DPDP Act (2023) §6 requirements
   * for explicit, granular consent records with timestamp and IP address.
   *
   * Idempotency: If consent for this candidate, step, and version has already been recorded,
   * returns the existing record without creating duplicate audit rows.
   */
  async recordConsent(
    sessionId: string,
    consentType: ConsentTypeEnum,
    version: string,
    ipAddress: string,
  ): Promise<{ id: string; consentedAt: string }> {
    // Look up candidate via session
    const candidateId = await this.candidateRepo.findSessionCandidateId(sessionId);

    if (!candidateId) {
      throw new NotFoundException(`Session not found: ${sessionId}`);
    }

    // Check if consent has already been recorded (idempotent submission)
    const existingRecord = await this.candidateRepo.findConsentRecord(
      candidateId,
      consentType,
      version,
    );

    if (existingRecord) {
      this.logger.debug(
        `Consent already recorded: candidateId=${candidateId} type=${consentType} version=${version} (id=${existingRecord.id})`,
      );
      return {
        id: existingRecord.id,
        consentedAt: existingRecord.consentedAt.toISOString(),
      };
    }

    // Create new consent record
    const record = await this.candidateRepo.createConsentRecord(
      candidateId,
      consentType,
      version,
      ipAddress,
    );

    this.logger.log(
      `Consent recorded: candidateId=${candidateId} type=${consentType} version=${version}`,
    );

    return {
      id: record.id,
      consentedAt: record.consentedAt.toISOString(),
    };
  }

  /**
   * Helper to retrieve candidate by ID via repository.
   */
  async getCandidateById(candidateId: string): Promise<Candidate | null> {
    return this.candidateRepo.findCandidateById(candidateId);
  }

  /**
   * Helper to retrieve candidates by emails via repository.
   */
  async getCandidatesByEmails(emails: string[]): Promise<Candidate[]> {
    return this.candidateRepo.findCandidatesByEmails(emails);
  }
}
