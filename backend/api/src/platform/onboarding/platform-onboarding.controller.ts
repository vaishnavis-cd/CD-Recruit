import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
  ParseUUIDPipe,
} from '@nestjs/common';
import { PlatformJwtAuthGuard } from '../auth/guards/platform-jwt-auth.guard';
import { PlatformRolesGuard } from '../auth/guards/platform-roles.guard';
import {
  PlatformRoles,
  PLATFORM_READ_ROLES,
  PLATFORM_MUTATION_ROLES,
} from '../auth/decorators/platform-roles.decorator';
import { PlatformOnboardingService } from './platform-onboarding.service';
import { PlatformTenantsService } from '../tenants/platform-tenants.service';
import {
  PipelineQueryDto,
  PipelineBoardResponseDto,
} from '../tenants/dto/platform-tenants.dto';
import {
  DomainCheckRequestDto,
  DomainCheckResponseDto,
  CreateDraftDto,
  UpdateDraftDto,
  CommitTenantResultDto,
} from './dto/onboarding.dto';

@Controller('platform/onboarding')
@UseGuards(PlatformJwtAuthGuard, PlatformRolesGuard)
export class PlatformOnboardingController {
  constructor(
    private readonly onboardingService: PlatformOnboardingService,
    private readonly tenantsService: PlatformTenantsService,
  ) {}

  /**
   * POST /api/v1/platform/onboarding/domain-check
   * Validates corporate domain, checks against disposable/free email providers and collisions.
   */
  @Post('domain-check')
  @PlatformRoles(...PLATFORM_READ_ROLES)
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  async checkDomain(@Body() dto: DomainCheckRequestDto): Promise<DomainCheckResponseDto> {
    return this.onboardingService.checkDomain(dto);
  }

  /**
   * POST /api/v1/platform/onboarding/drafts
   * Creates a new onboarding draft with 14 days expiration.
   */
  @Post('drafts')
  @PlatformRoles(...PLATFORM_MUTATION_ROLES)
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  async createDraft(@Body() dto: CreateDraftDto, @Req() req: any) {
    const actorId = req.user?.sub || req.user?.id || 'system';
    return this.onboardingService.createDraft(actorId, dto);
  }

  /**
   * GET /api/v1/platform/onboarding/drafts
   * Lists my non-expired, non-committed drafts (OWNER sees all).
   */
  @Get('drafts')
  @PlatformRoles(...PLATFORM_READ_ROLES)
  async listDrafts(@Req() req: any) {
    const actor = {
      id: req.user?.sub || req.user?.id || 'system',
      role: req.user?.role || 'SUPPORT',
    };
    return this.onboardingService.listDrafts(actor);
  }

  /**
   * GET /api/v1/platform/onboarding/drafts/:id
   * Retrieves a draft by ID.
   */
  @Get('drafts/:id')
  @PlatformRoles(...PLATFORM_READ_ROLES)
  async getDraft(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Req() req: any,
  ) {
    const actor = {
      id: req.user?.sub || req.user?.id || 'system',
      role: req.user?.role || 'SUPPORT',
    };
    return this.onboardingService.getDraft(id, actor);
  }

  /**
   * PUT /api/v1/platform/onboarding/drafts/:id
   * Autosaves draft progress and step data.
   */
  @Put('drafts/:id')
  @PlatformRoles(...PLATFORM_MUTATION_ROLES)
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  async updateDraft(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateDraftDto,
    @Req() req: any,
  ) {
    const actor = {
      id: req.user?.sub || req.user?.id || 'system',
      role: req.user?.role || 'SUPPORT',
    };
    return this.onboardingService.updateDraft(id, dto, actor);
  }

  /**
   * DELETE /api/v1/platform/onboarding/drafts/:id
   * Discards an uncommitted draft.
   */
  @Delete('drafts/:id')
  @PlatformRoles(...PLATFORM_MUTATION_ROLES)
  async deleteDraft(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Req() req: any,
  ) {
    const actor = {
      id: req.user?.sub || req.user?.id || 'system',
      role: req.user?.role || 'SUPPORT',
    };
    return this.onboardingService.deleteDraft(id, actor);
  }

  /**
   * POST /api/v1/platform/onboarding/drafts/:id/commit
   * Atomically commits draft and provisions the tenant organization, profile, admin, and billing account.
   */
  @Post('drafts/:id/commit')
  @PlatformRoles(...PLATFORM_MUTATION_ROLES)
  async commitDraft(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Req() req: any,
  ): Promise<CommitTenantResultDto> {
    const actor = {
      id: req.user?.sub || req.user?.id || 'system',
      role: req.user?.role || 'SUPPORT',
    };
    return this.onboardingService.commitDraft(id, actor);
  }

  /**
   * GET /api/v1/platform/onboarding/pipeline
   * Returns Kanban pipeline board columns (SIGNED_UP, TRIAL_ACTIVE, FIRST_DRIVE_CREATED, CONVERTED, DORMANT, UNKNOWN).
   */
  @Get('pipeline')
  @PlatformRoles(...PLATFORM_READ_ROLES)
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  async getPipeline(@Query() query: PipelineQueryDto): Promise<PipelineBoardResponseDto> {
    return this.tenantsService.getPipelineBoard(query);
  }
}

