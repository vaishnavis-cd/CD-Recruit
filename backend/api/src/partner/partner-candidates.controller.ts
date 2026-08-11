import {
  Controller,
  Post,
  Body,
  UseGuards,
  UseInterceptors,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { PartnerApiKeyGuard } from "../common/guards/partner-api-key.guard";
import { IdempotencyInterceptor } from "../common/interceptors/idempotency.interceptor";
import { CurrentPartner } from "../common/decorators/current-partner.decorator";
import { Partner } from "@prisma/client";
import { PartnerCandidatesService } from "./partner-candidates.service";
import { PushPartnerCandidatesDto } from "./dto/partner-candidates.dto";

@Controller("partner/candidates")
@UseGuards(PartnerApiKeyGuard)
@UseInterceptors(IdempotencyInterceptor)
export class PartnerCandidatesController {
  constructor(
    private readonly partnerCandidatesService: PartnerCandidatesService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async pushCandidates(
    @CurrentPartner() partner: Partner,
    @Body() dto: PushPartnerCandidatesDto,
  ) {
    return this.partnerCandidatesService.pushCandidates(partner, dto);
  }
}
