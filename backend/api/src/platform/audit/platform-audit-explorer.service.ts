import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { PlatformAuditService } from "./platform-audit.service";
import {
  QueryAuditEventsDto,
  CommonAuditEventDto,
  AuditEventChangeDiff,
  AuditEventDetailDto,
  AuditFiltersDto,
} from "./dto/platform-audit-explorer.dto";
import { sanitizeAuditData } from "./platform-audit.util";

const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,7}\b/g;

/**
 * Recursively redacts email patterns from strings, objects, and arrays.
 */
function redactEmails(val: any): any {
  if (val === null || val === undefined) return val;
  if (typeof val === "string") {
    return val.replace(EMAIL_REGEX, "[email]");
  }
  if (Array.isArray(val)) {
    return val.map(redactEmails);
  }
  if (typeof val === "object" && !(val instanceof Date)) {
    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      result[k] = redactEmails(v);
    }
    return result;
  }
  return val;
}

/**
 * Computes dot-path changes diff between before and after JSON objects.
 */
export function computeChanges(before: any, after: any, prefix = ""): AuditEventChangeDiff[] {
  const changes: AuditEventChangeDiff[] = [];

  const b = before && typeof before === "object" && !Array.isArray(before) ? before : {};
  const a = after && typeof after === "object" && !Array.isArray(after) ? after : {};

  // If before or after is a primitive or array directly
  if (
    (before !== undefined && (typeof before !== "object" || Array.isArray(before) || before === null)) ||
    (after !== undefined && (typeof after !== "object" || Array.isArray(after) || after === null))
  ) {
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      changes.push({
        path: prefix || "value",
        before: redactEmails(sanitizeAuditData(before)),
        after: redactEmails(sanitizeAuditData(after)),
      });
    }
    return changes;
  }

  const allKeys = Array.from(new Set([...Object.keys(b), ...Object.keys(a)]));

  for (const key of allKeys) {
    const currentPath = prefix ? `${prefix}.${key}` : key;
    const valBefore = b[key];
    const valAfter = a[key];

    const hasBefore = key in b;
    const hasAfter = key in a;

    if (hasBefore && hasAfter) {
      if (
        typeof valBefore === "object" &&
        valBefore !== null &&
        !Array.isArray(valBefore) &&
        typeof valAfter === "object" &&
        valAfter !== null &&
        !Array.isArray(valAfter)
      ) {
        changes.push(...computeChanges(valBefore, valAfter, currentPath));
      } else if (JSON.stringify(valBefore) !== JSON.stringify(valAfter)) {
        changes.push({
          path: currentPath,
          before: redactEmails(sanitizeAuditData(valBefore)),
          after: redactEmails(sanitizeAuditData(valAfter)),
        });
      }
    } else if (hasBefore) {
      changes.push({
        path: currentPath,
        before: redactEmails(sanitizeAuditData(valBefore)),
        after: null,
      });
    } else if (hasAfter) {
      changes.push({
        path: currentPath,
        before: null,
        after: redactEmails(sanitizeAuditData(valAfter)),
      });
    }
  }

  return changes;
}

/**
 * Protects CSV cells against CSV formula injection and redacts emails.
 */
export function sanitizeCsvCell(val: any): string {
  if (val === null || val === undefined) return '""';
  let str = String(val);
  // Redact email addresses
  str = str.replace(EMAIL_REGEX, "[email]");
  // Formula injection defense: prefix with single quote if leading char is =, +, -, @, tab, CR
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'` + str;
  }
  // Escape double quotes and enclose
  return `"${str.replace(/"/g, '""')}"`;
}

@Injectable()
export class PlatformAuditExplorerService {
  private readonly logger = new Logger(PlatformAuditExplorerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly platformAuditService: PlatformAuditService,
  ) {}

