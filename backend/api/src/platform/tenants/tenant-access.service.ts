import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * TenantAccessService
 *
 * Provides authorization and credit-enforcement checks for tenant operations.
 *
 * NOTE FOR BILLING TEAM:
 * The billing "begin" engine MUST call `assertCanConsume(organizationId)`
 * before issuing credit deductions or beginning new assessments.
 */
@Injectable()
export class TenantAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Asserts whether a tenant organization is permitted to consume assessment credits / start new test attempts.
   *
   * Rules:
   * - Throws ForbiddenException with code 'TENANT_SUSPENDED' when status is SUSPENDED or OFFBOARDED/CHURNED.
   * - Throws a polite generic candidate-facing message that NEVER mentions billing or payment.
   * - Performs a single primary-key lookup on platform.tenant_profile.
   */
  async assertCanConsume(organizationId: string | null | undefined): Promise<void> {
    if (!organizationId) {
      return;
    }

    const profile = await this.prisma.tenantProfile.findUnique({
      where: { organizationId },
      select: {
        lifecycleStage: true,
        isManuallySuspended: true,
        isManuallyChurned: true,
      },
    });

    if (!profile) {
      return;
    }

    const isSuspended =
      profile.isManuallySuspended || profile.lifecycleStage === 'SUSPENDED';
    const isOffboarded =
      profile.isManuallyChurned || profile.lifecycleStage === 'CHURNED';

    if (isSuspended || isOffboarded) {
      throw new ForbiddenException({
        code: 'TENANT_SUSPENDED',
        message:
          'This assessment is currently unavailable. Please contact the test administrator for assistance.',
      });
    }
  }
}
