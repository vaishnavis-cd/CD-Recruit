import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { ReconciliationModule } from "../reconciliation/reconciliation.module";
import { FinanceMetricsService } from "./finance-metrics.service";

@Module({
  imports: [PrismaModule, ReconciliationModule],
  providers: [FinanceMetricsService],
  exports: [FinanceMetricsService],
})
export class FinanceMetricsModule {}