  /**
   * Unified Keyset-Cursor Paginated Audit Explorer Query.
   */
  async findUnifiedEvents(query: QueryAuditEventsDto): Promise<{
    ok: boolean;
    items: CommonAuditEventDto[];
    nextCursor: string | null;
  }> {
    const { fromDate, toDate } = this.validateDateRange(query.from, query.to);
    const limit = query.limit ? Math.min(Math.max(1, query.limit), 100) : 50;
    const cursor = this.parseCursor(query.cursor);

    if (query.search && query.search.length > 100) {
      throw new BadRequestException("SEARCH_TOO_LONG: Search term cannot exceed 100 characters");
    }

    const source = query.source || "ALL";
    const take = limit + 1;

    let sysEvents: any[] = [];
    let billEvents: any[] = [];

    if (source === "PLATFORM" || source === "ALL") {
      const where = this.buildPlatformWhereClause(query, fromDate, toDate, cursor);
      sysEvents = await this.prisma.systemAuditEvent.findMany({
        where,
        orderBy: [{ timestamp: "desc" }, { id: "desc" }],
        take,
      });
    }

    let tenantBillingAccountId: string | null = null;
    if (query.targetTenantId) {
      const org = await this.prisma.organization.findUnique({
        where: { id: query.targetTenantId },
        select: { billingAccountId: true },
      });
      tenantBillingAccountId = org?.billingAccountId || null;
    }

    if (source === "BILLING" || source === "ALL") {
      const where = this.buildBillingWhereClause(query, fromDate, toDate, cursor, tenantBillingAccountId);
      billEvents = await this.prisma.billingAuditEvent.findMany({
        where,
        orderBy: [{ timestamp: "desc" }, { id: "desc" }],
        take,
      });
    }

    const mappedSys: CommonAuditEventDto[] = sysEvents.map((e) => ({
      id: e.id,
      source: "PLATFORM" as const,
      occurredAt: e.timestamp.toISOString(),
      actorId: e.actorId,
      actorRole: e.actorRole,
      subjectType: e.subjectType,
      subjectId: e.subjectId,
      action: e.action,
      targetTenantId: e.targetTenantId || (e.subjectType === "TENANT" ? e.subjectId : null),
      tenantName: null,
      reason: e.reason ? redactEmails(e.reason) : null,
      ticketRef: e.ticketRef,
      executionResult: e.executionResult,
      requestId: e.requestId,
      hasDiff: Boolean(e.before && Object.keys(e.before).length > 0) || Boolean(e.after && Object.keys(e.after).length > 0),
    }));

    const mappedBill: CommonAuditEventDto[] = billEvents.map((e) => ({
      id: e.id,
      source: "BILLING" as const,
      occurredAt: e.timestamp.toISOString(),
      actorId: e.actorId,
      actorRole: e.actorRole,
      subjectType: e.subjectType,
      subjectId: e.subjectId,
      action: e.action,
      targetTenantId: e.subjectType === "TENANT" ? e.subjectId : (query.targetTenantId && e.billingAccountId === tenantBillingAccountId ? query.targetTenantId : null),
      tenantName: null,
      reason: e.reason ? redactEmails(e.reason) : null,
      ticketRef: e.ticketRef,
      executionResult: e.executionResult,
      requestId: e.requestId,
      hasDiff: Boolean(e.before && Object.keys(e.before).length > 0) || Boolean(e.after && Object.keys(e.after).length > 0),
    }));

    // Merge-sort deterministic by timestamp DESC, id DESC
    const merged = [...mappedSys, ...mappedBill].sort((a, b) => {
      const timeA = new Date(a.occurredAt).getTime();
      const timeB = new Date(b.occurredAt).getTime();
      if (timeA !== timeB) return timeB - timeA;
      return b.id.localeCompare(a.id);
    });

    const hasMore = merged.length > limit;
    const pageItems = merged.slice(0, limit);

    // Batch resolve tenant names
    const tenantIds = Array.from(
      new Set(pageItems.map((item) => item.targetTenantId).filter(Boolean)),
    ) as string[];

    if (tenantIds.length > 0) {
      const orgs = await this.prisma.organization.findMany({
        where: { id: { in: tenantIds } },
        select: { id: true, name: true },
      });
      const orgMap = new Map(orgs.map((o) => [o.id, o.name]));
      pageItems.forEach((item) => {
        if (item.targetTenantId) {
          item.tenantName = orgMap.get(item.targetTenantId) || null;
        }
      });
    }

    const nextCursor = hasMore && pageItems.length > 0
      ? Buffer.from(
          JSON.stringify({
            t: pageItems[pageItems.length - 1].occurredAt,
            id: pageItems[pageItems.length - 1].id,
          }),
        ).toString("base64")
      : null;

    return {
      ok: true,
      items: pageItems,
      nextCursor,
    };
  }

