import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { StaffRole, Permission } from "@cd-recruit/shared-types";
import { ListAuditLogQueryDto, UpdateRolePermissionDto } from "../common/dto/settings.dto";
import { Department, ModuleType } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

export interface PermissionDescriptor {
  key: Permission;
  name: string;
  description: string;
  category: "Drive Logistics" | "Candidate Evaluation" | "Identity & Integrity" | "Templates & Question Bank" | "Administration";
}

export const PERMISSION_DESCRIPTORS: PermissionDescriptor[] = [
  // Drive Logistics
  {
    key: Permission.DRIVE_CREATE,
    name: "Create Drives",
    description: "Create assessment drives and configure candidate parameters",
    category: "Drive Logistics",
  },
  {
    key: Permission.CANDIDATE_INGEST_CSV,
    name: "Upload Candidate CSV",
    description: "Upload candidate spreadsheets and generate batch invite links",
    category: "Drive Logistics",
  },
  {
    key: Permission.DRIVE_MANAGE,
    name: "Manage Drives & Links",
    description: "Archive/cancel drives, resend assessment links, and extend deadlines",
    category: "Drive Logistics",
  },

  // Candidate Evaluation
  {
    key: Permission.CANDIDATE_VIEW,
    name: "View Candidate Submissions",
    description: "View candidate scores, module responses, test executions, and code",
    category: "Candidate Evaluation",
  },
  {
    key: Permission.DECISION_SUBMIT,
    name: "Submit Advance / Reject Decisions",
    description: "Make final hiring decisions (ADVANCE / REJECT) and record reviewer notes",
    category: "Candidate Evaluation",
  },
  {
    key: Permission.MANUAL_SCORING_REVIEW,
    name: "Manual Code & Rubric Grading",
    description: "Submit technical evaluation scores, say-do remarks, and module rubrics",
    category: "Candidate Evaluation",
  },

  // Identity & Integrity
  {
    key: Permission.IDENTITY_VERIFICATION_APPROVE,
    name: "Approve Identity Verification",
    description: "Review facial/ID comparisons and manually verify candidate identity",
    category: "Identity & Integrity",
  },
  {
    key: Permission.PROCTORING_TRIAGE,
    name: "Proctoring Flag & Appeal Triage",
    description: "Review webcam/screen evidence clips, triage integrity flags, and resolve appeals",
    category: "Identity & Integrity",
  },

  // Templates & Question Bank
  {
    key: Permission.ROLE_TEMPLATE_EDIT,
    name: "Calibrate & Edit Role Templates",
    description: "Create and update role templates, module allocations, and passing cutoffs",
    category: "Templates & Question Bank",
  },
  {
    key: Permission.QUESTION_BANK_MANAGE,
    name: "Manage Question Bank",
    description: "Create, edit, and delete questions across all assessment modules",
    category: "Templates & Question Bank",
  },

  // Administration
  {
    key: Permission.PARTNER_API_MANAGE,
    name: "Manage Partner ATS Integrations",
    description: "Register external ATS partners and generate/rotate API keys",
    category: "Administration",
  },
  {
    key: Permission.SETTINGS_MANAGE,
    name: "System Settings & Staff",
    description: "Configure scoring rules, biometric retention, and staff role assignments",
    category: "Administration",
  },
  {
    key: Permission.AUDIT_LOG_VIEW,
    name: "View Platform Audit Logs",
    description: "Inspect compliance audit trails and security event logs",
    category: "Administration",
  },
];

