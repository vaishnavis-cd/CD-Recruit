import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { PrismaService } from "../prisma/prisma.service";
import { Judge0Service } from "../integrations/judge0/judge0.service";
import { exec } from "child_process";
import { promisify } from "util";
import * as path from "path";
import * as fs from "fs";

const execAsync = promisify(exec);

@Processor("infra-scaling")
export class InfraScalingProcessor extends WorkerHost {
  private readonly logger = new Logger(InfraScalingProcessor.name);

  private static readonly MIN_WORKERS = 2;
  private static readonly MAX_WORKERS = 4;
  private static readonly CANDIDATES_PER_WORKER = 25;

  constructor(
    private readonly prisma: PrismaService,
    private readonly judge0Service: Judge0Service,
  ) {
    super();
  }

  async process(job: Job<{ driveId?: string }>): Promise<void> {
    const { driveId } = job.data;

    switch (job.name) {
      case "scale-up-judge0":
        if (driveId) {
          await this.handleScaleUp(driveId);
        }
        break;
      case "scale-down-judge0":
        if (driveId) {
          await this.handleScaleDown(driveId);
        }
        break;
      case "check-queue-health":
        await this.handleQueueHealth();
        break;
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }

  private calculateWorkersNeeded(candidateCount: number): number {
    const workers = Math.ceil(candidateCount / InfraScalingProcessor.CANDIDATES_PER_WORKER);
    return Math.min(
      Math.max(workers, InfraScalingProcessor.MIN_WORKERS),
      InfraScalingProcessor.MAX_WORKERS,
    );
  }

  private async handleScaleUp(driveId: string): Promise<void> {
    const candidateCount = await this.prisma.invite.count({
      where: { driveId },
    });

    const neededWorkers = this.calculateWorkersNeeded(candidateCount);
    this.logger.log(
      `Scaling UP Judge0 workers to ${neededWorkers} for drive ${driveId} (expected candidate count: ${candidateCount})`,
    );
    await this.scaleWorkers(neededWorkers, "scale-up-job", driveId);
  }

  private async handleScaleDown(driveId: string): Promise<void> {
    const drive = await this.prisma.drive.findUnique({
      where: { id: driveId },
      include: { roleTemplate: true },
    });

    if (!drive) {
      this.logger.warn(`Scale-down requested for non-existent drive ${driveId}`);
      return;
    }

    const now = Date.now();
    const duration = drive.roleTemplate?.durationMinutes ?? 90;
    const grace = drive.graceMinutes ?? 5;
    const buffer = drive.bufferMinutes ?? 15;
    const totalExtraMinutes = duration + grace + buffer;
    const driveEndTimeWithGrace = drive.scheduleEnd
      ? drive.scheduleEnd.getTime() + totalExtraMinutes * 60 * 1000
      : now;

    if (now < driveEndTimeWithGrace) {
      this.logger.log(
        `Deferring scale-down for drive ${driveId}: Drive is still within candidate grace/buffer window.`,
      );
      return;
    }

    const activeSessions = await this.prisma.session.count({
      where: {
        driveId,
        status: { in: ["IN_PROGRESS", "DISCONNECTED"] },
      },
    });

    if (activeSessions > 0) {
      this.logger.log(
        `Deferring scale-down for drive ${driveId}: ${activeSessions} candidate sessions are still active.`,
      );
      return;
    }

    const queueSize = await this.judge0Service.getQueueSize();
    if (queueSize > 0) {
      this.logger.log(
        `Deferring scale-down for drive ${driveId}: Judge0 queue size is ${queueSize} (not empty).`,
      );
      return;
    }

    this.logger.log(`All checks passed. Scaling DOWN Judge0 workers to baseline (2) for drive ${driveId}`);
    await this.scaleWorkers(InfraScalingProcessor.MIN_WORKERS, "scale-down-job", driveId);
  }

  private async handleQueueHealth(): Promise<void> {
    const queueSize = await this.judge0Service.getQueueSize();
    this.logger.log(`Judge0 queue size: ${queueSize}`);

    if (queueSize > 15) {
      const targetCount = await this.determineTargetWorkersForActiveDrives();
      this.logger.warn(
        `Judge0 queue size is high (${queueSize}). Triggering emergency scale up to ${targetCount} workers.`,
      );
      await this.scaleWorkers(targetCount, "emergency-bump");
    } else if (queueSize === 0) {
      const activeDrivesCount = await this.countRunningDrivesWithGrace();
      const activeSessionsCount = await this.prisma.session.count({
        where: {
          status: { in: ["IN_PROGRESS", "DISCONNECTED"] },
          drive: { status: "ACTIVE" },
        },
      });

      if (activeDrivesCount === 0 && activeSessionsCount === 0) {
        const currentWorkers = await this.getActiveWorkerCount();
        if (currentWorkers > InfraScalingProcessor.MIN_WORKERS) {
          this.logger.log(
            `Queue is empty, no active drives in window, and no active sessions. Scaling down to baseline (2).`,
          );
          await this.scaleWorkers(InfraScalingProcessor.MIN_WORKERS, "queue-health-scale-down");
        }
      }
    }
  }

  private async countRunningDrivesWithGrace(): Promise<number> {
    const drives = await this.prisma.drive.findMany({
      where: { status: "ACTIVE" },
      include: { roleTemplate: true },
    });

    const now = Date.now();
    let count = 0;
    for (const drive of drives) {
      if (!drive.scheduleEnd) continue;
      const duration = drive.roleTemplate?.durationMinutes ?? 90;
      const grace = drive.graceMinutes ?? 5;
      const buffer = drive.bufferMinutes ?? 15;
      const totalExtraMinutes = duration + grace + buffer;
      const driveEndTimeWithGrace = drive.scheduleEnd.getTime() + totalExtraMinutes * 60 * 1000;
      if (now < driveEndTimeWithGrace) {
        count++;
      }
    }
    return count;
  }

  private async determineTargetWorkersForActiveDrives(): Promise<number> {
    const drives = await this.prisma.drive.findMany({
      where: { status: "ACTIVE" },
      include: { invites: true },
    });

    if (drives.length === 0) {
      return 10;
    }

    let maxInvites = 0;
    for (const drive of drives) {
      if (drive.invites.length > maxInvites) {
        maxInvites = drive.invites.length;
      }
    }

    return this.calculateWorkersNeeded(maxInvites);
  }

  private async getActiveWorkerCount(): Promise<number> {
    try {
      const { stdout } = await execAsync(
        'docker ps --filter "name=judge0-worker" --filter "status=running" --format "{{.ID}}"',
      );
      const lines = stdout.trim().split("\n").filter(Boolean);
      return lines.length;
    } catch {
      return InfraScalingProcessor.MIN_WORKERS;
    }
  }

  private findComposePaths(): string[] {
    const possibleDevPaths = [
      path.resolve(process.cwd(), "docker/docker-compose.dev.yml"),
      path.resolve(process.cwd(), "../docker/docker-compose.dev.yml"),
      path.resolve(process.cwd(), "../../docker/docker-compose.dev.yml"),
    ];
    const possibleJudge0Paths = [
      path.resolve(process.cwd(), "docker/docker-compose.judge0.yml"),
      path.resolve(process.cwd(), "../docker/docker-compose.judge0.yml"),
      path.resolve(process.cwd(), "../../docker/docker-compose.judge0.yml"),
    ];

    let devPath = possibleDevPaths[0];
    let judge0Path = possibleJudge0Paths[0];

    for (const p of possibleDevPaths) {
      if (fs.existsSync(p)) {
        devPath = p;
        break;
      }
    }
    for (const p of possibleJudge0Paths) {
      if (fs.existsSync(p)) {
        judge0Path = p;
        break;
      }
    }

    return [devPath, judge0Path];
  }

  private async getSystemStaffId(): Promise<string> {
    let systemStaff = await this.prisma.staff.findUnique({
      where: { email: "system-orchestrator@cdrecruit.local" },
    });

    if (!systemStaff) {
      systemStaff = await this.prisma.staff.create({
        data: {
          email: "system-orchestrator@cdrecruit.local",
          name: "System Scaling Orchestrator",
          role: "ADMIN",
          keycloakUserId: "system-orchestrator-uuid",
        },
      });
    }

    return systemStaff.id;
  }

  private async scaleWorkers(count: number, trigger: string, driveId?: string): Promise<void> {
    const oldCount = await this.getActiveWorkerCount();
    if (oldCount === count) {
      this.logger.log(`Scaling target is already ${count}. Skipping command execution.`);
      return;
    }

    try {
      const paths = this.findComposePaths();
      const filesArgs = paths.map((p) => `-f "${p}"`).join(" ");
      const cmd = `docker compose ${filesArgs} up -d --scale judge0-worker=${count} --no-recreate`;
      this.logger.log(`Executing scale command: ${cmd}`);

      const { stdout, stderr } = await execAsync(cmd);
      this.logger.log(`Scale stdout: ${stdout}`);
      if (stderr && stderr.trim()) {
        this.logger.warn(`Scale stderr: ${stderr}`);
      }

      this.logger.log(
        `[AUDIT] [infra-scaling] SCALE ACTION | Trigger: ${trigger} | Drive ID: ${
          driveId || "None"
        } | Old Count: ${oldCount} | New Count: ${count}`,
      );

      const systemStaffId = await this.getSystemStaffId();
      await this.prisma.auditLog.create({
        data: {
          staffId: systemStaffId,
          action: "INFRA_SCALE_ACTION",
          entityType: "Drive",
          entityId: driveId || "SYSTEM",
          metadata: {
            trigger,
            oldCount,
            newCount: count,
            driveId: driveId || null,
          },
        },
      });
    } catch (err: any) {
      this.logger.error(`Failed to scale Judge0 workers to ${count}: ${err.message}`);
    }
  }
}
