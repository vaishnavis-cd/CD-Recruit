import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuthService } from "../auth/auth.service";
import { InviteStatus, OriginChannel, CandidateCategory } from "@prisma/client";
import * as crypto from "crypto";

export interface CandidateEntry {
  name: string;
  candidateEmail: string;
  roleTemplateId?: string;
  category?: CandidateCategory;
  experienceTier?: string;
  phone?: string;
  externalCandidateRef?: string;
}

export interface CreatedInviteSummary {
  id: string;
  candidateEmail: string;
  candidateName: string;
  roleTemplateId: string;
  category?: CandidateCategory | null;
  experienceTier?: string | null;
  token: string;
  expiresAt: Date;
  scheduledTime: Date | null;
  originChannel: OriginChannel;
}

@Injectable()
export class CandidateIngestionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  /**
   * Process high-throughput bulk candidate ingestion for a drive within a transaction or standalone.
   * Returns created candidates count and the in-memory array of created invite summaries
   * to eliminate downstream DB re-query roundtrips.
   */
  async processBulkCandidates(
    tx: any,
    driveId: string,
    defaultRoleTemplateId: string,
    candidates: CandidateEntry[],
    staffId: string,
    isGenerated = false,
    options?: {
      expiresAt?: Date;
      scheduledTime?: Date | null;
      originChannel?: OriginChannel;
      defaultCategory?: CandidateCategory;
    },
  ): Promise<{
    count: number;
    createdCount: number;
    createdInvites: CreatedInviteSummary[];
    skippedCount: number;
  }> {
    if (candidates.length === 0) {
      return { count: 0, createdCount: 0, createdInvites: [], skippedCount: 0 };
    }

    const emails = candidates.map((c) => c.candidateEmail.trim().toLowerCase());

    // Single indexed query to check existing candidates in DB
    const existingCandidates = await tx.candidate.findMany({
      where: { email: { in: emails } },
      select: { email: true },
    });
    const existingEmails = new Set(existingCandidates.map((c: any) => c.email.toLowerCase()));

    // Query existing invites for this drive to handle updates / deduplication
    const existingDriveInvites = await tx.invite.findMany({
      where: { driveId },
      select: {
        id: true,
        candidateEmail: true,
        candidateName: true,
        roleTemplateId: true,
        category: true,
        experienceTier: true,
        token: true,
        expiresAt: true,
        scheduledTime: true,
        originChannel: true,
      },
    });
    const existingDriveMap = new Map<string, any>(
      existingDriveInvites.map((i: any) => [i.candidateEmail.toLowerCase(), i]),
    );

    const invitesData: any[] = [];
    const candidatesToCreate: any[] = [];
    const createdInviteSummaries: CreatedInviteSummary[] = [];

    const expiresAt =
      options?.expiresAt ??
      (() => {
        const ttlHours = parseInt(process.env.INVITE_TOKEN_TTL_HOURS || "48", 10);
        const d = new Date();
        d.setHours(d.getHours() + ttlHours);
        return d;
      })();

    const originChannel = options?.originChannel || OriginChannel.DIRECT;
    let skippedCount = 0;

    for (const cand of candidates as any[]) {
      const emailRaw = (cand.candidateEmail || cand.email || "").trim();
      const emailLower = emailRaw.toLowerCase();
      const nameRaw = (cand.candidateName || cand.name || emailRaw).trim();

      if (!emailLower) continue;

      const existingInv = existingDriveMap.get(emailLower);

      // If candidate already exists in this drive's roster, update tier/template if needed
      if (existingInv) {
        const targetTemplateId = cand.roleTemplateId || existingInv.roleTemplateId || defaultRoleTemplateId;
        const category = cand.category || options?.defaultCategory || existingInv.category;
        const experienceTier = cand.experienceTier || existingInv.experienceTier;

        await tx.invite.update({
          where: { id: existingInv.id },
          data: {
            roleTemplateId: targetTemplateId,
            category,
            experienceTier,
          },
        });

        createdInviteSummaries.push({
          id: existingInv.id,
          candidateEmail: existingInv.candidateEmail,
          candidateName: existingInv.candidateName || nameRaw,
          roleTemplateId: targetTemplateId,
          category,
          experienceTier,
          token: existingInv.token,
          expiresAt: existingInv.expiresAt,
          scheduledTime: existingInv.scheduledTime,
          originChannel: existingInv.originChannel,
        });

        skippedCount++;
        continue;
      }
      existingDriveMap.set(emailLower, { candidateEmail: emailLower });

      const inviteId = crypto.randomUUID();
      const targetTemplateId = cand.roleTemplateId || defaultRoleTemplateId;

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
            targetTemplateId,
          )
        : "draft_" + crypto.randomUUID();

      const category = cand.category || options?.defaultCategory || null;
      const experienceTier = cand.experienceTier || null;
      const scheduledTime = options?.scheduledTime !== undefined ? options.scheduledTime : null;

      const inviteRecord = {
        id: inviteId,
        candidateEmail: emailRaw,
        candidateName: nameRaw,
        roleTemplateId: targetTemplateId,
        driveId,
        createdById: staffId,
        category,
        experienceTier,
        expiresAt,
        scheduledTime,
        token,
        isGenerated,
        originChannel,
        status: InviteStatus.PENDING,
      };

      invitesData.push(inviteRecord);
      createdInviteSummaries.push({
        id: inviteId,
        candidateEmail: inviteRecord.candidateEmail,
        candidateName: inviteRecord.candidateName,
        roleTemplateId: targetTemplateId,
        category,
        experienceTier,
        token,
        expiresAt,
        scheduledTime,
        originChannel,
      });
    }

    if (candidatesToCreate.length > 0) {
      await tx.candidate.createMany({
        data: candidatesToCreate,
        skipDuplicates: true,
      });
    }

    if (invitesData.length > 0) {
      await tx.invite.createMany({
        data: invitesData,
      });
    }

    return {
      count: candidates.length,
      createdCount: candidatesToCreate.length,
      createdInvites: createdInviteSummaries,
      skippedCount,
    };
  }
}
