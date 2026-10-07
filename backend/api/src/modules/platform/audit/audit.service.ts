import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { RecordPlatformAuditDto, QueryAuditLogDto } from './dto/record-audit-event.dto';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records an immutable append-only audit event in the platform schema
   */
  async record(dto: RecordPlatformAuditDto): Promise<void> {
    try {
      await this.prisma.platformAuditEvent.create({
        data: {
          actorId: dto.actorId,
          actorRole: dto.actorRole,
          subjectType: dto.subjectType,
          subjectId: dto.subjectId,
          action: dto.action,
          beforeState: dto.beforeState || undefined,
          afterState: dto.afterState || undefined,
          reason: dto.reason || null,
          ticketRef: dto.ticketRef || null,
          requestId: dto.requestId || null,
          impersonationContext: (dto.ipAddress || dto.userAgent) ? { ipAddress: dto.ipAddress, userAgent: dto.userAgent } : undefined,
        },
      });
    } catch (err: any) {
      this.logger.error(`Failed to write platform audit event: ${err.message}`, err.stack);
      // Non-blocking for operations, but logged for diagnostic integrity
    }
  }

  /**
   * Queries platform audit events with pagination and filters
   */
  async queryPlatformAudit(query: QueryAuditLogDto) {
    const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 100);
    const offset = Math.max(Number(query.offset) || 0, 0);

    const where: any = {};
    if (query.subjectType) where.subjectType = query.subjectType;
    if (query.subjectId) where.subjectId = query.subjectId;
    if (query.actorId) where.actorId = query.actorId;
    if (query.ticketRef) where.ticketRef = { contains: query.ticketRef, mode: 'insensitive' };

    const [items, total] = await Promise.all([
      this.prisma.platformAuditEvent.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.platformAuditEvent.count({ where }),
    ]);

    return {
      items,
      total,
      limit,
      offset,
    };
  }
}
