import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Candidate } from "@prisma/client";
import { PrismaService } from "@app/prisma/prisma.service";
import { ConsentTypeEnum } from "./consent.dto";

@Injectable()
export class CandidateService {
  private readonly logger = new Logger(CandidateService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find an existing Candidate by email, or create one if none exists.
   *
   * Called by SessionService on every invite-token redemption.  Candidates
   * are not created through a dedicated API — existence is a side-effect of
   * the first session-start for a given email address.
   *
   * Uses upsert so concurrent first-time redemptions for the same email are safe.
   */
  async findOrCreate(email: string, name: string): Promise<Candidate> {
    const candidate = await this.prisma.candidate.upsert({
      where: { email },
      update: { name: name || undefined },
      create: { email, name },
    });

    this.logger.debug(`findOrCreate: candidate ${candidate.id} (${email})`);
    return candidate;
  }

  /**
   * Persist a consent record for a candidate, identified via their active session.
   *
   * Each consent step (TERMS, BIOMETRIC, SELFIE, AUDIO) must be recorded before
   * the candidate is allowed to advance. This satisfies DPDP Act (2023) §6 requirements
   * for explicit, granular consent records with timestamp and IP address.
   */
  async recordConsent(
    sessionId: string,
    consentType: ConsentTypeEnum,
    version: string,
    ipAddress: string,
  ): Promise<{ id: string; consentedAt: string }> {
    // Look up candidate via session
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { candidateId: true },
    });

    if (!session) {
      throw new NotFoundException(`Session not found: ${sessionId}`);
    }

    const record = await this.prisma.consentRecord.create({
      data: {
        candidateId: session.candidateId,
        consentType: consentType as any,
        version,
        ipAddress,
      },
    });

    this.logger.log(
      `Consent recorded: candidateId=${session.candidateId} type=${consentType} version=${version}`,
    );

    return {
      id: record.id,
      consentedAt: record.consentedAt.toISOString(),
    };
  }
}
