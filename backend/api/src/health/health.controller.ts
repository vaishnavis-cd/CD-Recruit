import { Controller, Get, Res, HttpStatus } from "@nestjs/common";
import { Response } from "express";
import { PrismaService } from "../prisma/prisma.service";
import { MinioService } from "../integrations/minio/minio.service";

@Controller("health")
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: MinioService,
  ) {}

  @Get()
  async check(@Res({ passthrough: true }) res: Response) {
    return this.runHealthCheck(res);
  }

  @Get("ready")
  async ready(@Res({ passthrough: true }) res: Response) {
    return this.runHealthCheck(res);
  }

  private async runHealthCheck(res: Response) {
    const infraMode = process.env.INFRA_MODE ?? "local";
    let dbStatus = "disconnected";
    let storageStatus = "connected";
    let isHealthy = true;

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbStatus = "connected";
    } catch {
      dbStatus = "disconnected";
      isHealthy = false;
    }

    if (infraMode === "full") {
      if (this.storage instanceof MinioService) {
        try {
          const minioHealthy = await this.storage.checkHealth();
          storageStatus = minioHealthy ? "connected" : "disconnected";
          if (!minioHealthy) {
            isHealthy = false;
          }
        } catch {
          storageStatus = "disconnected";
          isHealthy = false;
        }
      }
    }

    const statusCode = isHealthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;
    res.status(statusCode);

    return {
      status: isHealthy ? "ok" : "error",
      timestamp: new Date().toISOString(),
      infraMode,
      database: dbStatus,
      storage: storageStatus,
    };
  }
}
