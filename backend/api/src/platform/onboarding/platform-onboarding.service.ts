import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
  GoneException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { hashPassword } from '../../common/utils/password.util';
import { PrismaService } from '../../prisma/prisma.service';
import { PlatformAuditService } from '../audit/platform-audit.service';
import {
  BILLING_ACCOUNT_SERVICE,
  TRIAL_GRANT_SERVICE,
  IBillingAccountService,
  ITrialGrantService,
} from './interfaces/billing-integration.interface';
import {
  DomainCheckRequestDto,
  DomainCheckResponseDto,
  CreateDraftDto,
  UpdateDraftDto,
  WalkthroughUpdateDto,
  CommitTenantResultDto,
} from './dto/onboarding.dto';
import {
  normalizeDomain,
  DOMAIN_REGEX,
  DISALLOWED_PERSONAL_DOMAINS,
} from './utils/domain-validation';

@Injectable()
export class PlatformOnboardingService {
  private readonly logger = new Logger(PlatformOnboardingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: PlatformAuditService,
    @Inject(BILLING_ACCOUNT_SERVICE)
    private readonly billingAccountService: IBillingAccountService,
    @Inject(TRIAL_GRANT_SERVICE)
    private readonly trialGrantService: ITrialGrantService,
  ) {}

  /**
   * Domain check endpoint logic.
   * Validates corporate domain structure, rejects personal email providers,
   * verifies admin email belongs to domain, and checks domain collision in DB.
   */
  async checkDomain(dto: DomainCheckRequestDto): Promise<DomainCheckResponseDto> {
    const reasons: string[] = [];
    const normalized = normalizeDomain(dto.domain);

    if (!normalized || !DOMAIN_REGEX.test(normalized)) {
      reasons.push('INVALID_DOMAIN_FORMAT');
    }

    if (DISALLOWED_PERSONAL_DOMAINS.has(normalized)) {
      reasons.push('PERSONAL_EMAIL_PROVIDER_NOT_ALLOWED');
    }

    const email = (dto.adminEmail || '').trim().toLowerCase();
    if (!email.endsWith(`@${normalized}`)) {
      reasons.push('EMAIL_DOMAIN_MISMATCH');
    }

    // Check if domain is already registered with an existing organization or committed draft
    if (normalized) {
      const existingDraft = await this.prisma.onboardingDraft.findFirst({
        where: { corporateDomain: normalized, status: 'COMMITTED' },
        select: { id: true },
      });
      const existingStaff = await this.prisma.staff.findFirst({
        where: { email: { endsWith: `@${normalized}` } },
        select: { id: true },
      });
      const existingBilling = await this.prisma.billingAccount.findFirst({
        where: { trialDomain: normalized },
        select: { id: true },
      });
      if (existingDraft || existingStaff || existingBilling) {
        reasons.push('DOMAIN_ALREADY_USED');
      }
    }

    return {
      ok: reasons.length === 0,
      normalizedDomain: normalized,
      reasons,
    };
  }

  /**
   * Create a new onboarding draft.
   */
  async createDraft(actorId: string, dto?: CreateDraftDto) {
    const expiresAt = new Date(Date.now() + 14 * 86400000); // 14 days
    const corporateDomain = dto?.corporateDomain
      ? normalizeDomain(dto.corporateDomain)
      : `draft-${crypto.randomUUID()}`;

    return this.prisma.onboardingDraft.create({
      data: {
        corporateDomain,
        currentStep: 1,
        draftData: dto?.draftData || {},
        createdByStaffId: actorId,
        expiresAt,
        status: 'DRAFT',
      },
    });
  }