  /**
   * Detail endpoint with computed dot-path changes diff.
   */
  async getEventDetail(source: string, id: string): Promise<{ ok: boolean; event: AuditEventDetailDto }> {
    if (source !== "PLATFORM" && source !== "BILLING") {
      throw new BadRequestException("INVALID_AUDIT_SOURCE: source must be PLATFORM or BILLING");
    }

    let event: any = null;
    if (source === "PLATFORM") {
      event = await this.prisma.systemAuditEvent.findUnique({ where: { id } });
    } else {
      event = await this.prisma.billingAuditEvent.findUnique({ where: { id } });
    }

    if (!event) {
      throw new NotFoundException(`AUDIT_EVENT_NOT_FOUND: Audit event with id '${id}' not found`);
    }

    const sanitizedBefore = event.before ? sanitizeAuditData(event.before) : null;
    const sanitizedAfter = event.after ? sanitizeAuditData(event.after) : null;
    const sanitizedImpersonation = event.impersonationContext ? sanitizeAuditData(event.impersonationContext) : null;

    const changes = computeChanges(sanitizedBefore, sanitizedAfter);

    let targetTenantId = source === "PLATFORM"
      ? event.targetTenantId || (event.subjectType === "TENANT" ? event.subjectId : null)
      : (event.subjectType === "TENANT" ? event.subjectId : null);

    let tenantName: string | null = null;
    if (!targetTenantId && source === "BILLING" && event.billingAccountId) {
      const org = await this.prisma.organization.findFirst({
        where: { billingAccountId: event.billingAccountId },
        select: { id: true, name: true },
      });
      if (org) {
        targetTenantId = org.id;
        tenantName = org.name;
      }
    } else if (targetTenantId) {
      const org = await this.prisma.organization.findUnique({
        where: { id: targetTenantId },
        select: { name: true },
      });
      tenantName = org?.name || null;
    }

    const detail: AuditEventDetailDto = {
      id: event.id,
      source: source as "PLATFORM" | "BILLING",
      occurredAt: event.timestamp.toISOString(),
      actorId: event.actorId,
      actorRole: event.actorRole,
      subjectType: event.subjectType,
      subjectId: event.subjectId,
      action: event.action,
      targetTenantId,
      tenantName,
      reason: event.reason ? redactEmails(event.reason) : null,
      ticketRef: event.ticketRef,
      executionResult: event.executionResult,
      requestId: event.requestId,
      impersonationContext: redactEmails(sanitizedImpersonation),
      before: redactEmails(sanitizedBefore),
      after: redactEmails(sanitizedAfter),
      changes,
      hasDiff: Boolean(sanitizedBefore && Object.keys(sanitizedBefore).length > 0) ||
        Boolean(sanitizedAfter && Object.keys(sanitizedAfter).length > 0),
    };

    return {
      ok: true,
      event: detail,
    };
  }

