import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

/**
 * PrismaService — single shared Prisma client for the entire application.
 *
 * Extends PrismaClient directly so every model accessor (prisma.session,
 * prisma.candidate, etc.) is available on the injected service without
 * an extra indirection layer.
 *
 * Lifecycle:
 *   onModuleInit  → $connect()   (called once when the module graph is ready)
 *   onModuleDestroy → $disconnect() (called on graceful shutdown)
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    this.logger.log("Connecting to Postgres via Prisma...");
    await this.$connect();
    this.logger.log("Prisma connected.");
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log("Prisma disconnected.");
  }
}
