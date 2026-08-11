import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import {
  ApiTags,
  ApiSecurity,
  ApiOperation,
  ApiHeader,
  ApiParam,
  ApiResponse,
} from "@nestjs/swagger";
import { PartnerApiKeyGuard } from "../common/guards/partner-api-key.guard";
import { CurrentPartner } from "../common/decorators/current-partner.decorator";
import { Partner } from "@prisma/client";
import { PartnerCandidatesService } from "./partner-candidates.service";

@ApiTags("partner")
@ApiSecurity("X-API-Key")
@ApiHeader({
  name: "X-API-Key",
  description: "Partner API key issued from Settings → Integrations (pk_live_...)",
  required: true,
  example: "pk_live_822aab083e827cfc8a583514b51ff47638ad3515ed0f44f7",
})
@Controller("partner/requisitions")
@UseGuards(PartnerApiKeyGuard)
export class PartnerRequisitionsController {
  constructor(
    private readonly partnerCandidatesService: PartnerCandidatesService,
  ) {}

  @Get(":ref/status")
  @ApiOperation({
    summary: "Poll requisition status",
    description:
      "Returns per-candidate assessment status, score_status, and composite_score_band for a given requisition_ref. Score fields are only populated from real persisted Score rows — never placeholder values.",
  })
  @ApiParam({
    name: "ref",
    description: "The ATS requisition reference (e.g. REQ-2026-ENG-001)",
    example: "REQ-2026-ENG-001",
  })
  @ApiResponse({
    status: 200,
    description: "Requisition status with per-candidate results",
    schema: {
      type: "object",
      properties: {
        requisition_ref: { type: "string", example: "REQ-2026-ENG-001" },
        drive_id: { type: "string", format: "uuid" },
        candidates: {
          type: "array",
          items: {
            type: "object",
            properties: {
              candidate_email: { type: "string" },
              candidate_name: { type: "string" },
              invite_status: { type: "string", enum: ["PENDING", "OPENED", "COMPLETED", "EXPIRED"] },
              score_status: { type: "string", enum: ["PENDING", "SCORED"], nullable: true },
              composite_score_band: { type: "string", enum: ["STRONG_PASS", "PASS", "BORDERLINE", "FAIL"], nullable: true },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: "Missing or invalid X-API-Key" })
  @ApiResponse({ status: 404, description: "Requisition ref not found for this partner" })
  async getRequisitionStatus(
    @CurrentPartner() partner: Partner,
    @Param("ref") ref: string,
  ) {
    return this.partnerCandidatesService.getRequisitionStatus(partner, ref);
  }
}
