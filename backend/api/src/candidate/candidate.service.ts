import { Injectable, Logger } from "@nestjs/common";
import { Candidate } from "@prisma/client";
import { PrismaService } from "@app/prisma/prisma.service";

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
      update: {}, // existing candidates are not mutated on re-entry
      create: { email, name },
    });

    this.logger.debug(`findOrCreate: candidate ${candidate.id} (${email})`);
    return candidate;
  }
}
