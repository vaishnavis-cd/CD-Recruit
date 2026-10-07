import {
  Injectable,
  Logger,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
  ConflictException,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import { PrismaService } from "../../prisma/prisma.service";
import { PlatformStaffRole } from "@cd-recruit/shared-types";
import {
  PriceBookActor,
  PriceBookEntryResultDto,
  PublishPriceBookEntryDto,
  ListCatalogOptions,
  RetirePriceBookEntryOptions,
  PoolType,
  SUPPORTED_BILLING_COUNTRIES,
  SupportedBillingCountry,
  deriveCurrencyForCountry,
} from "./price-book.types";

@Injectable()
export class PriceBookService {
  private readonly logger = new Logger(PriceBookService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Validates and extracts actor info.
   * Enforces that only PlatformStaff can modify pricing catalogs.
   */
  private extractStaffActor(actor: PriceBookActor): {
    actorId: string;
    actorRole: PlatformStaffRole;
  } {
    if (!actor || typeof actor !== "object") {
      throw new UnauthorizedException("AUTHENTICATION_REQUIRED: Valid PlatformStaff actor required");
    }

    if (actor.isPlatformStaff !== true) {
      throw new ForbiddenException(
        "PLATFORM_ROLE_REQUIRED: Only authenticated PlatformStaff can publish or modify price book entries",
      );
    }

    const role = (actor.platformRole || actor.role) as PlatformStaffRole;
    if (!role || !Object.values(PlatformStaffRole).includes(role)) {
      throw new BadRequestException("INVALID_ACTOR_ROLE: Actor must possess a valid PlatformStaffRole");
    }

    return { actorId: actor.id, actorRole: role };
  }

  /**
   * Enforces Artifact 06 §3.2:
   * Only FINANCE and OWNER roles can publish or retire price book entries.
   * SUPPORT and Recruiter roles are strictly forbidden.
   */
  private ensurePublishPermission(actorRole: PlatformStaffRole): void {
    if (actorRole !== PlatformStaffRole.FINANCE && actorRole !== PlatformStaffRole.OWNER) {
      throw new ForbiddenException(
        `PRICE_PUBLISH_FORBIDDEN: Platform role '${actorRole}' is not authorized to publish or modify pricing. Only FINANCE or OWNER allowed.`,
      );
    }
  }

  /**
   * Maps raw Prisma PriceBookEntry to canonical PriceBookEntryResultDto.
   */
  private mapEntry(entry: any): PriceBookEntryResultDto {
    return {
      id: entry.id,
      sku: entry.sku,
      poolType: entry.poolType,
      credits: entry.credits,
      validityDays: entry.validityDays,
      billingCountry: entry.billingCountry,
      currency: entry.currency,
      unitPriceMinor: entry.unitPriceMinor,
      version: entry.version,
      effectiveFrom: entry.effectiveFrom,
      effectiveTo: entry.effectiveTo,
    };
  }

  /**
   * 1. GET ACTIVE PRICE
   * Returns the price book entry effective for (sku, country) at the given timestamp (defaults to now).
   *
   * Invariants enforced:
   * - SKU must be non-empty string.
   * - Country must be a supported ISO-2 country (IN, US, MY).
   * - Lookup finds entry where effective_from <= asOf AND (effective_to IS NULL OR effective_to > asOf).
   * - Deterministic: Ordered by version DESC.
   * - Throws NotFoundException if no active price exists.
   */
  async getActivePrice(
    sku: string,
    country: string,
    asOf?: Date,
  ): Promise<PriceBookEntryResultDto> {
    if (!sku || typeof sku !== "string" || sku.trim() === "") {
      throw new BadRequestException("INVALID_SKU: SKU code is required");
    }

    if (!country || typeof country !== "string" || country.trim() === "") {
      throw new BadRequestException("INVALID_COUNTRY: Country code is required");
    }

    const normalizedSku = sku.trim().toUpperCase();
    const normalizedCountry = country.trim().toUpperCase();

    if (!SUPPORTED_BILLING_COUNTRIES.includes(normalizedCountry as SupportedBillingCountry)) {
      throw new BadRequestException(
        `UNSUPPORTED_BILLING_COUNTRY: Billing country '${country}' is not supported. Supported countries: ${SUPPORTED_BILLING_COUNTRIES.join(", ")}`,
      );
    }

    const lookupTime = asOf ? new Date(asOf) : new Date();
    if (isNaN(lookupTime.getTime())) {
      throw new BadRequestException("INVALID_TIMESTAMP: asOf must be a valid Date");
    }

    const entry = await this.prisma.priceBookEntry.findFirst({
      where: {
        sku: normalizedSku,
        billingCountry: normalizedCountry,
        effectiveFrom: { lte: lookupTime },
        OR: [
          { effectiveTo: null },
          { effectiveTo: { gt: lookupTime } },
        ],
      },
      orderBy: {
        version: "desc",
      },
    });

    if (!entry) {
      throw new NotFoundException(
        `NO_ACTIVE_PRICE: No active price book entry found for SKU '${normalizedSku}' in country '${normalizedCountry}' as of ${lookupTime.toISOString()}`,
      );
    }

    return this.mapEntry(entry);
  }

  /**
   * 2. HISTORICAL PRICE LOOKUP
   * Deterministic historical lookup for a given timestamp.
   * Convenience alias delegating to getActivePrice with explicit timestamp requirement.
   */
  async getHistoricalPrice(
    sku: string,
    country: string,
    asOf: Date,
  ): Promise<PriceBookEntryResultDto> {
    if (!asOf || !(asOf instanceof Date) || isNaN(asOf.getTime())) {
      throw new BadRequestException("INVALID_TIMESTAMP: asOf must be a valid Date object");
    }
    return this.getActivePrice(sku, country, asOf);
  }

  /**
   * 3. GET ENTRY BY ID
   * Direct fetch by UUID.
   */
  async getPriceEntryById(id: string): Promise<PriceBookEntryResultDto> {
    if (!id || typeof id !== "string" || id.trim() === "") {
      throw new BadRequestException("INVALID_ENTRY_ID: Price book entry ID is required");
    }

    const entry = await this.prisma.priceBookEntry.findUnique({
      where: { id: id.trim() },
    });

    if (!entry) {
      throw new NotFoundException(`PRICE_BOOK_ENTRY_NOT_FOUND: Price book entry '${id}' not found`);
    }

    return this.mapEntry(entry);
  }

  /**
   * 4. LIST CATALOG
   * Lists catalog entries with optional country, sku, or activeOnly filtering.
   * Ordered deterministically: billingCountry ASC, sku ASC, version DESC.
   */
  async listCatalog(
    countryOrOptions?: string | ListCatalogOptions,
  ): Promise<PriceBookEntryResultDto[]> {
    let options: ListCatalogOptions = {};

    if (typeof countryOrOptions === "string") {
      options = { country: countryOrOptions };
    } else if (countryOrOptions && typeof countryOrOptions === "object") {
      options = countryOrOptions;
    }

    const where: any = {};

    if (options.country && options.country.trim() !== "") {
      const normalizedCountry = options.country.trim().toUpperCase();
      if (!SUPPORTED_BILLING_COUNTRIES.includes(normalizedCountry as SupportedBillingCountry)) {
        throw new BadRequestException(
          `UNSUPPORTED_BILLING_COUNTRY: Billing country '${options.country}' is not supported. Supported: ${SUPPORTED_BILLING_COUNTRIES.join(", ")}`,
        );
      }
      where.billingCountry = normalizedCountry;
    }

    if (options.sku && options.sku.trim() !== "") {
      where.sku = options.sku.trim().toUpperCase();
    }

    if (options.activeOnly) {
      const asOf = options.asOf ? new Date(options.asOf) : new Date();
      where.effectiveFrom = { lte: asOf };
      where.OR = [
        { effectiveTo: null },
        { effectiveTo: { gt: asOf } },
      ];
    }

    const entries = await this.prisma.priceBookEntry.findMany({
      where,
      orderBy: [
        { billingCountry: "asc" },
        { sku: "asc" },
        { version: "desc" },
      ],
    });

    return entries.map((e) => this.mapEntry(e));
  }

  /**
   * 5. PUBLISH NEW VERSION
   * Publishes a new immutable version of a Price Book entry.
   *
   * Invariants enforced (Artifact 02 §7.1, Artifact 04 §1.6, Artifact 06 §3.2):
   * - Platform staff authentication: FINANCE or OWNER role required.
   * - SKU, poolType, credits, validityDays, billingCountry, currency, unitPriceMinor validated.
   * - unitPriceMinor must be positive integer (> 0).
   * - credits must be positive integer (>= 1).
   * - currency must strictly match country commercial policy (INR for IN, USD for US, MYR for MY).
   * - Serialized concurrency: uses PostgreSQL advisory transaction lock + row locks to guarantee
   *   zero duplicate active versions and strict version sequence incrementing.
   * - Prior active version has its effective_to set to new version's effectiveFrom.
   * - Audited in billing.billing_audit_event.
   * - Price is NOT money movement: zero ledger mutations, zero pool mutations.
   */
  async publishNewVersion(
    actor: PriceBookActor,
    dto: PublishPriceBookEntryDto,
  ): Promise<PriceBookEntryResultDto> {
    const actorInfo = this.extractStaffActor(actor);
    this.ensurePublishPermission(actorInfo.actorRole);

    if (!dto || typeof dto !== "object") {
      throw new BadRequestException("INVALID_DTO: DTO object is required");
    }

    // Validate SKU
    if (!dto.sku || typeof dto.sku !== "string" || dto.sku.trim() === "") {
      throw new BadRequestException("INVALID_SKU: SKU code is required");
    }
    const normalizedSku = dto.sku.trim().toUpperCase();
    if (normalizedSku.length > 64) {
      throw new BadRequestException("INVALID_SKU: SKU code cannot exceed 64 characters");
    }

    // Validate PoolType
    const validPoolTypes = Object.values(PoolType);
    if (!dto.poolType || !validPoolTypes.includes(dto.poolType as PoolType)) {
      throw new BadRequestException(
        `INVALID_POOL_TYPE: Pool type '${dto.poolType}' is invalid. Supported: ${validPoolTypes.join(", ")}`,
      );
    }

    // Validate Credits
    if (
      typeof dto.credits !== "number" ||
      !Number.isInteger(dto.credits) ||
      dto.credits < 1
    ) {
      throw new BadRequestException("INVALID_CREDITS: Credits must be a positive integer >= 1");
    }

    // Validate ValidityDays
    if (dto.validityDays !== undefined && dto.validityDays !== null) {
      if (
        typeof dto.validityDays !== "number" ||
        !Number.isInteger(dto.validityDays) ||
        dto.validityDays < 1
      ) {
        throw new BadRequestException("INVALID_VALIDITY_DAYS: Validity days must be a positive integer >= 1");
      }
    }

    // Validate Country & Currency
    if (!dto.billingCountry || typeof dto.billingCountry !== "string" || dto.billingCountry.trim() === "") {
      throw new BadRequestException("INVALID_COUNTRY: Billing country is required");
    }
    const normalizedCountry = dto.billingCountry.trim().toUpperCase() as SupportedBillingCountry;
    if (!SUPPORTED_BILLING_COUNTRIES.includes(normalizedCountry)) {
      throw new BadRequestException(
        `UNSUPPORTED_BILLING_COUNTRY: Billing country '${dto.billingCountry}' is not supported. Supported: ${SUPPORTED_BILLING_COUNTRIES.join(", ")}`,
      );
    }

    const derivedCurrency = deriveCurrencyForCountry(normalizedCountry, dto.currency);

    // Validate Unit Price Minor (positive integer minor units, e.g. 5000 = ₹50.00, 200 = $2.00)
    if (
      typeof dto.unitPriceMinor !== "number" ||
      !Number.isInteger(dto.unitPriceMinor) ||
      dto.unitPriceMinor < 1
    ) {
      throw new BadRequestException(
        "INVALID_UNIT_PRICE: Unit price minor must be a positive integer in minor units (> 0)",
      );
    }

    // Effective Date
    let effectiveFromDate = new Date();
    if (dto.effectiveFrom) {
      effectiveFromDate = new Date(dto.effectiveFrom);
      if (isNaN(effectiveFromDate.getTime())) {
        throw new BadRequestException("INVALID_EFFECTIVE_DATE: effectiveFrom must be a valid date string or Date");
      }
    }

    // Execute publication atomically inside transaction
    return await this.prisma.$transaction(async (tx) => {
      // Advisory xact lock per (sku, country) prevents concurrency race between two transactions
      // attempting to publish the first version or increment to the next version simultaneously.
      await tx.$executeRawUnsafe(
        `SELECT pg_advisory_xact_lock(hashtext($1))`,
        `price_book:${normalizedSku}:${normalizedCountry}`,
      );

      // Lock and fetch existing versions for (sku, country)
      const existingRows = await tx.$queryRawUnsafe<
        Array<{
          id: string;
          version: number;
          effective_from: Date;
          effective_to: Date | null;
          unit_price_minor: number;
          credits: number;
          currency: string;
        }>
      >(
        `SELECT id, version, effective_from, effective_to, unit_price_minor, credits, currency
         FROM "billing"."price_book_entry"
         WHERE sku = $1 AND billing_country = $2
         ORDER BY version DESC
         FOR UPDATE`,
        normalizedSku,
        normalizedCountry,
      );

      let nextVersion = 1;
      let priorVersion: (typeof existingRows)[0] | null = null;

      if (existingRows.length > 0) {
        priorVersion = existingRows[0];
        nextVersion = priorVersion.version + 1;

        const priorEffectiveFrom = new Date(priorVersion.effective_from);
        if (effectiveFromDate < priorEffectiveFrom) {
          throw new BadRequestException(
            `INVALID_EFFECTIVE_DATE: New price version effectiveFrom (${effectiveFromDate.toISOString()}) cannot precede previous version's effectiveFrom (${priorEffectiveFrom.toISOString()})`,
          );
        }

        // Retire prior active version by setting effective_to = effectiveFrom of new version
        if (priorVersion.effective_to === null || new Date(priorVersion.effective_to) > effectiveFromDate) {
          await tx.$executeRawUnsafe(
            `UPDATE "billing"."price_book_entry" SET effective_to = $1 WHERE id = $2`,
            effectiveFromDate,
            priorVersion.id,
          );
        }
      }

      const newId = randomUUID();

      const createdEntry = await tx.priceBookEntry.create({
        data: {
          id: newId,
          sku: normalizedSku,
          poolType: dto.poolType as any,
          credits: dto.credits,
          validityDays: dto.validityDays ?? null,
          billingCountry: normalizedCountry,
          currency: derivedCurrency,
          unitPriceMinor: dto.unitPriceMinor,
          version: nextVersion,
          effectiveFrom: effectiveFromDate,
          effectiveTo: null,
        },
      });

      // Write immutable audit log to billing.billing_audit_event
      await tx.billingAuditEvent.create({
        data: {
          actorId: actorInfo.actorId,
          actorRole: actorInfo.actorRole,
          subjectType: "PRICE_BOOK_ENTRY",
          subjectId: newId,
          action: "PRICE_VERSION_PUBLISHED",
          before: priorVersion
            ? {
                id: priorVersion.id,
                version: priorVersion.version,
                unitPriceMinor: priorVersion.unit_price_minor,
                credits: priorVersion.credits,
                currency: priorVersion.currency,
                effectiveFrom: priorVersion.effective_from,
                effectiveTo: effectiveFromDate,
              }
            : null,
          after: {
            id: newId,
            sku: normalizedSku,
            version: nextVersion,
            unitPriceMinor: dto.unitPriceMinor,
            credits: dto.credits,
            currency: derivedCurrency,
            billingCountry: normalizedCountry,
            effectiveFrom: effectiveFromDate,
            effectiveTo: null,
          },
          reason: dto.reason?.trim() || "Publish new price book version",
          ticketRef: dto.ticketRef?.trim() || null,
          executionResult: "SUCCESS",
        },
      });

      this.logger.log(
        `[PriceBookService] Published new PriceBookEntry: ${normalizedSku} v${nextVersion} (${normalizedCountry}, ${derivedCurrency} ${dto.unitPriceMinor} minor) by ${actorInfo.actorRole}:${actorInfo.actorId}`,
      );

      return this.mapEntry(createdEntry);
    });
  }

  /**
   * 6. RETIRE PRICE ENTRY
   * Retires an active price book entry without publishing an immediate replacement.
   * Enforces FINANCE/OWNER role and records an immutable audit log.
   */
  async retirePriceEntry(
    actor: PriceBookActor,
    id: string,
    options?: RetirePriceBookEntryOptions,
  ): Promise<PriceBookEntryResultDto> {
    const actorInfo = this.extractStaffActor(actor);
    this.ensurePublishPermission(actorInfo.actorRole);

    if (!id || typeof id !== "string" || id.trim() === "") {
      throw new BadRequestException("INVALID_ENTRY_ID: Price book entry ID is required");
    }

    const retiredAt = options?.retiredAt ? new Date(options.retiredAt) : new Date();
    if (isNaN(retiredAt.getTime())) {
      throw new BadRequestException("INVALID_RETIRED_DATE: retiredAt must be a valid Date");
    }

    return await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRawUnsafe<
        Array<{
          id: string;
          sku: string;
          billing_country: string;
          version: number;
          effective_from: Date;
          effective_to: Date | null;
          unit_price_minor: number;
        }>
      >(
        `SELECT id, sku, billing_country, version, effective_from, effective_to, unit_price_minor
         FROM "billing"."price_book_entry"
         WHERE id = $1
         FOR UPDATE`,
        id.trim(),
      );

      if (rows.length === 0) {
        throw new NotFoundException(`PRICE_BOOK_ENTRY_NOT_FOUND: Price book entry '${id}' not found`);
      }

      const entry = rows[0];

      if (entry.effective_to !== null && new Date(entry.effective_to) <= retiredAt) {
        throw new ConflictException(
          `PRICE_ALREADY_RETIRED: Price book entry '${id}' is already retired (effectiveTo: ${new Date(entry.effective_to).toISOString()})`,
        );
      }

      await tx.$executeRawUnsafe(
        `UPDATE "billing"."price_book_entry" SET effective_to = $1 WHERE id = $2`,
        retiredAt,
        entry.id,
      );

      await tx.billingAuditEvent.create({
        data: {
          actorId: actorInfo.actorId,
          actorRole: actorInfo.actorRole,
          subjectType: "PRICE_BOOK_ENTRY",
          subjectId: entry.id,
          action: "PRICE_ENTRY_RETIRED",
          before: {
            id: entry.id,
            sku: entry.sku,
            version: entry.version,
            effectiveFrom: entry.effective_from,
            effectiveTo: entry.effective_to,
          },
          after: {
            id: entry.id,
            sku: entry.sku,
            version: entry.version,
            effectiveFrom: entry.effective_from,
            effectiveTo: retiredAt,
          },
          reason: options?.reason?.trim() || "Price entry retired",
          ticketRef: options?.ticketRef?.trim() || null,
          executionResult: "SUCCESS",
        },
      });

      const updated = await tx.priceBookEntry.findUnique({
        where: { id: entry.id },
      });

      return this.mapEntry(updated);
    });
  }
}
