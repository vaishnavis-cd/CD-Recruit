import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(configService: ConfigService) {
    const rawUrl =
      configService.get<string>("databaseUrl") ||
      process.env.DATABASE_URL ||
      "postgresql://cdrecruit:cdrecruit123@localhost:5432/cdrecruit";

    super({
      datasources: {
        db: {
          url: rawUrl,
        },
      },
      log:
        process.env.NODE_ENV === "development"
          ? ["query", "info", "warn", "error"]
          : ["error"],
    });
  }

  async onModuleInit() {
    await this.connectWithRetry();
  }

  async connectWithRetry(retries = 3, delayMs = 1500): Promise<void> {
    for (let i = 0; i < retries; i++) {
      try {
        await this.$connect();
        this.logger.log("✅ Prisma connected to PostgreSQL successfully.");
        return;
      } catch (err: any) {
        this.logger.warn(
          `⚠️ Prisma connection attempt ${i + 1}/${retries} failed: ${err.message}`,
        );
        if (i < retries - 1) {
          await new Promise((res) => setTimeout(res, delayMs));
        }
      }
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
