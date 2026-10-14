import {
  Injectable,
  Logger,
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { BillingAccountService } from "../billing/account/billing-account.service";
import { TrialGrantService } from "../billing/trial/trial-grant.service";
import {
  hashPassword,
  generateRefreshToken,
  hashToken,
} from "../common/utils/password.util";
import {
  PublicClientSignupDto,
  PublicClientSignupResponseDto,
} from "./dto/public-onboarding.dto";

const DISALLOWED_PERSONAL_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "aol.com",
  "icloud.com",
  "mail.com",
  "zoho.com",
  "proton.me",
  "protonmail.com",
  "yandex.com",
  "gmx.com",
  "inbox.com",
  "tempmail.com",
  "guerrillamail.com",
  "10minutemail.com",
]);

@Injectable()
export class PublicOnboardingService {
  private readonly logger = new Logger(PublicOnboardingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billingAccountService: BillingAccountService,
    private readonly trialGrantService: TrialGrantService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Validates that the provided email is a legitimate corporate domain.
   */
  private extractAndValidateDomain(email: string): string {
    const parts = email.trim().toLowerCase().split("@");
    if (parts.length !== 2 || !parts[1].includes(".")) {
      throw new BadRequestException("Please provide a valid work email address");
    }

    const domain = parts[1];
    if (DISALLOWED_PERSONAL_DOMAINS.has(domain)) {
      throw new BadRequestException(
        "Please provide a corporate work email address (e.g. name@company.com). Personal email providers like Gmail, Outlook, and Yahoo are not permitted for corporate workspace creation.",
      );
    }

    return domain;
  }

  /**
   * Generates a URL-friendly, collision-safe slug for the organization.
   */
  private generateSlug(name: string): string {
    const base = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return base || `company-${randomUUID().slice(0, 6)}`;
  }

  /**
   * Self-serve client signup and workspace provisioning.
   */
  async registerCompany(dto: PublicClientSignupDto): Promise<PublicClientSignupResponseDto> {
    const domain = this.extractAndValidateDomain(dto.workEmail);
    const normalizedEmail = dto.workEmail.trim().toLowerCase();
    const companyName = dto.companyName.trim();
    const billingCountry = (dto.billingCountry || "IN").trim().toUpperCase();
    const currency = billingCountry === "IN" ? "INR" : "USD";

    // 1. Check if user already exists
    const existingStaff = await this.prisma.staff.findUnique({
      where: { email: normalizedEmail },
    });
    if (existingStaff) {
      throw new ConflictException(
        "An account with this email address already exists. Please log in to your existing workspace.",
      );
    }

    // 2. Check if organization already exists with this corporate domain
    const existingDomainStaff = await this.prisma.staff.findFirst({
      where: { email: { endsWith: `@${domain}` } },
      include: { organization: true },
    });
    if (existingDomainStaff?.organization) {
      throw new ConflictException(
        `An organization for '@${domain}' is already registered (${existingDomainStaff.organization.name}). Please contact your company administrator to invite you to the workspace.`,
      );
    }

    // 3. Generate unique slug
    let baseSlug = this.generateSlug(companyName);
    let finalSlug = baseSlug;
    let suffix = 1;
    while (await this.prisma.organization.findUnique({ where: { slug: finalSlug } })) {
      finalSlug = `${baseSlug}-${suffix++}`;
    }

    const orgId = randomUUID();
    const staffId = randomUUID();
    const passwordHash = await hashPassword(dto.password);
    const refreshToken = generateRefreshToken();
    const refreshTokenHash = hashToken(refreshToken);
    const refreshTokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    let committedOrg: any = null;
    let committedStaff: any = null;
    let trialResult: any = null;

    try {
      await this.prisma.$transaction(async (tx) => {
        // Step A: Create public.organization
        committedOrg = await tx.organization.create({
          data: {
            id: orgId,
            name: companyName,
            slug: finalSlug,
          },
        });

        // Step B: Create BillingAccount via BillingAccountService with zero overdraft
        const baResult = await this.billingAccountService.createForOrganization(
          orgId,
          {
            accountName: companyName,
            billingCountry,
            currency,
            trialDomain: domain,
          },
          { transactionClient: tx },
        );

        // Step C: Create platform.tenant_profile
        await tx.tenantProfile.create({
          data: {
            organizationId: orgId,
            lifecycleStage: "ACTIVE",
            licenseTier: "STARTER",
            domainVerifiedAt: new Date(),
            walkthroughChecklist: {
              accountCreated: true,
              trialCreditsProvisioned: true,
              sampleDrivePending: true,
            },
          },
        });

        // Step D: Create Admin Staff user
        committedStaff = await tx.staff.create({
          data: {
            id: staffId,
            organizationId: orgId,
            name: dto.adminName.trim(),
            email: normalizedEmail,
            role: "ADMIN",
            passwordHash,
            refreshTokenHash,
            refreshTokenExpiresAt,
          },
        });

        // Step E: Provision Trial Credits (25 credits, 30 days)
        trialResult = await this.trialGrantService.grantTrial(baResult.id, domain, {
          transactionClient: tx,
        });
      });
    } catch (err: any) {
      this.logger.error(`Self-serve onboarding transaction failed: ${err.message}`, err.stack);
      if (err.status && err.status < 500) {
        throw err;
      }
      throw new InternalServerErrorException(
        `Failed to provision workspace: ${err.message || "Internal database error"}`,
      );
    }

    // 4. Generate Recruiter JWT access token
    const accessToken = this.jwtService.sign(
      {
        sub: committedStaff.id,
        email: committedStaff.email,
        name: committedStaff.name,
        role: committedStaff.role,
        organizationId: committedOrg.id,
      },
      { expiresIn: "24h" },
    );

    this.logger.log(
      `🚀 Self-serve onboarding successful: org=${committedOrg.name} (${committedOrg.id}), admin=${committedStaff.email}, trialCredits=${trialResult?.creditsGranted ?? 25}`,
    );

    return {
      success: true,
      message: "Workspace created successfully",
      accessToken,
      refreshToken,
      tokenType: "Bearer",
      organization: {
        id: committedOrg.id,
        name: committedOrg.name,
        slug: committedOrg.slug,
      },
      user: {
        id: committedStaff.id,
        name: committedStaff.name,
        email: committedStaff.email,
        role: committedStaff.role,
      },
      trial: {
        credits: trialResult?.creditsGranted ?? 25,
        validityDays: trialResult?.validityDays ?? 30,
      },
    };
  }
}
