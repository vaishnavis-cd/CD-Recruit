import { Module } from "@nestjs/common";
import { BillingAccountModule } from "../../billing/account/billing-account.module";
import { CreditPoolModule } from "../../billing/pool/credit-pool.module";
import { LedgerModule } from "../../billing/ledger/ledger.module";
import { ManualBillingRequestModule } from "../../billing/manual-request/manual-billing-request.module";
import { PriceBookModule } from "../../billing/price/price-book.module";
import { PaymentModule } from "../../billing/payment/payment.module";
import { PaymentWebhookModule } from "../../billing/webhook/payment-webhook.module";
import { FinanceMetricsModule } from "../../billing/metrics/finance-metrics.module";
import { ReconciliationModule } from "../../billing/reconciliation/reconciliation.module";
import { PlatformAuthModule } from "../auth/platform-auth.module";

import { BillingAccountController } from "./controllers/billing-account.controller";
import { CreditPoolController } from "./controllers/credit-pool.controller";
import { LedgerController } from "./controllers/ledger.controller";
import { ManualBillingRequestController } from "./controllers/manual-billing-request.controller";
import { PriceBookController } from "./controllers/price-book.controller";
import { PaymentController } from "./controllers/payment.controller";
import { FinanceMetricsController } from "./controllers/finance-metrics.controller";
import { ReconciliationController } from "./controllers/reconciliation.controller";
import { IncidentController } from "./controllers/incident.controller";

@Module({
  imports: [
    BillingAccountModule,
    CreditPoolModule,
    LedgerModule,
    ManualBillingRequestModule,
    PriceBookModule,
    PaymentModule,
    PaymentWebhookModule,
    FinanceMetricsModule,
    ReconciliationModule,
    PlatformAuthModule,
  ],
  controllers: [
    BillingAccountController,
    CreditPoolController,
    LedgerController,
    ManualBillingRequestController,
    PriceBookController,
    PaymentController,
    FinanceMetricsController,
    ReconciliationController,
    IncidentController,
  ],
})
export class PlatformBillingModule {}
