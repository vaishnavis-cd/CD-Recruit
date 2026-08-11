import {
  Injectable,
  UnprocessableEntityException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RoleTemplateService } from "../role-template/role-template.service";
import { DriveService } from "../drive/drive.service";
import { CandidateIngestionService } from "../drive/candidate-ingestion.service";
import { Department, ExperienceLevel, DriveStatus, Partner } from "@prisma/client";
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

    const driveName = `[Partner:${partner.id}:${requisition_ref}] ${activeTemplate.roleName}`;
    const actorStaffId = `API:${partner.name}`;

    // 2. Upsert Drive keyed on (partner_id, requisition_ref)
    let drive = await this.prisma.drive.findFirst({
      where: {
        name: driveName,
      },
      include: {
        invites: true,
      },
    });

    let isNewDrive = false;
    if (!drive) {
      // First call for a requisition creates Drive via createFromTemplate
      drive = await this.driveService.createFromTemplate(
        activeTemplate.id,
        {
          name: driveName,
          status: DriveStatus.ACTIVE,
        },
        actorStaffId,
      );
      isNewDrive = true;
    }

    // 3. Create Invites with scheduledTime = null and expiresAt = now + 24h via CandidateIngestionService
    const candidateEntries = candidates.map((c) => ({
      name: c.name,
      candidateEmail: c.email,
    }));

    const expiresAt24h = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await this.prisma.$transaction(async (tx) => {
      await this.candidateIngestionService.processBulkCandidates(
        tx,
        drive.id,
        activeTemplate.id,
        candidateEntries,
        actorStaffId,
        true, // isGenerated = true generates candidate token
        {
          expiresAt: expiresAt24h,
          scheduledTime: null, // self-paced 24-hour rolling validity
        },
      );

      // Write AuditLog entry per created Drive and candidate ingestion
      await tx.auditLog.create({
        data: {
          staffId: actorStaffId,
          action: isNewDrive ? "DRIVE_AND_CANDIDATES_INGESTED_FROM_PARTNER_API" : "CANDIDATES_INGESTED_FROM_PARTNER_API",
          entityType: "Drive",
          entityId: drive.id,
          metadata: {
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
}
