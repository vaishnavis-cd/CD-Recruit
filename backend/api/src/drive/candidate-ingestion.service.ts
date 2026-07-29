import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuthService } from "../auth/auth.service";
import { InviteStatus } from "@prisma/client";
import * as crypto from "crypto";

export interface CandidateEntry {
  name: string;
  candidateEmail: string;
}

@Injectable()
export class CandidateIngestionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  /**
   * Process bulk candidate ingestion for a drive within a transaction or standalone.
   */
  async processBulkCandidates(
    tx: any,
    driveId: string,
    roleTemplateId: string,
    candidates: CandidateEntry[],
    staffId: string,
    isGenerated = false,
  ) {
    if (candidates.length === 0) {
      return { count: 0, createdCount: 0 };
    }

    const emails = candidates.map((c) => c.candidateEmail.trim().toLowerCase());
    const existingCandidates = await tx.candidate.findMany({
      where: { email: { in: emails } },
    });
    const existingEmails = new Set(existingCandidates.map((c: any) => c.email.toLowerCase()));

    // Query existing invites for this drive to block duplicate candidate emails per drive
    const existingDriveInvites = await tx.invite.findMany({
      where: { driveId },
      select: { candidateEmail: true },
    });
    const existingDriveEmails = new Set(
      existingDriveInvites.map((i: any) => i.candidateEmail.toLowerCase()),
    );

    const invitesData: any[] = [];
    const candidatesToCreate: any[] = [];

    const ttlHours = parseInt(process.env.INVITE_TOKEN_TTL_HOURS || "48", 10);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + ttlHours);

    for (const cand of candidates) {
      const emailLower = cand.candidateEmail.trim().toLowerCase();

      // Skip candidate if email already exists in this drive's roster
      if (existingDriveEmails.has(emailLower)) {
        continue;
      }
      existingDriveEmails.add(emailLower);

      const inviteId = crypto.randomUUID();

      if (!existingEmails.has(emailLower)) {
        candidatesToCreate.push({
          email: cand.candidateEmail.trim(),
          name: cand.name.trim(),
        });
        existingEmails.add(emailLower);
      }

      const token = isGenerated
        ? this.authService.generateInviteToken(
            inviteId,
            cand.candidateEmail,
            cand.name,
            roleTemplateId,
          )
        : "draft_" + crypto.randomUUID();

      invitesData.push({
        id: inviteId,
        candidateEmail: cand.candidateEmail,
        candidateName: cand.name,
        roleTemplateId,
        driveId,
        createdById: staffId,
        expiresAt,
        token,
        isGenerated,
        status: InviteStatus.PENDING,
      });
    }

    if (candidatesToCreate.length > 0) {
      await tx.candidate.createMany({
        data: candidatesToCreate,
      });
    }

    await tx.invite.createMany({
      data: invitesData,
    });

    return {
      count: candidates.length,
      createdCount: candidatesToCreate.length,
    };
  }
}
