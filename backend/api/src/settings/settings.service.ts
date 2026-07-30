import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { StaffRole } from "@cd-recruit/shared-types";
import { ListAuditLogQueryDto } from "../common/dto/settings.dto";
import * as fs from "fs";
import * as path from "path";

@Injectable()
export class SettingsService {
  private readonly configPath: string;

  constructor(private readonly prisma: PrismaService) {
    this.configPath = path.join(__dirname, "../config/settings.json");
    this.ensureConfigExists();
  }

  private ensureConfigExists() {
    const dir = path.dirname(this.configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(this.configPath)) {
      const defaultConfig = {
        aiConfidenceThreshold: 0.8,
        passRateThreshold: 0.7,
        biometricRetentionDays: 30,
        appealWindowDays: 14,
        heartbeatStaleThresholdSeconds: 45,
        graceWindowSeconds: 300,
        maxDisconnectCount: 3,
      };
      fs.writeFileSync(this.configPath, JSON.stringify(defaultConfig, null, 2), "utf8");
    } else {
      try {
        const data = fs.readFileSync(this.configPath, "utf8");
        const json = JSON.parse(data);
        let updated = false;
        if (json.appealWindowDays === undefined) {
          json.appealWindowDays = 14;
          updated = true;
        }
        if (json.heartbeatStaleThresholdSeconds === undefined) {
          json.heartbeatStaleThresholdSeconds = 45;
          updated = true;
        }
        if (json.graceWindowSeconds === undefined) {
          json.graceWindowSeconds = 300;
          updated = true;
        }
        if (json.maxDisconnectCount === undefined) {
          json.maxDisconnectCount = 3;
          updated = true;
        }
        if (updated) {
          fs.writeFileSync(this.configPath, JSON.stringify(json, null, 2), "utf8");
        }
      } catch (err) {
        // ignore
      }
    }
  }

  private readConfig() {
    this.ensureConfigExists();
    const data = fs.readFileSync(this.configPath, "utf8");
    return JSON.parse(data);
  }

