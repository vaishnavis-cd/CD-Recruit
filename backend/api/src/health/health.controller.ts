import { Controller, Get, Res, HttpStatus } from "@nestjs/common";
import { Response } from "express";
import { PrismaService } from "../prisma/prisma.service";
import { ObjectStoragePort } from "../integrations/storage/object-storage.port";
import { MinioService } from "../integrations/minio/minio.service";

@Controller("health")
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStoragePort,
  ) {}

  @Get()
  async check(@Res() res: Response) {
    return this.runHealthCheck(res);
  }

  @Get("ready")
  async ready(@Res() res: Response) {
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
    } catch (error: any) {
      dbStatus = "disconnected";
      isHealthy = false;
    }

    if (infraMode === "full") {
      if (this.storage instanceof MinioService) {
        const minioHealthy = await this.storage.checkHealth();
        storageStatus = minioHealthy ? "connected" : "disconnected";
        if (!minioHealthy) {
          isHealthy = false;
        }
      }
    }

    const statusCode = isHealthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;

    return res.status(statusCode).json({
      status: isHealthy ? "ok" : "error",
      timestamp: new Date().toISOString(),
      infraMode,
      database: dbStatus,
      storage: storageStatus,
    });
  }
}
