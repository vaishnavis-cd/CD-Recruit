import assert from "node:assert";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { PlatformStaffRole } from "@cd-recruit/shared-types";
import { PlatformAuditService } from "./platform-audit.service";
import {
  PlatformAuditExplorerService,
  computeChanges,
  sanitizeCsvCell,
} from "./platform-audit-explorer.service";
import { PlatformAuditController } from "./platform-audit.controller";
import {
  PLATFORM_READ_ROLES,
} from "../auth/decorators/platform-roles.decorator";

describe("Platform Audit Explorer (Stage 3 - Item 9)", () => {
  let prisma: PrismaService;
  let auditService: PlatformAuditService;
  let explorerService: PlatformAuditExplorerService;
  let controller: PlatformAuditController;

  const testOrgId = "org-audit-test-" + Date.now();
  const testTenantName = "Audit Test Corporation";

  beforeAll(async () => {
    prisma = new PrismaService();
    auditService = new PlatformAuditService(prisma);
    explorerService = new PlatformAuditExplorerService(prisma, auditService);
    controller = new PlatformAuditController(auditService, explorerService);

    // Create test billing account and organization
    const ba = await prisma.billingAccount.create({
      data: {
        name: testTenantName,
        billingCountry: "IN",
        currency: "INR",
      },
    });

    await prisma.organization.create({
      data: {
        id: testOrgId,
        name: testTenantName,
        slug: `audit-corp-${Date.now()}`,
        billingAccountId: ba.id,
      },
    });
  });

  afterAll(async () => {
    // Note: Do NOT delete audit events as triggers forbid deletion.
    await prisma.$disconnect();
  });

  describe("1. computeChanges diff utility", () => {
    it("should compute nested dot-paths for changed fields", () => {
      const before = {
        retention: {
          appealWindowDaysOverride: 7,
          deepArchive: false,
        },
        licenseTier: "STARTER",
      };
      const after = {
        retention: {
          appealWindowDaysOverride: 14,
          deepArchive: false,
        },
        licenseTier: "GROWTH",
      };

      const changes = computeChanges(before, after);
      expect(changes).toEqual(
        expect.arrayContaining([
          {
            path: "retention.appealWindowDaysOverride",
            before: 7,
            after: 14,
          },
          {
            path: "licenseTier",
            before: "STARTER",
            after: "GROWTH",
          },
        ]),
      );
      expect(changes.find((c) => c.path === "retention.deepArchive")).toBeUndefined();
    });

    it("should detect added and removed fields", () => {
      const before = { active: true, oldField: "removed" };
      const after = { active: true, newField: "added" };

      const changes = computeChanges(before, after);
      expect(changes).toEqual(
        expect.arrayContaining([
          { path: "oldField", before: "removed", after: null },
          { path: "newField", before: null, after: "added" },
        ]),
      );
    });

    it("should redact email addresses in changes diff", () => {
      const before = { contactEmail: "candidate123@example.com" };
      const after = { contactEmail: "candidate456@example.com" };

      const changes = computeChanges(before, after);
      expect(changes[0].before).toBe("[email]");
      expect(changes[0].after).toBe("[email]");
    });
  });

  describe("2. sanitizeCsvCell formula injection defense", () => {
    it("should prefix dangerous formula leading characters with single quote", () => {
      expect(sanitizeCsvCell("=SUM(A1:A10)")).toBe(`"'=SUM(A1:A10)"`);
      expect(sanitizeCsvCell("+cmd|' /C calc'!A0")).toBe(`"'+cmd|' /C calc'!A0"`);
      expect(sanitizeCsvCell("-100")).toBe(`"'-100"`);
      expect(sanitizeCsvCell("@SUM")).toBe(`"'@SUM"`);
      expect(sanitizeCsvCell("\tTAB_INJECT")).toBe(`"'\tTAB_INJECT"`);
    });

    it("should redact email in CSV cells", () => {
      expect(sanitizeCsvCell("Contact: admin@example.com for info")).toBe(
        `"Contact: [email] for info"`,
      );
    });

    it("should escape double quotes properly", () => {
      expect(sanitizeCsvCell('Hello "World"')).toBe(`"Hello ""World"""`);
    });
  });

  describe("3. Keyset cursor pagination and multi-schema merge-sort", () => {
    const batchId = `batch_${Date.now()}`;
    const baseTime = new Date("2026-09-01T10:00:00.000Z").getTime();

    beforeAll(async () => {
      // Seed 3 platform events and 3 billing events interleaved
      await prisma.systemAuditEvent.createMany({
        data: [
          {
            id: `${batchId}_sys_1`,
            timestamp: new Date(baseTime + 1000),
            actorId: "actor_stage3_sys",
            actorRole: "OWNER",
            subjectType: "TENANT",
            subjectId: testOrgId,
            action: "STAGE3_ACTION_SYS_1",
            reason: `Batch ${batchId} sys 1`,
            ticketRef: `TICKET_${batchId}`,
            executionResult: "SUCCESS",
            targetTenantId: testOrgId,
          },
          {
            id: `${batchId}_sys_2`,
            timestamp: new Date(baseTime + 3000),
            actorId: "actor_stage3_sys",
            actorRole: "OWNER",
            subjectType: "TENANT",
            subjectId: testOrgId,
            action: "STAGE3_ACTION_SYS_2",
            reason: `Batch ${batchId} sys 2`,
            ticketRef: `TICKET_${batchId}`,
            executionResult: "SUCCESS",
            targetTenantId: testOrgId,
          },
          {
            id: `${batchId}_sys_3`,
            timestamp: new Date(baseTime + 5000),
            actorId: "actor_stage3_sys",
            actorRole: "OWNER",
            subjectType: "TENANT",
            subjectId: testOrgId,
            action: "STAGE3_ACTION_SYS_3",
            reason: `Batch ${batchId} sys 3`,
            ticketRef: `TICKET_${batchId}`,
            executionResult: "SUCCESS",
            targetTenantId: testOrgId,
          },
        ],
      });

      await prisma.billingAuditEvent.createMany({
        data: [
          {
            id: `${batchId}_bill_1`,
            timestamp: new Date(baseTime + 2000),
            actorId: "actor_stage3_bill",
            actorRole: "FINANCE",
            subjectType: "BILLING_ACCOUNT",
            subjectId: "ba-stage3-001",
            action: "STAGE3_ACTION_BILL_1",
            reason: `Batch ${batchId} bill 1`,
            ticketRef: `TICKET_${batchId}`,
            executionResult: "SUCCESS",
          },
          {
            id: `${batchId}_bill_2`,
            timestamp: new Date(baseTime + 4000),
            actorId: "actor_stage3_bill",
            actorRole: "FINANCE",
            subjectType: "BILLING_ACCOUNT",
            subjectId: "ba-stage3-002",
            action: "STAGE3_ACTION_BILL_2",
            reason: `Batch ${batchId} bill 2`,
            ticketRef: `TICKET_${batchId}`,
            executionResult: "SUCCESS",
          },
          {
            id: `${batchId}_bill_3`,
            timestamp: new Date(baseTime + 6000),
            actorId: "actor_stage3_bill",
            actorRole: "FINANCE",
            subjectType: "BILLING_ACCOUNT",
            subjectId: "ba-stage3-003",
            action: "STAGE3_ACTION_BILL_3",
            reason: `Batch ${batchId} bill 3`,
            ticketRef: `TICKET_${batchId}`,
            executionResult: "SUCCESS",
          },
        ],
      });
    });

    it("should merge-sort multi-schema events in strict (occurredAt DESC, id DESC) order", async () => {
      const res = await explorerService.findUnifiedEvents({
        source: "ALL",
        ticketRef: `TICKET_${batchId}`,
        limit: 10,
      });

      expect(res.ok).toBe(true);
      expect(res.items.length).toBe(6);

      // Verify strict descending timestamp
      for (let i = 0; i < res.items.length - 1; i++) {
        const t1 = new Date(res.items[i].occurredAt).getTime();
        const t2 = new Date(res.items[i + 1].occurredAt).getTime();
        expect(t1).toBeGreaterThanOrEqual(t2);
      }

      // First item should be sys_3 or bill_3 (bill_3 is at +6000)
      expect(res.items[0].id).toBe(`${batchId}_bill_3`);
      expect(res.items[0].source).toBe("BILLING");
      expect(res.items[1].id).toBe(`${batchId}_sys_3`);
      expect(res.items[1].source).toBe("PLATFORM");
    });

    it("should correctly paginate with keyset cursor across page boundaries without duplicate or missed items", async () => {
      // Fetch Page 1 with limit 2
      const page1 = await explorerService.findUnifiedEvents({
        source: "ALL",
        ticketRef: `TICKET_${batchId}`,
        limit: 2,
      });

      expect(page1.items.length).toBe(2);
      expect(page1.nextCursor).toBeTruthy();

      // Fetch Page 2 with limit 2
      const page2 = await explorerService.findUnifiedEvents({
        source: "ALL",
        ticketRef: `TICKET_${batchId}`,
        limit: 2,
        cursor: page1.nextCursor!,
      });

      expect(page2.items.length).toBe(2);
      expect(page2.nextCursor).toBeTruthy();

      // Fetch Page 3 with limit 2
      const page3 = await explorerService.findUnifiedEvents({
        source: "ALL",
        ticketRef: `TICKET_${batchId}`,
        limit: 2,
        cursor: page2.nextCursor!,
      });

      expect(page3.items.length).toBe(2);

      // Verify no duplicates across all 3 pages
      const allIds = [
        ...page1.items.map((i) => i.id),
        ...page2.items.map((i) => i.id),
        ...page3.items.map((i) => i.id),
      ];

      expect(new Set(allIds).size).toBe(6);
      expect(allIds).toEqual([
        `${batchId}_bill_3`,
        `${batchId}_sys_3`,
        `${batchId}_bill_2`,
        `${batchId}_sys_2`,
        `${batchId}_bill_1`,
        `${batchId}_sys_1`,
      ]);
    });

    it("should batch-resolve tenant names for platform events", async () => {
      const res = await explorerService.findUnifiedEvents({
        source: "PLATFORM",
        targetTenantId: testOrgId,
        limit: 10,
      });

      expect(res.ok).toBe(true);
      const matching = res.items.filter((i) => i.targetTenantId === testOrgId);
      expect(matching.length).toBeGreaterThan(0);
      matching.forEach((item) => {
        expect(item.tenantName).toBe(testTenantName);
      });
    });
  });

  describe("4. Filters and Search validation", () => {
    it("should filter by source: PLATFORM", async () => {
      const res = await explorerService.findUnifiedEvents({
        source: "PLATFORM",
        limit: 10,
      });
      res.items.forEach((item) => {
        expect(item.source).toBe("PLATFORM");
      });
    });

    it("should filter by source: BILLING", async () => {
      const res = await explorerService.findUnifiedEvents({
        source: "BILLING",
        limit: 10,
      });
      res.items.forEach((item) => {
        expect(item.source).toBe("BILLING");
      });
    });

    it("should reject date range where from > to", async () => {
      await expect(
        explorerService.findUnifiedEvents({
          from: "2026-10-02T00:00:00Z",
          to: "2026-10-01T00:00:00Z",
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should reject date range exceeding 366 days", async () => {
      await expect(
        explorerService.findUnifiedEvents({
          from: "2024-01-01T00:00:00Z",
          to: "2026-10-01T00:00:00Z",
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should reject search query exceeding 100 characters", async () => {
      await expect(
        explorerService.findUnifiedEvents({
          search: "a".repeat(101),
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should reject malformed or tampered cursor", async () => {
      await expect(
        explorerService.findUnifiedEvents({
          cursor: "not-a-valid-base64-json-cursor!!!",
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("5. Detail Endpoint with changes diff", () => {
    let testEventId: string;

    beforeAll(async () => {
      const created = await prisma.systemAuditEvent.create({
        data: {
          actorId: "actor-detail-test",
          actorRole: "OWNER",
          subjectType: "TENANT",
          subjectId: testOrgId,
          targetTenantId: testOrgId,
          action: "TENANT_TIER_UPDATED",
          before: {
            licenseTier: "STARTER",
            contact: {
              email: "admin-secret@company.com",
              phone: "1234567890",
            },
            passwordHash: "secret_hash_123",
          },
          after: {
            licenseTier: "ENTERPRISE",
            contact: {
              email: "new-admin@company.com",
              phone: "1234567890",
            },
            passwordHash: "secret_hash_456",
          },
          reason: "Upgraded for annual enterprise contract",
          ticketRef: "DEAL-9901",
          executionResult: "SUCCESS",
        },
      });
      testEventId = created.id;
    });

    it("should return detailed event with computed changes diff and read-time redactions", async () => {
      const res = await explorerService.getEventDetail("PLATFORM", testEventId);

      expect(res.ok).toBe(true);
      expect(res.event.id).toBe(testEventId);
      expect(res.event.tenantName).toBe(testTenantName);
      expect(res.event.changes).toBeTruthy();

      // Check tier change
      const tierChange = res.event.changes.find((c) => c.path === "licenseTier");
      expect(tierChange).toBeDefined();
      expect(tierChange?.before).toBe("STARTER");
      expect(tierChange?.after).toBe("ENTERPRISE");

      // Check email redaction
      const emailChange = res.event.changes.find((c) => c.path === "contact.email");
      expect(emailChange).toBeDefined();
      expect(emailChange?.before).toBe("[email]");
      expect(emailChange?.after).toBe("[email]");

      // Check password/secret redaction in before & after
      expect(res.event.before.passwordHash).toBe("[REDACTED]");
      expect(res.event.after.passwordHash).toBe("[REDACTED]");
    });

    it("should throw NotFoundException for non-existent event", async () => {
      await expect(
        explorerService.getEventDetail("PLATFORM", "00000000-0000-0000-0000-000000000000"),
      ).rejects.toThrow(NotFoundException);
    });

    it("should reject invalid source parameter", async () => {
      await expect(
        explorerService.getEventDetail("INVALID_SOURCE", testEventId),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("6. Filters Metadata Endpoint", () => {
    it("should return available actions, subjectTypes, and 90-day actors without email addresses", async () => {
      const res = await explorerService.getFiltersMetadata();

      expect(res.ok).toBe(true);
      expect(Array.isArray(res.filters.actions)).toBe(true);
      expect(Array.isArray(res.filters.subjectTypes)).toBe(true);
      expect(Array.isArray(res.filters.actors)).toBe(true);

      expect(res.filters.actions.length).toBeGreaterThan(0);
      expect(res.filters.actors.length).toBeGreaterThan(0);

      // PII Check: actors must only have id and role
      res.filters.actors.forEach((actor) => {
        expect(actor.id).toBeDefined();
        expect(actor.role).toBeDefined();
        expect((actor as any).email).toBeUndefined();
      });
    });
  });

  describe("7. CSV Export and Internal Audit Recording", () => {
    it("should generate CSV with hardened formula injection defense and record AUDIT_EXPORTED event", async () => {
      const actor = { id: "exporter-owner-1", role: "OWNER" };

      const exportRes = await explorerService.exportCsv(
        {
          source: "ALL",
          limit: 50,
        },
        actor,
      );

      expect(exportRes.csvContent).toBeTruthy();
      expect(exportRes.isTruncated).toBe(false);

      const lines = exportRes.csvContent.split("\n");
      expect(lines[0]).toBe(
        "ID,Source,OccurredAt,ActorId,ActorRole,Action,SubjectType,SubjectId,TargetTenantId,TenantName,ExecutionResult,TicketRef,Reason,RequestId",
      );

      // Check that AUDIT_EXPORTED event was recorded in platform_audit_event
      const exportAudit = await prisma.systemAuditEvent.findFirst({
        where: {
          action: "AUDIT_EXPORTED",
          actorId: actor.id,
        },
        orderBy: { timestamp: "desc" },
      });

      expect(exportAudit).toBeDefined();
      expect(exportAudit?.subjectType).toBe("SYSTEM");
      expect(exportAudit?.reason).toBe("Audit log explorer export to CSV");
    });
  });

  describe("8. Immutability and Database Trigger Safety", () => {
    it("should verify PlatformAuditService has NO update or delete methods", () => {
      const service = explorerService as any;
      expect(service.update).toBeUndefined();
      expect(service.delete).toBeUndefined();
      expect(service.remove).toBeUndefined();
      expect(service.truncate).toBeUndefined();
    });

    it("should verify database triggers reject direct mutation of platform_audit_event", async () => {
      const event = await prisma.systemAuditEvent.findFirst();
      if (event) {
        await expect(
          prisma.$executeRawUnsafe(
            `UPDATE "platform"."platform_audit_event" SET reason = 'tampered' WHERE id = '${event.id}'`,
          ),
        ).rejects.toThrow();

        await expect(
          prisma.$executeRawUnsafe(
            `DELETE FROM "platform"."platform_audit_event" WHERE id = '${event.id}'`,
          ),
        ).rejects.toThrow();
      }
    });
  });

  describe("9. Auth matrix: all platform roles allowed", () => {
    it("should confirm PLATFORM_READ_ROLES includes OWNER, FINANCE, SUPPORT", () => {
      expect(PLATFORM_READ_ROLES).toContain(PlatformStaffRole.OWNER);
      expect(PLATFORM_READ_ROLES).toContain(PlatformStaffRole.FINANCE);
      expect(PLATFORM_READ_ROLES).toContain(PlatformStaffRole.SUPPORT);
    });
  });
});
