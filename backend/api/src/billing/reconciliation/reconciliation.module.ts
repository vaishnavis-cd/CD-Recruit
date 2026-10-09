import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { ReconciliationService } from "./reconciliation.service";
import { ReconciliationScheduler } from "./reconciliation.scheduler";

@Module({
  imports: [PrismaModule],
  providers: [ReconciliationService, ReconciliationScheduler],
  exports: [ReconciliationService, ReconciliationScheduler],
})
export class ReconciliationModule {}