  /**
   * List non-expired, non-committed drafts.
   * OWNER sees all; other staff see only their own drafts.
   */
  async listDrafts(actor: { id: string; role: string }) {
    const whereClause: any = {
      status: 'DRAFT',
      expiresAt: { gt: new Date() },
    };

    if (actor.role !== 'OWNER') {
      whereClause.createdByStaffId = actor.id;
    }

    return this.prisma.onboardingDraft.findMany({
      where: whereClause,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        corporateDomain: true,
        currentStep: true,
        draftData: true,
        createdByStaffId: true,
        expiresAt: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  /**
   * Get draft by ID.
   */
  async getDraft(id: string, actor: { id: string; role: string }) {
    const draft = await this.prisma.onboardingDraft.findUnique({
      where: { id },
    });

    if (!draft) {
      throw new NotFoundException('DRAFT_NOT_FOUND');
    }

    if (actor.role !== 'OWNER' && draft.createdByStaffId !== actor.id) {
      throw new NotFoundException('DRAFT_NOT_FOUND');
    }

    return draft;
  }

  /**
   * Update draft data (autosave).
   */
  async updateDraft(
    id: string,
    dto: UpdateDraftDto,
    actor: { id: string; role: string },
  ) {
    const draft = await this.prisma.onboardingDraft.findUnique({
      where: { id },
    });

    if (!draft) {
      throw new NotFoundException('DRAFT_NOT_FOUND');
    }

    if (actor.role !== 'OWNER' && draft.createdByStaffId !== actor.id) {
      throw new NotFoundException('DRAFT_NOT_FOUND');
    }

    if (draft.status === 'COMMITTED') {
      throw new ConflictException('CANNOT_EDIT_COMMITTED_DRAFT');
    }

    if (draft.expiresAt < new Date()) {
      throw new GoneException('DRAFT_EXPIRED');
    }

    const cleanData = { ...(dto.draftData || {}) };
    delete cleanData.password;
    delete cleanData.token;
    delete cleanData.jwt;

    let updateDomain = draft.corporateDomain;
    if (cleanData.domain) {
      const normalized = normalizeDomain(cleanData.domain);
      if (normalized && DOMAIN_REGEX.test(normalized)) {
        updateDomain = normalized;
      }
    }

    return this.prisma.onboardingDraft.update({
      where: { id },
      data: {
        currentStep: dto.currentStep,
        draftData: cleanData,
        corporateDomain: updateDomain,
      },
    });
  }

  /**
   * Delete draft.
   */
  async deleteDraft(id: string, actor: { id: string; role: string }) {
    const draft = await this.prisma.onboardingDraft.findUnique({
      where: { id },
    });

    if (!draft) {
      throw new NotFoundException('DRAFT_NOT_FOUND');
    }

    if (actor.role !== 'OWNER' && draft.createdByStaffId !== actor.id) {
      throw new NotFoundException('DRAFT_NOT_FOUND');
    }

    await this.prisma.onboardingDraft.delete({
      where: { id },
    });

    return { success: true };
  }

  /**
   * Atomic commit: provisions Organization, Profile, Admin, Billing Account, and Trial Grant in ONE transaction.
   */
  async commitDraft(
    id: string,
    actor: { id: string; role: string },
  ): Promise<CommitTenantResultDto> {
    let committedOrgId: string | null = null;
    let committedBaId: string | null = null;
    let trialResultData: any = null;
    let tenantDetailsForAudit: any = null;

    try {
      await this.prisma.$transaction(async (tx) => {
        // 1. Lock draft row
        const rows: any[] = await tx.$queryRaw`
          SELECT id, corporate_domain, current_step, draft_data, created_by_staff_id, expires_at, status, committed_organization_id
          FROM platform.onboarding_draft
          WHERE id = ${id}
          FOR UPDATE
        `;

        if (rows.length === 0) {
          throw new NotFoundException('DRAFT_NOT_FOUND');
        }

        const draft = rows[0];

        // Idempotency: if already committed, return existing organization
        if (draft.status === 'COMMITTED' && draft.committed_organization_id) {
          committedOrgId = draft.committed_organization_id;
          const org = await tx.organization.findUnique({
            where: { id: committedOrgId },
            include: { billingAccount: true },
          });
          committedBaId = org?.billingAccountId || `ba-${committedOrgId}`;
          trialResultData = {
            creditsGranted: 25,
            validityDays: 30,
            expiresAt: new Date(Date.now() + 30 * 86400000),
          };
          return;
        }

        if (new Date(draft.expires_at) < new Date()) {
          throw new GoneException('DRAFT_EXPIRED');
        }

        const rawData = typeof draft.draft_data === 'string'
          ? JSON.parse(draft.draft_data)
          : draft.draft_data || {};

        // Extract draft data
        const companyName = (rawData.companyName || rawData.name || '').trim();
        const slug = (rawData.slug || '').trim().toLowerCase();
        const billingCountry = (rawData.billingCountry || 'IN').trim().toUpperCase();
        const currency = rawData.currency || (billingCountry === 'IN' ? 'INR' : 'USD');
        const legalEntityName = rawData.legalEntityName || null;
        const taxId = rawData.taxId || null;

        const adminName = (rawData.adminName || rawData.fullName || 'Tenant Admin').trim();
        const adminEmail = (rawData.adminEmail || rawData.workEmail || '').trim().toLowerCase();

        const domain = normalizeDomain(rawData.domain || draft.corporate_domain);
        const licenseTier = (rawData.licenseTier || 'STARTER').toUpperCase();
        const internalOwnerId = rawData.internalOwnerId || null;

        if (!companyName || !slug || !adminEmail || !domain) {
          throw new BadRequestException('INCOMPLETE_ONBOARDING_DRAFT');
        }

        // 2. Re-validate domain & slug uniqueness
        if (!DOMAIN_REGEX.test(domain) || DISALLOWED_PERSONAL_DOMAINS.has(domain)) {
          throw new ConflictException('DOMAIN_NOT_ALLOWED');
        }

        if (!adminEmail.endsWith(`@${domain}`)) {
          throw new ConflictException('DOMAIN_NOT_ALLOWED');
        }

        const existingSlug = await tx.organization.findUnique({
          where: { slug },
          select: { id: true },
        });
        if (existingSlug) {
          throw new ConflictException('SLUG_TAKEN');
        }

        const existingCommittedDraft = await tx.onboardingDraft.findFirst({
          where: { corporateDomain: domain, status: 'COMMITTED', NOT: { id } },
          select: { id: true },
        });
        const existingStaffDomain = await tx.staff.findFirst({
          where: { email: { endsWith: `@${domain}` } },
          select: { id: true },
        });
        if (existingCommittedDraft || existingStaffDomain) {
          throw new ConflictException('DOMAIN_ALREADY_USED');
        }

        // 3. Create Billing Account via interface
        const orgId = crypto.randomUUID();
        const baResult = await this.billingAccountService.createForOrganization(
          orgId,
          {
            accountName: companyName,
            billingCountry,
            currency,
            legalEntityName,
            taxId,
            trialDomain: domain,
          },
          { transactionClient: tx },
        );

        committedBaId = baResult.id;

        // 4. Create public.organization
        const org = await tx.organization.create({
          data: {
            id: orgId,
            name: companyName,
            slug,
            billingAccountId: baResult.id,
          },
        });

        committedOrgId = org.id;

        // 5. Create platform.tenant_profile
        await tx.tenantProfile.create({
          data: {
            organizationId: orgId,
            lifecycleStage: 'ACTIVE',
            licenseTier: licenseTier as any,
            internalOwnerId: internalOwnerId || null,
            domainVerifiedAt: new Date(),
            walkthroughChecklist: {
              kickoffCallDone: false,
              sampleDriveDeployed: false,
              adminTrained: false,
            },
          },
        });

        // 6. Create first tenant admin in public.staff
        const tempPassword = `Temp@${crypto.randomBytes(6).toString('hex')}!`;
        const passwordHash = await hashPassword(tempPassword);

        await tx.staff.create({
          data: {
            organizationId: orgId,
            name: adminName,
            email: adminEmail,
            role: 'ADMIN',
            passwordHash,
          },
        });

        // 7. Grant trial credits via interface
        const trialResult = await this.trialGrantService.grantTrial(
          baResult.id,
          domain,
          { transactionClient: tx },
        );

        trialResultData = trialResult;

        // 8. Mark draft COMMITTED
        await tx.onboardingDraft.update({
          where: { id },
          data: {
            status: 'COMMITTED',
            committedOrganizationId: orgId,
            lastCommitError: null,
          },
        });

        tenantDetailsForAudit = {
          name: companyName,
          slug,
          domain,
          licenseTier,
          billingCountry,
          creditsGranted: trialResult.creditsGranted,
        };
      });
    } catch (err: any) {
      // Outside failed transaction: save lastCommitError code on the draft row
      await this.prisma.onboardingDraft.update({
        where: { id },
        data: {
          lastCommitError: err.response?.code || err.code || err.message || 'UNKNOWN_COMMIT_ERROR',
        },
      }).catch(() => {});

      // Audit TENANT_CREATE_FAILED with error code only
      await this.auditService.record({
        actorId: actor.id,
        actorRole: actor.role,
        subjectType: 'DRAFT',
        subjectId: id,
        action: 'TENANT_CREATE_FAILED',
        reason: err.message || 'Onboarding commit failed',
        executionResult: 'FAILED',
      });

      throw err;
    }

    // Outside successful transaction: audit TENANT_CREATED with NO admin name/email
    if (tenantDetailsForAudit && committedOrgId) {
      await this.auditService.record({
        actorId: actor.id,
        actorRole: actor.role,
        subjectType: 'TENANT',
        subjectId: committedOrgId,
        targetTenantId: committedOrgId,
        action: 'TENANT_CREATED',
        after: tenantDetailsForAudit,
        executionResult: 'SUCCESS',
      });
    }

    return {
      organizationId: committedOrgId!,
      billingAccountId: committedBaId!,
      trial: {
        creditsGranted: trialResultData?.creditsGranted || 25,
        validityDays: trialResultData?.validityDays || 30,
        expiresAt: (trialResultData?.expiresAt instanceof Date
          ? trialResultData.expiresAt
          : new Date(Date.now() + 30 * 86400000)
        ).toISOString(),
      },
    };
  }

  /**
   * Walkthrough checklist update for tenant profile.
   */
  async updateWalkthrough(
    tenantId: string,
    dto: WalkthroughUpdateDto,
    actor: { id: string; role: string },
  ) {
    const profile = await this.prisma.tenantProfile.findUnique({
      where: { organizationId: tenantId },
    });

    if (!profile) {
      throw new NotFoundException('TENANT_NOT_FOUND');
    }

    const currentChecklist =
      (profile.walkthroughChecklist as Record<string, boolean>) || {};

    const updatedChecklist = {
      kickoffCallDone:
        dto.kickoffCallDone !== undefined
          ? dto.kickoffCallDone
          : !!currentChecklist.kickoffCallDone,
      sampleDriveDeployed:
        dto.sampleDriveDeployed !== undefined
          ? dto.sampleDriveDeployed
          : !!currentChecklist.sampleDriveDeployed,
      adminTrained:
        dto.adminTrained !== undefined
          ? dto.adminTrained
          : !!currentChecklist.adminTrained,
    };

    const isAllCompleted =
      updatedChecklist.kickoffCallDone &&
      updatedChecklist.sampleDriveDeployed &&
      updatedChecklist.adminTrained;

    const walkthroughCompletedAt = isAllCompleted ? new Date() : null;

    const updatedProfile = await this.prisma.tenantProfile.update({
      where: { organizationId: tenantId },
      data: {
        walkthroughChecklist: updatedChecklist,
        walkthroughCompletedAt,
      },
    });

    await this.auditService.record({
      actorId: actor.id,
      actorRole: actor.role,
      subjectType: 'TENANT',
      subjectId: tenantId,
      targetTenantId: tenantId,
      action: 'WALKTHROUGH_UPDATED',
      before: {
        checklist: currentChecklist,
        completedAt: profile.walkthroughCompletedAt?.toISOString() || null,
      },
      after: {
        checklist: updatedChecklist,
        completedAt: walkthroughCompletedAt?.toISOString() || null,
      },
      executionResult: 'SUCCESS',
    });

    return {
      walkthroughChecklist: updatedProfile.walkthroughChecklist,
      walkthroughCompletedAt: updatedProfile.walkthroughCompletedAt,
    };
  }
}