  /**
   * Filter Metadata Endpoint.
   */
  async getFiltersMetadata(): Promise<{ ok: boolean; filters: AuditFiltersDto }> {
    const [sysActions, billActions] = await Promise.all([
      this.prisma.systemAuditEvent.findMany({ select: { action: true }, distinct: ["action"], take: 200 }),
      this.prisma.billingAuditEvent.findMany({ select: { action: true }, distinct: ["action"], take: 200 }),
    ]);

    const actions = Array.from(new Set([...sysActions.map((a) => a.action), ...billActions.map((a) => a.action)]))
      .sort()
      .slice(0, 200);

    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const [sysActors, billActors] = await Promise.all([
      this.prisma.systemAuditEvent.findMany({
        where: { timestamp: { gte: ninetyDaysAgo } },
        select: { actorId: true, actorRole: true },
        distinct: ["actorId", "actorRole"],
        take: 200,
      }),
      this.prisma.billingAuditEvent.findMany({
        where: { timestamp: { gte: ninetyDaysAgo } },
        select: { actorId: true, actorRole: true },
        distinct: ["actorId", "actorRole"],
        take: 200,
      }),
    ]);

    const actorMap = new Map<string, { id: string; role: string }>();
    [...sysActors, ...billActors].forEach((a) => {
      if (a.actorId) {
        actorMap.set(a.actorId, { id: a.actorId, role: a.actorRole });
      }
    });
    const actors = Array.from(actorMap.values()).slice(0, 200);

    const [sysSubjects, billSubjects] = await Promise.all([
      this.prisma.systemAuditEvent.findMany({ select: { subjectType: true }, distinct: ["subjectType"], take: 50 }),
      this.prisma.billingAuditEvent.findMany({ select: { subjectType: true }, distinct: ["subjectType"], take: 50 }),
    ]);

    const subjectTypes = Array.from(new Set([...sysSubjects.map((s) => s.subjectType), ...billSubjects.map((s) => s.subjectType)]))
      .sort()
      .slice(0, 50);

    return {
      ok: true,
      filters: {
        actions,
        actors,
        subjectTypes,
      },
    };
  }

