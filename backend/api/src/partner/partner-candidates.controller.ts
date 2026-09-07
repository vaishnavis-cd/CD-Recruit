import {
  Controller,
  Post,
  Body,
  UseGuards,
  UseInterceptors,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import {
  ApiTags,
  ApiSecurity,
  ApiOperation,
  ApiHeader,
  ApiBody,
  ApiResponse,
} from "@nestjs/swagger";
import { PartnerApiKeyGuard } from "../common/guards/partner-api-key.guard";
import { IdempotencyInterceptor } from "../common/interceptors/idempotency.interceptor";
import { CurrentPartner } from "../common/decorators/current-partner.decorator";
import { Partner } from "@prisma/client";
import { PartnerCandidatesService } from "./partner-candidates.service";
import { PushPartnerCandidatesDto } from "./dto/partner-candidates.dto";

@ApiTags("partner")
@ApiSecurity("X-API-Key")
@ApiHeader({
  name: "X-API-Key",
  description: "Partner API key issued from Settings → Integrations (pk_live_...)",
  required: true,
  example: "pk_live_YOUR_PARTNER_KEY_HERE",
})
@Controller("partner/candidates")
@UseGuards(PartnerApiKeyGuard)
@UseInterceptors(IdempotencyInterceptor)
export class PartnerCandidatesController {
  constructor(
    private readonly partnerCandidatesService: PartnerCandidatesService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Push candidates for a partner requisition",
    description:
      "Creates or upserts a Drive keyed on (partner_id, requisition_ref), resolves the active RoleTemplate for the given department + level, and generates 48-hour rolling assessment invites for each candidate. Returns assessment links directly.",
  })
  @ApiHeader({
    name: "Idempotency-Key",
    description: "Unique key scoped per partner. Re-using the same key within 24h returns the cached response.",
    required: false,
    example: "req-eng-2026-001-v1",
  })
  @ApiBody({
    description: "Partner candidate ingestion payload",
    schema: {
      type: "object",
      required: ["department_code", "requisition_ref", "candidates"],
      properties: {
        department_code: {
          type: "string",
          enum: ["SOFTWARE_ENGINEERING", "DATA_ENGINEERING", "PMO", "QA", "SYSOPS", "ITOPS", "SECOPS", "SRE"],
          example: "SOFTWARE_ENGINEERING",
          description: "Department enum value used to look up the active RoleTemplates",
        },
        category: {
          type: "string",
          enum: ["FRESHER", "EXPERIENCED"],
          example: "EXPERIENCED",
          description: "Candidate category ('FRESHER' or 'EXPERIENCED')",
        },
        level: {
          type: "string",
          example: "EXPERIENCED",
          description: "Legacy category field alias for backwards compatibility",
        },
        requisition_ref: {
          type: "string",
          example: "REQ-2026-ENG-001",
          description: "Unique ATS requisition reference — drives are upserted keyed on this",
        },
        drive_name: {
          type: "string",
          example: "Senior Full-Stack Sprint",
          description: "Optional custom drive title",
        },
        candidates: {
          type: "array",
          description: "Batch array of candidates (supports up to 1,000 candidates in <2-5s)",
          items: {
            type: "object",
            required: ["name", "email"],
            properties: {
              name: { type: "string", example: "Jane Doe" },
              email: { type: "string", format: "email", example: "jane.doe@example.com" },
              level: {
                type: "string",
                example: "2-5",
                description:
                  "Candidate experience tier. For EXPERIENCED: '2-5' (Level 1), '6-10' (Level 2), '11-15' (Level 3). For FRESHER: '0-1'",
              },
              phone: { type: "string", example: "+1234567890" },
              external_candidate_ref: { type: "string", example: "ext-cand-101" },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: "Candidates ingested successfully with assessment links" })
  @ApiResponse({ status: 401, description: "Missing or invalid X-API-Key" })
  @ApiResponse({ status: 422, description: "No active RoleTemplate found for the given department + level" })
  async pushCandidates(
    @CurrentPartner() partner: Partner,
    @Body() dto: PushPartnerCandidatesDto,
  ) {
    return this.partnerCandidatesService.pushCandidates(partner, dto);
  }
}
