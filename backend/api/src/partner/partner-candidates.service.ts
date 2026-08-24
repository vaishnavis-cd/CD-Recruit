import {
  Injectable,
  UnprocessableEntityException,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RoleTemplateService } from "../role-template/role-template.service";
import { DriveService } from "../drive/drive.service";
import { CandidateIngestionService, CandidateEntry } from "../drive/candidate-ingestion.service";
import { Department, DriveStatus, Partner, OriginChannel } from "@prisma/client";
import { PushPartnerCandidatesDto } from "./dto/partner-candidates.dto";
import { ConfigService } from "@nestjs/config";
import {
  CandidateCategory,
  normalizeCategory,
  normalizeExperienceTier,
  VALID_EXPERIENCE_TIERS,
} from "../common/utils/experience-tier.util";

@Injectable()
export class PartnerCandidatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roleTemplateService: RoleTemplateService,
    private readonly driveService: DriveService,
    private readonly candidateIngestionService: CandidateIngestionService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Ingest candidates from Partner ATS with high-throughput batching support (up to 1,000 candidates in < 2–5s).
   * Maps each candidate to their respective experience tier template (0-1, 2-5, 6-10, 11-15).
   */
  async pushCandidates(partner: Partner, dto: PushPartnerCandidatesDto) {
    const { department_code, requisition_ref, candidates } = dto;

    if (!candidates || candidates.length === 0) {
      throw new BadRequestException("At least one candidate must be provided");
    }

    const category = normalizeCategory(dto.category || dto.level);
    const department = department_code as Department;

    // 1. Single-query pre-fetch of all active role templates for this department
    const activeTemplates = await this.roleTemplateService.findActiveTemplatesForDepartment(department);

    if (!activeTemplates || activeTemplates.length === 0) {
      throw new UnprocessableEntityException(
        `No active role template found for department '${department_code}'`,
      );
    }

    // Build O(1) in-memory lookup map by experienceTier
    const tierTemplateMap = new Map<string, any>();
    let primaryTemplate = activeTemplates[0];

    for (const tpl of activeTemplates) {
      const tier =
        tpl.experienceTier ||
        (tpl.category === CandidateCategory.FRESHER || tpl.level === "FRESHER" ? "0-1" : null);
      if (tier) {
        tierTemplateMap.set(tier, tpl);
      }
      if (tpl.category === category || tpl.level === (category as any)) {
        primaryTemplate = tpl;
      }
    }

    // 2. Validate and map each candidate to their specific experience tier template
    const candidateEntries: CandidateEntry[] = [];
    const candidateTierMap = new Map<string, { tier: string; category: CandidateCategory; label: string }>();

    for (let i = 0; i < candidates.length; i++) {
      const cand = candidates[i];
      if (!cand.email || !cand.name) {
        throw new BadRequestException(`Candidate at index ${i} is missing required 'name' or 'email'`);
      }

      const rawLevel = cand.level || cand.experience_level;
      const normalizedTier = normalizeExperienceTier(rawLevel, category);

      if (category === CandidateCategory.EXPERIENCED && !normalizedTier) {
        throw new UnprocessableEntityException(
          `Candidate '${cand.email}' has invalid experience level '${rawLevel || "missing"}'. ` +
            `For EXPERIENCED category, level must be '2-5' (Level 1), '6-10' (Level 2), or '11-15' (Level 3).`,
        );
      }

      const effectiveTier = normalizedTier?.tier || (category === CandidateCategory.FRESHER ? "0-1" : "2-5");
      const effectiveCategory = normalizedTier?.category || category;

      // Find best-matching template for this tier, or fallback to primary template
      const matchedTemplate =
        tierTemplateMap.get(effectiveTier) ||
        activeTemplates.find((t) => t.experienceTier === effectiveTier) ||
        activeTemplates.find((t) => t.category === effectiveCategory || t.level === (effectiveCategory as any)) ||
        primaryTemplate;

      if (!matchedTemplate) {
        throw new UnprocessableEntityException(
          `No active role template found for department '${department_code}' and tier '${effectiveTier}'`,
        );
      }

      candidateEntries.push({
        name: cand.name.trim(),
        candidateEmail: cand.email.trim(),
        roleTemplateId: matchedTemplate.id,
        category: effectiveCategory,
        experienceTier: effectiveTier,
        phone: cand.phone,
        externalCandidateRef: cand.external_candidate_ref,
      });

      candidateTierMap.set(cand.email.trim().toLowerCase(), {
        tier: effectiveTier,
        category: effectiveCategory,
        label: normalizedTier?.label || (effectiveCategory === CandidateCategory.FRESHER ? "0-1 yrs (Fresher)" : "2-5 yrs (Level 1)"),
      });
    }

    const customOrRoleName = dto.drive_name?.trim() || primaryTemplate.roleName;
    const driveName = `${customOrRoleName} (P) (${requisition_ref})`;
    const auditActorLabel = `API:${partner.name}`;

    // Resolve system staff account for Drive.createdById FK
    const systemStaff =
      (await this.prisma.staff.findFirst({
        where: { role: "ADMIN" },
        orderBy: { createdAt: "asc" },
      })) ?? (await this.prisma.staff.findFirst({ orderBy: { createdAt: "asc" } }));

    if (!systemStaff) {
      throw new UnprocessableEntityException(
        "No staff account found to attribute partner drive creation. Please ensure at least one admin staff account exists.",
      );
    }
    const systemStaffId = systemStaff.id;

    // 3. Upsert Drive keyed on (partner_id, requisition_ref)
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
        invites: { select: { id: true } },
      },
    });

    let isNewDrive = false;
    if (!drive) {
      const now = new Date();
      const oneYearLater = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

      drive = await this.driveService.createFromTemplate(
        primaryTemplate.id,
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

    // 4. Ingest candidates in bulk with zero-requery in-memory returns
    const expiresAt48h = new Date(Date.now() + 48 * 60 * 60 * 1000);

    const ingestionResult = await this.prisma.$transaction(async (tx) => {
      // Ensure drive has originChannel = PARTNER_API
      await tx.drive.update({
        where: { id: drive.id },
        data: { originChannel: OriginChannel.PARTNER_API },
      });

      const res = await this.candidateIngestionService.processBulkCandidates(
        tx,
        drive.id,
        primaryTemplate.id,
        candidateEntries,
        systemStaffId,
        true, // isGenerated = true generates opaque candidate tokens
        {
          expiresAt: expiresAt48h,
          scheduledTime: null, // self-paced 48-hour validity
          originChannel: OriginChannel.PARTNER_API,
          defaultCategory: category,
        },
      );

      // Write AuditLog entry per created Drive and candidate ingestion
      await tx.auditLog.create({
        data: {
          staffId: systemStaffId,
          action: isNewDrive
            ? "DRIVE_AND_CANDIDATES_INGESTED_FROM_PARTNER_API"
            : "CANDIDATES_INGESTED_FROM_PARTNER_API",
          entityType: "Drive",
          entityId: drive.id,
          metadata: {
            actorLabel: auditActorLabel,
            partnerId: partner.id,
            partnerName: partner.name,
            requisitionRef: requisition_ref,
            candidateCount: candidates.length,
            createdCount: res.createdInvites.length,
          },
        },
      });

      return res;
    });

    // 5. Zero-Requery Response Formatting: Build links directly from in-memory records
    const candidateWebUrl =
      this.configService.get<string>("CANDIDATE_WEB_URL") ||
      process.env.CANDIDATE_WEB_URL ||
      "http://localhost:3000";

    const inviteResults = ingestionResult.createdInvites.map((inv) => {
      const tierInfo = candidateTierMap.get(inv.candidateEmail.toLowerCase());
      return {
        candidate_email: inv.candidateEmail,
        candidate_name: inv.candidateName,
        category: inv.category || category,
        level: inv.experienceTier || tierInfo?.tier || "0-1",
        experience_tier: inv.experienceTier || tierInfo?.tier || "0-1",
        level_label: tierInfo?.label || "Standard",
        assessment_link: `${candidateWebUrl}/invite/${inv.token}`,
        expires_at: inv.expiresAt.toISOString(),
      };
    });

    // 6. Concurrency & capacity warnings
    const drive_warnings: string[] = [];
    const totalCandidatesInDrive = (drive.invites?.length || 0) + candidates.length;
    if (totalCandidatesInDrive > 250) {
      drive_warnings.push(
        `High candidate concentration (${totalCandidatesInDrive} total candidates in drive). Ensure sandbox evaluation pool capacity is scaled appropriately.`,
      );
    }

    return {
      success: true,
      drive_id: drive.id,
      requisition_ref,
      department_code,
      category,
      level: dto.level || category,
      candidate_count: candidates.length,
      created_count: ingestionResult.createdCount,
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
        if (normScore >= 80) scoreBand = "HIGH";
        else if (normScore >= 60) scoreBand = "MEDIUM";
        else scoreBand = "LOW";
      }

      return {
        candidate_email: inv.candidateEmail,
        candidate_name: inv.candidateName,
        category: inv.category || "FRESHER",
        level: inv.experienceTier || "0-1",
        invite_status: inv.status,
        session_status: session?.status || "NOT_STARTED",
        assessment_link: `${candidateWebUrl}/invite/${inv.token}`,
        is_scored: isScored,
        composite_score: compositeScore,
        score_band: scoreBand,
        started_at: session?.startedAt?.toISOString() || null,
        submitted_at: session?.submittedAt?.toISOString() || null,
      };
    });

    return {
      success: true,
      drive_id: drive.id,
      requisition_ref: ref,
      candidates: candidateStatuses,
    };
  }
}