  /**
   * Hardened CSV Export.
   */
  async exportCsv(
    query: QueryAuditEventsDto,
    actor: { id: string; role: string; email?: string },
  ): Promise<{ csvContent: string; isTruncated: boolean; rowCount: number }> {
    const { fromDate, toDate } = this.validateDateRange(query.from, query.to);

    if (query.search && query.search.length > 100) {
      throw new BadRequestException("SEARCH_TOO_LONG: Search term cannot exceed 100 characters");
    }

    const source = query.source || "ALL";
    const take = 10001; // Fetch 10,001 to detect truncation cap of 10,000

    let sysEvents: any[] = [];
    let billEvents: any[] = [];

    if (source === "PLATFORM" || source === "ALL") {
      const where = this.buildPlatformWhereClause(query, fromDate, toDate, null);
      sysEvents = await this.prisma.systemAuditEvent.findMany({
        where,
        orderBy: [{ timestamp: "desc" }, { id: "desc" }],
        take,
      });
    }

    let tenantBillingAccountId: string | null = null;
    if (query.targetTenantId) {
      const org = await this.prisma.organization.findUnique({
        where: { id: query.targetTenantId },
        select: { billingAccountId: true },
      });
      tenantBillingAccountId = org?.billingAccountId || null;
    }

    if (source === "BILLING" || source === "ALL") {
      const where = this.buildBillingWhereClause(query, fromDate, toDate, null, tenantBillingAccountId);
      billEvents = await this.prisma.billingAuditEvent.findMany({
        where,
        orderBy: [{ timestamp: "desc" }, { id: "desc" }],
        take,
      });
    }

    const mappedSys = sysEvents.map((e) => ({
      id: e.id,
      source: "PLATFORM",
      occurredAt: e.timestamp.toISOString(),
      actorId: e.actorId,
      actorRole: e.actorRole,
      subjectType: e.subjectType,
      subjectId: e.subjectId,
      action: e.action,
      targetTenantId: e.targetTenantId || (e.subjectType === "TENANT" ? e.subjectId : null),
      tenantName: null as string | null,
      reason: e.reason || null,
      ticketRef: e.ticketRef || null,
      executionResult: e.executionResult,
      requestId: e.requestId || null,
    }));

    const mappedBill = billEvents.map((e) => ({
      id: e.id,
      source: "BILLING",
      occurredAt: e.timestamp.toISOString(),
      actorId: e.actorId,
      actorRole: e.actorRole,
      subjectType: e.subjectType,
      subjectId: e.subjectId,
      action: e.action,
      targetTenantId: e.subjectType === "TENANT" ? e.subjectId : (query.targetTenantId && e.billingAccountId === tenantBillingAccountId ? query.targetTenantId : null),
      tenantName: null as string | null,
      reason: e.reason || null,
      ticketRef: e.ticketRef || null,
      executionResult: e.executionResult,
      requestId: e.requestId || null,
    }));

    const merged = [...mappedSys, ...mappedBill].sort((a, b) => {
      const timeA = new Date(a.occurredAt).getTime();
      const timeB = new Date(b.occurredAt).getTime();
      if (timeA !== timeB) return timeB - timeA;
      return b.id.localeCompare(a.id);
    });

    const isTruncated = merged.length > 10000;
    const rows = merged.slice(0, 10000);

    // Batch resolve tenant names
    const tenantIds = Array.from(new Set(rows.map((r) => r.targetTenantId).filter(Boolean))) as string[];
    if (tenantIds.length > 0) {
      const orgs = await this.prisma.organization.findMany({
        where: { id: { in: tenantIds } },
        select: { id: true, name: true },
      });
      const orgMap = new Map(orgs.map((o) => [o.id, o.name]));
      rows.forEach((r) => {
        if (r.targetTenantId) {
          r.tenantName = orgMap.get(r.targetTenantId) || null;
        }
      });
    }

    const headers = [
      "ID",
      "Source",
      "OccurredAt",
      "ActorId",
      "ActorRole",
      "Action",
      "SubjectType",
      "SubjectId",
      "TargetTenantId",
      "TenantName",
      "ExecutionResult",
      "TicketRef",
      "Reason",
      "RequestId",
    ];

    const csvLines = [headers.join(",")];
    for (const r of rows) {
      const line = [
        sanitizeCsvCell(r.id),
        sanitizeCsvCell(r.source),
        sanitizeCsvCell(r.occurredAt),
        sanitizeCsvCell(r.actorId),
        sanitizeCsvCell(r.actorRole),
        sanitizeCsvCell(r.action),
        sanitizeCsvCell(r.subjectType),
        sanitizeCsvCell(r.subjectId),
        sanitizeCsvCell(r.targetTenantId),
        sanitizeCsvCell(r.tenantName),
        sanitizeCsvCell(r.executionResult),
        sanitizeCsvCell(r.ticketRef),
        sanitizeCsvCell(r.reason),
        sanitizeCsvCell(r.requestId),
      ];
      csvLines.push(line.join(","));
    }

    // Record audit event for export
    await this.platformAuditService.record({
      actorId: actor.id,
      actorRole: actor.role,
      subjectType: "SYSTEM",
      subjectId: actor.id,
      action: "AUDIT_EXPORTED",
      reason: "Audit log explorer export to CSV",
      after: {
        rowCount: rows.length,
        isTruncated,
        source: query.source || "ALL",
        filters: {
          action: query.action,
          actorId: query.actorId,
          from: query.from,
          to: query.to,
        },
      },
    });

    return {
      csvContent: csvLines.join("\n"),
      isTruncated,
      rowCount: rows.length,
    };
  }

  // --- Private Helpers ---

  private validateDateRange(from?: string, to?: string): { fromDate?: Date; toDate?: Date } {
    let fromDate: Date | undefined;
    let toDate: Date | undefined;

    if (from) {
      fromDate = new Date(from);
      if (isNaN(fromDate.getTime())) {
        throw new BadRequestException("INVALID_FROM_DATE: 'from' must be a valid ISO-8601 date string");
      }
    }

    if (to) {
      toDate = new Date(to);
      if (isNaN(toDate.getTime())) {
        throw new BadRequestException("INVALID_TO_DATE: 'to' must be a valid ISO-8601 date string");
      }
    }

    if (fromDate && toDate) {
      if (fromDate > toDate) {
        throw new BadRequestException("INVALID_DATE_RANGE: 'from' date must be earlier than or equal to 'to' date");
      }
      if (toDate.getTime() - fromDate.getTime() > 366 * 24 * 60 * 60 * 1000) {
        throw new BadRequestException("DATE_RANGE_TOO_LARGE: Date range cannot exceed 366 days");
      }
    }

    return { fromDate, toDate };
  }

