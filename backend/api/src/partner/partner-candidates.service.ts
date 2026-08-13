import {
  Injectable,
  UnprocessableEntityException,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RoleTemplateService } from "../role-template/role-template.service";
import { DriveService } from "../drive/drive.service";
import { CandidateIngestionService } from "../drive/candidate-ingestion.service";
import { Department, ExperienceLevel, DriveStatus, Partner, OriginChannel } from "@prisma/client";
import { PushPartnerCandidatesDto } from "./dto/partner-candidates.dto";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class PartnerCandidatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roleTemplateService: RoleTemplateService,
    private readonly driveService: DriveService,
    private readonly candidateIngestionService: CandidateIngestionService,
    private readonly configService: ConfigService,
  ) {}

  async pushCandidates(partner: Partner, dto: PushPartnerCandidatesDto) {
    const { department_code, level, requisition_ref, candidates } = dto;

    if (!candidates || candidates.length === 0) {
      throw new BadRequestException("At least one candidate must be provided");
    }

    // 1. Resolve (department_code, level) via RoleTemplateService.findActiveTemplate
    // Returns 422 Unprocessable Entity if active template is not found (no fallback auto-creation)
    let activeTemplate: any;
    try {
      activeTemplate = await this.roleTemplateService.findActiveTemplate(
        department_code as Department,
        level as ExperienceLevel,
      );
    } catch (err: any) {
      throw new UnprocessableEntityException(
        `No active role template found for department '${department_code}' and level '${level}'`,
      );
    }

    if (!activeTemplate || !activeTemplate.isActive) {
      throw new UnprocessableEntityException(
        `No active role template found for department '${department_code}' and level '${level}'`,
      );
    }

    const customOrRoleName = dto.drive_name?.trim() || activeTemplate.roleName;
    const driveName = `${customOrRoleName} (P) (${requisition_ref})`;
    // "API:<partner.name>" is used as the actor label in AuditLog entries.
    // For the Drive.createdById FK, we must use a real Staff row ID.
    const auditActorLabel = `API:${partner.name}`;

    // Resolve a real Staff ID for the FK constraint on Drive.createdById.
    // We use the first ADMIN staff found; fall back to any staff as a last resort.
    const systemStaff = await this.prisma.staff.findFirst({
      where: { role: "ADMIN" },
      orderBy: { createdAt: "asc" },
    }) ?? await this.prisma.staff.findFirst({ orderBy: { createdAt: "asc" } });

    if (!systemStaff) {
      throw new UnprocessableEntityException(
        "No staff account found to attribute partner drive creation. Please ensure at least one admin staff account exists.",
      );
    }
    const systemStaffId = systemStaff.id;

    // 2. Upsert Drive keyed on (partner_id, requisition_ref)
    let drive = await this.prisma.drive.findFirst({
      where: {
        OR: [
          { name: driveName },
          { name: { contains: `(${requisition_ref})` } },
          { name: { startsWith: `[Partner:${partner.id}:${requisition_ref}]` } },
          { name: { startsWith: `[REQ:${requisition_ref}]` } },
        ],
      },
      include: {
        questions: true,
        invites: true,
      },
    });

    let isNewDrive = false;
    if (!drive) {
      // First call for a requisition creates Drive via createFromTemplate
      const now = new Date();
      const oneYearLater = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

      drive = await this.driveService.createFromTemplate(
        activeTemplate.id,
        {
          name: driveName,
          status: DriveStatus.ACTIVE,
          scheduleStart: now,
          scheduleEnd: oneYearLater,
        },
        systemStaffId,
      );
      isNewDrive = true;
    }

    // 3. Create Invites with scheduledTime = null and expiresAt = now + 48h via CandidateIngestionService
    const candidateEntries = candidates.map((c) => ({
      name: c.name,
      candidateEmail: c.email,
    }));

    const expiresAt48h = new Date(Date.now() + 48 * 60 * 60 * 1000);

    await this.prisma.$transaction(async (tx) => {
      // Ensure drive has originChannel = PARTNER_API
      await tx.drive.update({
        where: { id: drive.id },
        data: { originChannel: OriginChannel.PARTNER_API },
      });

      await this.candidateIngestionService.processBulkCandidates(
        tx,
        drive.id,
        activeTemplate.id,
        candidateEntries,
        systemStaffId,
        true, // isGenerated = true generates candidate token
        {
          expiresAt: expiresAt48h,
          scheduledTime: null, // self-paced 48-hour rolling validity
          originChannel: OriginChannel.PARTNER_API,
        },
      );

      // Update created invites originChannel = PARTNER_API
      await tx.invite.updateMany({
        where: {
          driveId: drive.id,
          candidateEmail: { in: candidates.map((c) => c.email) },
        },
        data: { originChannel: OriginChannel.PARTNER_API },
      });

      // Write AuditLog entry per created Drive and candidate ingestion
      await tx.auditLog.create({
        data: {
          staffId: systemStaffId,
          action: isNewDrive ? "DRIVE_AND_CANDIDATES_INGESTED_FROM_PARTNER_API" : "CANDIDATES_INGESTED_FROM_PARTNER_API",
          entityType: "Drive",
          entityId: drive.id,
          metadata: {
            actorLabel: auditActorLabel,
            partnerId: partner.id,
            partnerName: partner.name,
            requisitionRef: requisition_ref,
            candidateCount: candidates.length,
          },
        },
      });
    });

    // 4. Retrieve created invites for this drive to format candidate links
    const createdInvites = await this.prisma.invite.findMany({
      where: {
        driveId: drive.id,
        candidateEmail: { in: candidates.map((c) => c.email) },
      },
    });

    const candidateWebUrl =
      this.configService.get<string>("CANDIDATE_WEB_URL") ||
      process.env.CANDIDATE_WEB_URL ||
      "http://localhost:3000";

    const inviteResults = createdInvites.map((inv) => ({
      candidate_email: inv.candidateEmail,
      candidate_name: inv.candidateName,
      assessment_link: `${candidateWebUrl}/invite/${inv.token}`,
      expires_at: inv.expiresAt.toISOString(),
    }));

    // 5. Include drive_warnings array if candidate count is high relative to fixed warm-pool sandbox capacity
    const drive_warnings: string[] = [];
    const totalCandidatesInDrive = (drive.invites?.length || 0) + candidates.length;
    if (totalCandidatesInDrive > 50) {
      drive_warnings.push(
        `High candidate concentration (${totalCandidatesInDrive} total candidates). This may saturate evaluation sandbox capacity.`,
      );
    }

    return {
      success: true,
      drive_id: drive.id,
      requisition_ref,
      department_code,
      level,
      invites: inviteResults,
      drive_warnings,
    };
  }

  async getRequisitionStatus(partner: Partner, ref: string) {
    const drive = await this.prisma.drive.findFirst({
      where: {
        OR: [
          { name: { contains: `(${ref})` } },
          { name: { startsWith: `[Partner:${partner.id}:${ref}]` } },
          { name: { startsWith: `[REQ:${ref}]` } },
        ],
      },
      include: {
        invites: {
          include: {
            session: {
              include: {
                score: true,
              },
            },
          },
        },
      },
    });

    if (!drive) {
      throw new NotFoundException(`Requisition reference '${ref}' not found`);
    }

    const candidateWebUrl =
      this.configService.get<string>("CANDIDATE_WEB_URL") ||
      process.env.CANDIDATE_WEB_URL ||
      "http://localhost:3000";

    const candidateStatuses = drive.invites.map((inv) => {
      const session = inv.session;
      const score = session?.score;

      // Only populate score fields if a real, non-placeholder persisted Score row exists
      const isScored = !!(
        score &&
        typeof score.compositeScore === "number" &&
        score.gradingSource !== "placeholder"
      );

      let compositeScore: number | null = null;
      let scoreBand: string | null = null;

      if (isScored && score) {
        compositeScore = score.compositeScore;
        const normScore = compositeScore <= 1.0 ? compositeScore * 100 : compositeScore;
        if (normScore >= 85) scoreBand = "STRONG_PASS";
        else if (normScore >= 70) scoreBand = "PASS";
        else if (normScore >= 50) scoreBand = "BORDERLINE";
        else scoreBand = "FAIL";
      }

      return {
        candidate_email: inv.candidateEmail,
        candidate_name: inv.candidateName,
        invite_status: inv.status,
        session_status: session ? session.status : null,
        score_status: isScored ? "SCORED" : "PENDING",
        composite_score: compositeScore,
        composite_score_band: scoreBand,
        assessment_link: `${candidateWebUrl}/invite/${inv.token}`,
        expires_at: inv.expiresAt.toISOString(),
      };
    });

    return {
      requisition_ref: ref,
      drive_id: drive.id,
      total_candidates: drive.invites.length,
      candidates: candidateStatuses,
    };
  }
}