export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  ADMIN: Object.values(Permission),
  HR_LEAD: [
    Permission.CANDIDATE_VIEW,
    Permission.DECISION_SUBMIT,
    Permission.MANUAL_SCORING_REVIEW,
    Permission.IDENTITY_VERIFICATION_APPROVE,
    Permission.PROCTORING_TRIAGE,
    Permission.ROLE_TEMPLATE_EDIT,
    Permission.AUDIT_LOG_VIEW,
  ],
  HR_ASSOCIATE: [
    Permission.DRIVE_CREATE,
    Permission.CANDIDATE_INGEST_CSV,
    Permission.DRIVE_MANAGE,
    Permission.CANDIDATE_VIEW,
    Permission.PROCTORING_TRIAGE,
  ],
  REVIEWER: [
    Permission.CANDIDATE_VIEW,
    Permission.MANUAL_SCORING_REVIEW,
  ],
  RECRUITER: [
    Permission.DRIVE_CREATE,
    Permission.CANDIDATE_INGEST_CSV,
    Permission.DRIVE_MANAGE,
    Permission.CANDIDATE_VIEW,
    Permission.PROCTORING_TRIAGE,
  ],
};

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
        rolePermissions: DEFAULT_ROLE_PERMISSIONS,
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
        if (json.rolePermissions === undefined) {
          json.rolePermissions = DEFAULT_ROLE_PERMISSIONS;
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

  private async resolveStaffId(actor: any): Promise<string> {
    if (typeof actor === "string" && actor) {
      const s = await this.prisma.staff.findUnique({ where: { id: actor } });
      if (s) return s.id;
    }
    if (actor && typeof actor === "object") {
      if (actor.id) {
        const s = await this.prisma.staff.findUnique({ where: { id: actor.id } });
        if (s) return s.id;
      }
      if (actor.email) {
        const s = await this.prisma.staff.findFirst({ where: { email: actor.email } });
        if (s) return s.id;
      }
      if (actor.sub) {
        const s = await this.prisma.staff.findFirst({ where: { keycloakUserId: actor.sub } });
        if (s) return s.id;
      }
    }
    let defaultStaff = await this.prisma.staff.findFirst();
    if (!defaultStaff) {
      defaultStaff = await this.prisma.staff.create({
        data: {
          name: "System Admin",
          email: "admin@cdrecruit.com",
          role: "ADMIN",
          keycloakUserId: "system-admin-default",
        },
      });
    }
    return defaultStaff.id;
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

  async createStaff(dto: { name: string; email: string; role: StaffRole }, actor: any) {
    const actorId = await this.resolveStaffId(actor);
    const existing = await this.prisma.staff.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new BadRequestException("Staff member with this email already exists");
    }

    const keycloakUserId = `keycloak_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const staff = await this.prisma.staff.create({
      data: {
        name: dto.name,
        email: dto.email,
        role: dto.role as any,
        keycloakUserId,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        staffId: actorId,
        action: "STAFF_CREATED",
        entityType: "Staff",
        entityId: staff.id,
        metadata: { name: dto.name, email: dto.email, role: dto.role },
      },
    });

    return staff;
  }

  async deleteStaff(staffId: string, actor: any) {
    const actorId = await this.resolveStaffId(actor);
    const staff = await this.prisma.staff.findUnique({ where: { id: staffId } });
    if (!staff) {
      throw new NotFoundException(`Staff not found with ID ${staffId}`);
    }

    await this.prisma.staff.delete({ where: { id: staffId } });

    await this.prisma.auditLog.create({
      data: {
        staffId: actorId,
        action: "STAFF_DELETED",
        entityType: "Staff",
        entityId: staffId,
        metadata: { name: staff.name, email: staff.email, role: staff.role },
      },
    });

    return { success: true };
  }

  async updateStaffRole(staffId: string, role: StaffRole, actor: any) {
    const actorId = await this.resolveStaffId(actor);
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
    actor: any,
    aiIntensity?: string
  ) {
    const actorId = await this.resolveStaffId(actor);
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

  async updateRetentionConfig(biometricRetentionDays: number, actor: any) {
    const actorId = await this.resolveStaffId(actor);
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

  async updateAppealWindowConfig(appealWindowDays: number, actor: any) {
    const actorId = await this.resolveStaffId(actor);
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
    actor: any
  ) {
    const actorId = await this.resolveStaffId(actor);
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

  async getModuleSettings() {
    let settings = await this.prisma.moduleSetting.findMany({
      orderBy: [
        { department: "asc" },
        { moduleType: "asc" },
      ],
    });

    if (settings.length === 0) {
      const departments = [
        Department.SOFTWARE_ENGINEERING,
        Department.DATA_ENGINEERING,
        Department.QA,
        Department.SRE,
        Department.SYSOPS,
        Department.ITOPS,
        Department.SECOPS,
        Department.PMO,
      ];
      const moduleTypes = Object.values(ModuleType);

      const standardAllowed: Record<string, ModuleType[]> = {
        SOFTWARE_ENGINEERING: [ModuleType.MCQ, ModuleType.SQL, ModuleType.CODING, ModuleType.DEBUGGING, ModuleType.AI_PROMPTING, ModuleType.SIMULATION, ModuleType.TEST_SCENARIOS],
        DATA_ENGINEERING: [ModuleType.MCQ, ModuleType.SQL, ModuleType.NOSQL, ModuleType.CODING, ModuleType.DEBUGGING, ModuleType.AI_PROMPTING],
        QA: [ModuleType.MCQ, ModuleType.SQL, ModuleType.CODING, ModuleType.DEBUGGING, ModuleType.TEST_SCENARIOS, ModuleType.AI_PROMPTING],
        SRE: [ModuleType.MCQ, ModuleType.CODING, ModuleType.DEBUGGING, ModuleType.SIMULATION, ModuleType.TEST_SCENARIOS, ModuleType.AI_PROMPTING],
        SYSOPS: [ModuleType.MCQ, ModuleType.SIMULATION, ModuleType.TEST_SCENARIOS, ModuleType.AI_PROMPTING],
        ITOPS: [ModuleType.MCQ, ModuleType.SIMULATION, ModuleType.TEST_SCENARIOS, ModuleType.AI_PROMPTING],
        SECOPS: [ModuleType.MCQ, ModuleType.CODING, ModuleType.DEBUGGING, ModuleType.SIMULATION, ModuleType.TEST_SCENARIOS, ModuleType.AI_PROMPTING],
        PMO: [ModuleType.MCQ, ModuleType.SIMULATION, ModuleType.TEST_SCENARIOS, ModuleType.AI_PROMPTING],
      };

      for (const dept of departments) {
        for (const mod of moduleTypes) {
          const isEnabled = (standardAllowed[dept] || []).includes(mod);
          await this.prisma.moduleSetting.upsert({
            where: {
              department_moduleType: {
                department: dept,
                moduleType: mod,
              },
            },
            update: { isEnabled },
            create: {
              department: dept,
              moduleType: mod,
              isEnabled,
            },
          });
        }
      }

      settings = await this.prisma.moduleSetting.findMany({
        orderBy: [
          { department: "asc" },
          { moduleType: "asc" },
        ],
      });
    }

    return settings;
  }

  async updateModuleSetting(
    department: Department,
    moduleType: ModuleType,
    isEnabled: boolean,
    actor: any,
  ) {
    const actorId = await this.resolveStaffId(actor);
    const updated = await this.prisma.moduleSetting.upsert({
      where: {
        department_moduleType: {
          department,
          moduleType,
        },
      },
      update: {
        isEnabled,
      },
      create: {
        department,
        moduleType,
        isEnabled,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        staffId: actorId,
        action: "MODULE_SETTING_UPDATED",
        entityType: "ModuleSetting",
        entityId: updated.id,
        metadata: { department, moduleType, isEnabled },
      },
    });

    return updated;
  }

  async bulkUpdateDepartmentModules(
    department: Department,
    isEnabled: boolean,
    actor: any,
  ) {
    const actorId = await this.resolveStaffId(actor);
    const moduleTypes = Object.values(ModuleType);

    for (const mod of moduleTypes) {
      await this.prisma.moduleSetting.upsert({
        where: {
          department_moduleType: {
            department,
            moduleType: mod,
          },
        },
        update: { isEnabled },
        create: {
          department,
          moduleType: mod,
          isEnabled,
        },
      });
    }

    await this.prisma.auditLog.create({
      data: {
        staffId: actorId,
        action: "MODULE_SETTING_BULK_UPDATED",
        entityType: "ModuleSetting",
        entityId: department,
        metadata: { department, isEnabled },
      },
    });

    return this.getModuleSettings();
  }

  // ---------------------------------------------------------------------------
  // Dynamic Role Permissions Matrix
  // ---------------------------------------------------------------------------

  async getRolePermissions() {
    this.ensureConfigExists();
    let permissionsMap: Record<string, string[]> = DEFAULT_ROLE_PERMISSIONS;
    try {
      const data = fs.readFileSync(this.configPath, "utf8");
      const json = JSON.parse(data);
      if (json.rolePermissions) {
        permissionsMap = json.rolePermissions;
      }
    } catch {
      // Fall back to defaults
    }

    const roles = [
      StaffRole.ADMIN,
      StaffRole.HR_LEAD,
      StaffRole.HR_ASSOCIATE,
      StaffRole.REVIEWER,
    ];

    return {
      matrix: permissionsMap,
      descriptors: PERMISSION_DESCRIPTORS,
      roles,
    };
  }

  async updateRolePermission(
    dto: UpdateRolePermissionDto,
    actor: any,
  ) {
    if (dto.role === StaffRole.ADMIN) {
      throw new BadRequestException("Superadmin permissions cannot be modified");
    }

    this.ensureConfigExists();
    const data = fs.readFileSync(this.configPath, "utf8");
    const json = JSON.parse(data);
    const rolePermissions: Record<string, string[]> = json.rolePermissions || { ...DEFAULT_ROLE_PERMISSIONS };

    const currentPerms = new Set<string>(rolePermissions[dto.role] || DEFAULT_ROLE_PERMISSIONS[dto.role] || []);

    if (dto.isEnabled) {
      currentPerms.add(dto.permission);
    } else {
      currentPerms.delete(dto.permission);
    }

    rolePermissions[dto.role] = Array.from(currentPerms);
    json.rolePermissions = rolePermissions;

    fs.writeFileSync(this.configPath, JSON.stringify(json, null, 2), "utf8");

    const actorId = await this.resolveStaffId(actor);
    await this.prisma.auditLog.create({
      data: {
        staffId: actorId,
        action: "ROLE_PERMISSION_UPDATED",
        entityType: "RolePermission",
        entityId: `${dto.role}:${dto.permission}`,
        metadata: { role: dto.role, permission: dto.permission, isEnabled: dto.isEnabled },
      },
    });

    return this.getRolePermissions();
  }

  async resetRolePermissions(actor: any) {
    this.ensureConfigExists();
    const data = fs.readFileSync(this.configPath, "utf8");
    const json = JSON.parse(data);

    json.rolePermissions = JSON.parse(JSON.stringify(DEFAULT_ROLE_PERMISSIONS));
    fs.writeFileSync(this.configPath, JSON.stringify(json, null, 2), "utf8");

    const actorId = await this.resolveStaffId(actor);
    await this.prisma.auditLog.create({
      data: {
        staffId: actorId,
        action: "ROLE_PERMISSIONS_RESET_DEFAULT",
        entityType: "RolePermission",
        entityId: "ALL",
        metadata: { resetAt: new Date().toISOString() },
      },
    });

    return this.getRolePermissions();
  }

  hasPermission(role: string, permission: Permission | string): boolean {
    if (role === StaffRole.ADMIN) {
      return true; // Superadmin has all permissions
    }

    try {
      this.ensureConfigExists();
      const data = fs.readFileSync(this.configPath, "utf8");
      const json = JSON.parse(data);
      const rolePermissions: Record<string, string[]> = json.rolePermissions || DEFAULT_ROLE_PERMISSIONS;
      const permsForRole = rolePermissions[role] ?? DEFAULT_ROLE_PERMISSIONS[role] ?? [];
      return permsForRole.includes(permission as string);
    } catch {
      const permsForRole = DEFAULT_ROLE_PERMISSIONS[role] ?? [];
      return permsForRole.includes(permission as string);
    }
  }
}
