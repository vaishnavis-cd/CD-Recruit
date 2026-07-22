import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
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
    try {
      await this.$connect();
      console.log("✅ Prisma connected to PostgreSQL successfully.");
    } catch (err: any) {
      console.warn("⚠️ Warning: Prisma failed to connect to PostgreSQL on startup:", err.message);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
