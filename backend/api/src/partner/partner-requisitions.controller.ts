import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { PartnerApiKeyGuard } from "../common/guards/partner-api-key.guard";
import { CurrentPartner } from "../common/decorators/current-partner.decorator";
import { Partner } from "@prisma/client";
import { PartnerCandidatesService } from "./partner-candidates.service";

@Controller("partner/requisitions")
@UseGuards(PartnerApiKeyGuard)
export class PartnerRequisitionsController {
  constructor(
    private readonly partnerCandidatesService: PartnerCandidatesService,
  ) {}

  @Get(":ref/status")
  async getRequisitionStatus(
    @CurrentPartner() partner: Partner,
    @Param("ref") ref: string,
  ) {
    return this.partnerCandidatesService.getRequisitionStatus(partner, ref);
  }
}
