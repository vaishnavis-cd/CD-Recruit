import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { LedgerModule } from "./ledger/ledger.module";
import { ShadowBillingService } from "./shadow-billing.service";
import { ShadowReconciliationService } from "./shadow-reconciliation.service";
import { ShadowTelemetryService } from "./shadow-telemetry.service";

@Module({
  imports: [PrismaModule, LedgerModule],
  controllers: [],
  providers: [
    ShadowBillingService,
    ShadowReconciliationService,
    ShadowTelemetryService,
  ],
  exports: [
    LedgerModule,
    ShadowBillingService,
    ShadowReconciliationService,
    ShadowTelemetryService,
  ],
})
export class BillingModule {}
