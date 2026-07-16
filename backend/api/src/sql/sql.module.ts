import { Module } from "@nestjs/common";
import { SqlController } from "./sql.controller";
import { SqlService } from "./sql.service";
import { SqlSandboxService } from "./sql-sandbox.service";
import { ResultComparatorService } from "./result-comparator.service";
import { PrismaModule } from "../prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [SqlController],
  providers: [SqlService, SqlSandboxService, ResultComparatorService],
  exports: [SqlService],
})
export class SqlModule {}