  private writeConfig(config: any) {
    this.ensureConfigExists();
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), "utf8");
  }

  async listStaff() {
    const staff = await this.prisma.staff.findMany({
      orderBy: { name: "asc" },
    });
    return staff.map((s) => ({
      id: s.id,
      email: s.email,
      name: s.name,
      role: s.role,
      createdAt: s.createdAt.toISOString(),
    }));
  }

  async updateStaffRole(staffId: string, role: StaffRole, actorId: string) {
    const staff = await this.prisma.staff.findUnique({
      where: { id: staffId },
    });
    if (!staff) {
      throw new NotFoundException(`Staff not found with ID ${staffId}`);
    }

    const updated = await this.prisma.staff.update({
      where: { id: staffId },
      data: { role: role as any },
    });

    // Audit log
    await this.prisma.auditLog.create({
      data: {
        staffId: actorId,
        action: "STAFF_ROLE_UPDATED",
        entityType: "Staff",
        entityId: staffId,
        metadata: { oldRole: staff.role, newRole: role },
      },
    });

    return updated;
  }

  async getScoringConfig() {
    const config = this.readConfig();
    return {
      aiConfidenceThreshold: config.aiConfidenceThreshold ?? 0.8,
      passRateThreshold: config.passRateThreshold ?? 0.7,
      aiIntensity: config.aiIntensity ?? "HIGH",
    };
  }

  async updateScoringConfig(
    aiConfidenceThreshold: number,
    passRateThreshold: number,
    actorId: string,
    aiIntensity?: string
  ) {
    const config = this.readConfig();
    const oldConfig = { ...config };
    config.aiConfidenceThreshold = aiConfidenceThreshold;
    config.passRateThreshold = passRateThreshold;
    if (aiIntensity) {
      config.aiIntensity = aiIntensity;
    }
    this.writeConfig(config);

    // Audit log
    await this.prisma.auditLog.create({
      data: {
        staffId: actorId,
        action: "SCORING_CONFIG_UPDATED",
        entityType: "Config",
        entityId: "scoring",
        metadata: { oldConfig, newConfig: { aiConfidenceThreshold, passRateThreshold, aiIntensity: config.aiIntensity } },
      },
    });

    return config;
  }

  async getRetentionConfig() {
    const config = this.readConfig();
    return {
      biometricRetentionDays: config.biometricRetentionDays,
    };
  }

  async updateRetentionConfig(biometricRetentionDays: number, actorId: string) {
    const config = this.readConfig();
    const oldDays = config.biometricRetentionDays;
    config.biometricRetentionDays = biometricRetentionDays;
    this.writeConfig(config);

    // Audit log
    await this.prisma.auditLog.create({
      data: {
        staffId: actorId,
        action: "RETENTION_CONFIG_UPDATED",
        entityType: "Config",
        entityId: "retention",
        metadata: { oldDays, newDays: biometricRetentionDays },
      },
    });

    return config;
  }

  async getAppealWindowConfig() {
    const config = this.readConfig();
    return {
      appealWindowDays: config.appealWindowDays ?? 14,
    };
  }

  async updateAppealWindowConfig(appealWindowDays: number, actorId: string) {
    const config = this.readConfig();
    const oldDays = config.appealWindowDays ?? 14;
    config.appealWindowDays = appealWindowDays;
    this.writeConfig(config);

    // Audit log
    await this.prisma.auditLog.create({
      data: {
        staffId: actorId,
        action: "APPEAL_WINDOW_CONFIG_UPDATED",
        entityType: "Config",
        entityId: "appealWindow",
        metadata: { oldDays, newDays: appealWindowDays },
      },
    });

    return config;
  }

  async getTimingThresholds() {
    const config = this.readConfig();
    return {
      heartbeatStaleThresholdSeconds: config.heartbeatStaleThresholdSeconds ?? 45,
      graceWindowSeconds: config.graceWindowSeconds ?? 300,
      maxDisconnectCount: config.maxDisconnectCount ?? 3,
    };
  }

  async updateTimingThresholds(
    dto: { heartbeatStaleThresholdSeconds?: number; graceWindowSeconds?: number; maxDisconnectCount?: number },
    actorId: string
  ) {
    const config = this.readConfig();
    if (dto.heartbeatStaleThresholdSeconds !== undefined) {
      config.heartbeatStaleThresholdSeconds = dto.heartbeatStaleThresholdSeconds;
    }
    if (dto.graceWindowSeconds !== undefined) {
      config.graceWindowSeconds = dto.graceWindowSeconds;
    }
    if (dto.maxDisconnectCount !== undefined) {
      config.maxDisconnectCount = dto.maxDisconnectCount;
    }
    this.writeConfig(config);

    await this.prisma.auditLog.create({
      data: {
        staffId: actorId,
        action: "SYSTEM_TIMING_UPDATED",
        entityType: "Config",
        entityId: "systemTiming",
        metadata: { updated: dto },
      },
    });

    return config;
  }

  async listAuditLogs(query: ListAuditLogQueryDto) {
    const { page, pageSize, search } = query;
    const skip = (page - 1) * pageSize;
    const take = pageSize;

    const where: any = {};
    if (search) {
      where.OR = [
        { action: { contains: search, mode: "insensitive" } },
        { staff: { name: { contains: search, mode: "insensitive" } } },
        { staff: { email: { contains: search, mode: "insensitive" } } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take,
        orderBy: { occurredAt: "desc" },
        include: {
          staff: true,
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      items: items.map((log) => ({
        id: log.id,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        metadata: log.metadata,
        occurredAt: log.occurredAt.toISOString(),
        staff: {
          id: log.staff.id,
          name: log.staff.name,
          email: log.staff.email,
        },
      })),
      total,
      page,
      pageSize,
    };
  }
}
