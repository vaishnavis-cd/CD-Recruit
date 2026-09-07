import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { Candidate, ConsentRecord } from "@prisma/client";
import { ConsentTypeEnum } from "./consent.dto";

@Injectable()
export class CandidateRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find existing candidates by email array.
   */
  async findCandidatesByEmails(emails: string[]): Promise<Candidate[]> {
    if (emails.length === 0) return [];
    return this.prisma.candidate.findMany({
      where: { email: { in: emails } },
    });
  }

  /**
   * Find candidate profile by candidate ID.
   */
  async findCandidateById(candidateId: string): Promise<Candidate | null> {
    return this.prisma.candidate.findUnique({
      where: { id: candidateId },
    });
  }

  /**
   * Find or create a candidate record by email.
   */
  async upsertCandidate(email: string, name: string): Promise<Candidate> {
    return this.prisma.candidate.upsert({
      where: { email },
      update: { name: name || undefined },
      create: { email, name },
    });
  }

  /**
   * Lookup candidate ID associated with a given assessment session.
   */
  async findSessionCandidateId(sessionId: string): Promise<string | null> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { candidateId: true },
    });
    return session?.candidateId ?? null;
  }

  /**
   * Find an existing consent record for a candidate matching consent type and version.
   */
  async findConsentRecord(
    candidateId: string,
    consentType: ConsentTypeEnum,
    version: string,
  ): Promise<ConsentRecord | null> {
    return this.prisma.consentRecord.findFirst({
      where: {
        candidateId,
        consentType: consentType as any,
        version,
      },
      orderBy: { consentedAt: "desc" },
    });
  }

  /**
   * Persist a new consent record audit entry.
   */
  async createConsentRecord(
    candidateId: string,
    consentType: ConsentTypeEnum,
    version: string,
    ipAddress: string,
  ): Promise<ConsentRecord> {
    return this.prisma.consentRecord.create({
      data: {
        candidateId,
        consentType: consentType as any,
        version,
        ipAddress,
      },
    });
  }
}
