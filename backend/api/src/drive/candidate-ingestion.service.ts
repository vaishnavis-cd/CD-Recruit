import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuthService } from "../auth/auth.service";
import { InviteStatus, OriginChannel } from "@prisma/client";
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
    options?: { expiresAt?: Date; scheduledTime?: Date | null; originChannel?: OriginChannel },
  ) {
    if (candidates.length === 0) {
      return { count: 0, createdCount: 0 };
    }

    const emails = candidates
      .map((c: any) => (c.candidateEmail || c.email || "").trim().toLowerCase())
      .filter((e: string) => Boolean(e));
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

    const expiresAt =
      options?.expiresAt ??
      (() => {
        const ttlHours = parseInt(process.env.INVITE_TOKEN_TTL_HOURS || "48", 10);
        const d = new Date();
        d.setHours(d.getHours() + ttlHours);
        return d;
      })();

    for (const cand of candidates as any[]) {
      const emailRaw = (cand.candidateEmail || cand.email || "").trim();
      const emailLower = emailRaw.toLowerCase();
      const nameRaw = (cand.candidateName || cand.name || emailRaw).trim();

      if (!emailLower) continue;

      // Skip candidate if email already exists in this drive's roster
      if (existingDriveEmails.has(emailLower)) {
        continue;
      }
      existingDriveEmails.add(emailLower);

      const inviteId = crypto.randomUUID();

      if (!existingEmails.has(emailLower)) {
        candidatesToCreate.push({
          email: emailRaw,
          name: nameRaw,
        });
        existingEmails.add(emailLower);
      }

      const token = isGenerated
        ? this.authService.generateInviteToken(
            inviteId,
            emailRaw,
            nameRaw,
            roleTemplateId,
          )
        : "draft_" + crypto.randomUUID();

      invitesData.push({
        id: inviteId,
        candidateEmail: emailRaw,
        candidateName: nameRaw,
        roleTemplateId,
        driveId,
        createdById: staffId,
        expiresAt,
        scheduledTime: options?.scheduledTime !== undefined ? options.scheduledTime : null,
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