  private parseCursor(cursorStr?: string): { timestamp: Date; id: string } | null {
    if (!cursorStr) return null;
    try {
      const raw = Buffer.from(cursorStr, "base64").toString("utf8");
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.t || !parsed.id || typeof parsed.id !== "string") {
        throw new Error();
      }
      const t = new Date(parsed.t);
      if (isNaN(t.getTime())) {
        throw new Error();
      }
      return { timestamp: t, id: parsed.id };
    } catch {
      throw new BadRequestException("INVALID_CURSOR: Cursor is malformed or invalid");
    }
  }

  private buildPlatformWhereClause(
    query: QueryAuditEventsDto,
    fromDate?: Date,
    toDate?: Date,
    cursor?: { timestamp: Date; id: string } | null,
  ): any {
    const and: any[] = [];

    if (fromDate || toDate) {
      const timeFilter: any = {};
      if (fromDate) timeFilter.gte = fromDate;
      if (toDate) timeFilter.lte = toDate;
      and.push({ timestamp: timeFilter });
    }

    if (cursor) {
      and.push({
        OR: [
          { timestamp: { lt: cursor.timestamp } },
          {
            timestamp: cursor.timestamp,
            id: { lt: cursor.id },
          },
        ],
      });
    }

    if (query.actorId) and.push({ actorId: query.actorId });
    if (query.action) and.push({ action: query.action });
    if (query.subjectType) and.push({ subjectType: query.subjectType });
    if (query.ticketRef) and.push({ ticketRef: query.ticketRef });
    if (query.result) and.push({ executionResult: query.result });

    if (query.targetTenantId) {
      and.push({
        OR: [
          { targetTenantId: query.targetTenantId },
          { subjectType: "TENANT", subjectId: query.targetTenantId },
        ],
      });
    }

    if (query.search) {
      const search = query.search.trim();
      and.push({
        OR: [
          { action: { contains: search, mode: "insensitive" } },
          { reason: { contains: search, mode: "insensitive" } },
          { ticketRef: { contains: search, mode: "insensitive" } },
          { subjectId: { contains: search, mode: "insensitive" } },
        ],
      });
    }

    return and.length > 0 ? { AND: and } : {};
  }

  private buildBillingWhereClause(
    query: QueryAuditEventsDto,
    fromDate?: Date,
    toDate?: Date,
    cursor?: { timestamp: Date; id: string } | null,
    tenantBillingAccountId?: string | null,
  ): any {
    const and: any[] = [];

    if (fromDate || toDate) {
      const timeFilter: any = {};
      if (fromDate) timeFilter.gte = fromDate;
      if (toDate) timeFilter.lte = toDate;
      and.push({ timestamp: timeFilter });
    }

    if (cursor) {
      and.push({
        OR: [
          { timestamp: { lt: cursor.timestamp } },
          {
            timestamp: cursor.timestamp,
            id: { lt: cursor.id },
          },
        ],
      });
    }

    if (query.actorId) and.push({ actorId: query.actorId });
    if (query.action) and.push({ action: query.action });
    if (query.subjectType) and.push({ subjectType: query.subjectType });
    if (query.ticketRef) and.push({ ticketRef: query.ticketRef });
    if (query.result) and.push({ executionResult: query.result });

    if (query.targetTenantId) {
      const tenantOr: any[] = [
        { subjectType: "TENANT", subjectId: query.targetTenantId },
      ];
      if (tenantBillingAccountId) {
        tenantOr.push({ billingAccountId: tenantBillingAccountId });
      }
      and.push({ OR: tenantOr });
    }

    if (query.search) {
      const search = query.search.trim();
      and.push({
        OR: [
          { action: { contains: search, mode: "insensitive" } },
          { reason: { contains: search, mode: "insensitive" } },
          { ticketRef: { contains: search, mode: "insensitive" } },
          { subjectId: { contains: search, mode: "insensitive" } },
        ],
      });
    }

    return and.length > 0 ? { AND: and } : {};
  }
}
