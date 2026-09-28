import { Module } from "@nestjs/common";
import { SqlController } from "./sql.controller";
import { SqlService } from "./sql.service";
import { SqlSandboxService } from "./sql-sandbox.service";
import { ResultComparatorService } from "./result-comparator.service";
import { SqlValidatorService } from "./sql-validator.service";
import { SqlCleanupService } from "./sql-cleanup.service";
import { PrismaModule } from "../prisma/prisma.module";
import { SessionModule } from "../session/session.module";

@Module({
  imports: [PrismaModule, SessionModule],
  controllers: [SqlController],
  providers: [
    SqlService,
    SqlSandboxService,
    ResultComparatorService,
    SqlValidatorService,
    SqlCleanupService,
  ],
  exports: [SqlService, ResultComparatorService],
})
export class SqlModule {}
