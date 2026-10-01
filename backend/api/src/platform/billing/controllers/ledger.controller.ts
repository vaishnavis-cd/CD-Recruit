import {
  Controller,
  Get,
  Query,
  UseGuards,
  Res,
} from "@nestjs/common";
import { Response } from "express";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { PlatformJwtAuthGuard } from "../../auth/guards/platform-jwt-auth.guard";
import { PlatformRolesGuard } from "../../auth/guards/platform-roles.guard";
import { PlatformRoles } from "../../auth/decorators/platform-roles.decorator";
import { PlatformStaffRole } from "@cd-recruit/shared-types";
import { LedgerService } from "../../../billing/ledger/ledger.service";
import { ListLedgerQueryDto, ExportLedgerQueryDto } from "../dto/ledger.dto";

@ApiTags("Platform Ledger Explorer")
@ApiBearerAuth()
@Controller("platform/billing/ledger")
@UseGuards(PlatformJwtAuthGuard, PlatformRolesGuard)
export class LedgerController {
  constructor(private readonly ledgerService: LedgerService) {}

  /**
   * API-H2-06: Searchable, pseudonymous ledger explorer with filters.
   */
  @Get()
  @PlatformRoles(PlatformStaffRole.SUPPORT, PlatformStaffRole.FINANCE, PlatformStaffRole.OWNER)
  @ApiOperation({ summary: "Query append-only ledger entries (API-H2-06)" })
  async getLedgerEntries(@Query() query: ListLedgerQueryDto) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 50));
    const offset = (page - 1) * limit;

    const entries = await this.ledgerService.getLedgerEntries({
      billingAccountId: query.billingAccountId,
      creditPoolId: query.creditPoolId,
      sessionId: query.sessionId,
      driveId: query.driveId,
      entryType: query.entryType,
      reason: query.reason,
      startDate: query.startDate,
      endDate: query.endDate,
      includeShadow: query.includeShadow,
      limit,
      offset,
    });

    return {
      data: entries,
      meta: {
        page,
        limit,
      },
    };
  }

  /**
   * API-H2-07: Download pseudonymous billing CSV (strictly UUIDs, zero candidate PII).
   */
  @Get("export")
  @PlatformRoles(PlatformStaffRole.SUPPORT, PlatformStaffRole.FINANCE, PlatformStaffRole.OWNER)
  @ApiOperation({ summary: "Export pseudonymous ledger CSV (API-H2-07)" })
  async exportLedgerCsv(
    @Query() query: ExportLedgerQueryDto,
    @Res() res: Response,
  ) {
    const csvContent = await this.ledgerService.exportLedgerCsv({
      billingAccountId: query.billingAccountId,
      creditPoolId: query.creditPoolId,
      sessionId: query.sessionId,
      driveId: query.driveId,
      entryType: query.entryType,
      reason: query.reason,
      startDate: query.startDate,
      endDate: query.endDate,
      includeShadow: query.includeShadow,
    });

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="billing-ledger-export-${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    return res.status(200).send(csvContent);
  }
}
