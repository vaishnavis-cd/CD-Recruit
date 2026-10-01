import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Req,
  Param,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
  ParseUUIDPipe,
} from '@nestjs/common';
import { PlatformStaffRole } from '@cd-recruit/shared-types';
import { PlatformJwtAuthGuard } from '../auth/guards/platform-jwt-auth.guard';
import { PlatformRolesGuard } from '../auth/guards/platform-roles.guard';
import {
  PlatformRoles,
  PLATFORM_READ_ROLES,
  PLATFORM_MUTATION_ROLES,
} from '../auth/decorators/platform-roles.decorator';
import { PlatformTenantsService } from './platform-tenants.service';
import { PlatformAuditService } from '../audit/platform-audit.service';
import {
  ListPlatformTenantsQueryDto,
  ListPlatformTenantsResponseDto,
  GetTenantAuditQueryDto,
  TenantDetailResponseDto,
  TenantBriefResponseDto,
  SuspendTenantDto,
  RestoreTenantDto,
  WalkthroughUpdateDto,
  AssignTenantOwnerDto,
  UpdateLicenseTierDto,
} from './dto/platform-tenants.dto';

@Controller('platform/tenants')
@UseGuards(PlatformJwtAuthGuard, PlatformRolesGuard)
export class PlatformTenantsController {
  constructor(
    private readonly tenantsService: PlatformTenantsService,
    private readonly auditService: PlatformAuditService,
  ) {}

  /**
   * GET /api/v1/platform/tenants
   * Returns a paginated, PII-blind list of tenant organizations.
   */
  @Get()
  @PlatformRoles(...PLATFORM_READ_ROLES)
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  async listTenants(
    @Query() query: ListPlatformTenantsQueryDto,
  ): Promise<ListPlatformTenantsResponseDto> {
    return this.tenantsService.listTenants(query);
  }

  /**
   * GET /api/v1/platform/tenants/:id/brief
   * Cross-team contract brief endpoint.
   * Returns exactly { id, name, slug, lifecycleStage, licenseTier, createdAt }.
   */
  @Get(':id/brief')
  @PlatformRoles(...PLATFORM_READ_ROLES)
  async getTenantBrief(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<TenantBriefResponseDto> {
    return this.tenantsService.getTenantBrief(id);
  }

  /**
   * GET /api/v1/platform/tenants/:id/audit
   * Returns paginated audit events targeting this tenant.
   */
  @Get(':id/audit')
  @PlatformRoles(...PLATFORM_READ_ROLES)
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  async getTenantAudit(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query() query: GetTenantAuditQueryDto,
  ) {
    return this.auditService.findTenantEvents(id, query);
  }

  /**
   * GET /api/v1/platform/tenants/:id
   * Full PII-blind tenant details with overview, drives (max 50), billing status,
   * licensing, and retention.
   */
  @Get(':id')
  @PlatformRoles(...PLATFORM_READ_ROLES)
  async getTenantDetail(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<TenantDetailResponseDto> {
    return this.tenantsService.getTenantDetail(id);
  }

  /**
   * POST /api/v1/platform/tenants/:id/suspend
   * Suspends an ACTIVE tenant. Row lock prevents concurrent mutation races.
   */
  @Post(':id/suspend')
  @PlatformRoles(...PLATFORM_MUTATION_ROLES)
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  async suspendTenant(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: SuspendTenantDto,
    @Req() req: any,
  ) {
    const actor = {
      id: req.user?.sub || req.user?.id || 'system',
      role: req.user?.role || 'SUPPORT',
    };
    return this.tenantsService.suspendTenant(id, dto, actor);
  }

  /**
   * POST /api/v1/platform/tenants/:id/restore
   * Restores a SUSPENDED tenant to ACTIVE. Row lock prevents concurrent mutation races.
   */
  @Post(':id/restore')
  @PlatformRoles(...PLATFORM_MUTATION_ROLES)
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  async restoreTenant(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: RestoreTenantDto,
    @Req() req: any,
  ) {
    const actor = {
      id: req.user?.sub || req.user?.id || 'system',
      role: req.user?.role || 'SUPPORT',
    };
    return this.tenantsService.restoreTenant(id, dto, actor);
  }

  /**
   * PATCH /api/v1/platform/tenants/:id/walkthrough
   * Updates walkthrough checklist and sets walkthroughCompletedAt when all items are true.
   */
  @Patch(':id/walkthrough')
  @PlatformRoles(...PLATFORM_MUTATION_ROLES)
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  async updateWalkthrough(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: WalkthroughUpdateDto,
    @Req() req: any,
  ) {
    const actor = {
      id: req.user?.sub || req.user?.id || 'system',
      role: req.user?.role || 'SUPPORT',
    };
    return this.tenantsService.updateWalkthrough(id, dto, actor);
  }

  /**
   * PATCH /api/v1/platform/tenants/:id/owner
   * Assigns or unassigns an internal staff owner to the tenant.
   */
  @Patch(':id/owner')
  @PlatformRoles(...PLATFORM_MUTATION_ROLES)
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  async assignOwner(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: AssignTenantOwnerDto,
    @Req() req: any,
  ) {
    const actor = {
      id: req.user?.sub || req.user?.id || 'system',
      role: req.user?.role || 'SUPPORT',
    };
    return this.tenantsService.assignOwner(id, dto, actor);
  }

  /**
   * PATCH /api/v1/platform/tenants/:id/licensing
   * Updates license tier label (STARTER | GROWTH | ENTERPRISE).
   */
  @Patch(':id/licensing')
  @PlatformRoles(...PLATFORM_MUTATION_ROLES)
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  async updateLicenseTier(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateLicenseTierDto,
    @Req() req: any,
  ) {
    const actor = {
      id: req.user?.sub || req.user?.id || 'system',
      role: req.user?.role || 'SUPPORT',
    };
    return this.tenantsService.updateLicenseTier(id, dto, actor);
  }
}

