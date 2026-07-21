import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class CandidateRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find existing candidates by email array.
   */
  async findCandidatesByEmails(emails: string[]) {
    if (emails.length === 0) return [];
    return this.prisma.candidate.findMany({
      where: { email: { in: emails } },
    });
  }

  /**
   * Find candidate profile by candidate ID.
   */
  async findCandidateById(candidateId: string) {
    return this.prisma.candidate.findUnique({
      where: { id: candidateId },
    });
  }
}
