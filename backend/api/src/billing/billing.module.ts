import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { LedgerModule } from "./ledger/ledger.module";
import { PoolService } from "./pool.service";
import { MakerCheckerService } from "./maker-checker.service";
import { ShadowBillingService } from "./shadow-billing.service";
import { ShadowReconciliationService } from "./shadow-reconciliation.service";
import { ShadowTelemetryService } from "./shadow-telemetry.service";
import { CreditEnforcementService } from "./credit-enforcement.service";

import { BillingController } from "./billing.controller";

@Module({
  imports: [PrismaModule, LedgerModule],
  controllers: [BillingController],
  providers: [
    PoolService,
    MakerCheckerService,
    ShadowBillingService,
    ShadowReconciliationService,
    ShadowTelemetryService,
    CreditEnforcementService,
  ],
  exports: [
    LedgerModule,
    PoolService,
    MakerCheckerService,
    ShadowBillingService,
    ShadowReconciliationService,
    ShadowTelemetryService,
    CreditEnforcementService,
  ],
})
export class BillingModule {}
