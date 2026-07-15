import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

/**
 * PrismaModule — globally registered so PrismaService can be injected into
 * any module without needing an explicit import in each feature module.
 *
 * Mark as @Global() means: register once in AppModule, available everywhere.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
