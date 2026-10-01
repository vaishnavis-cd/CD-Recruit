import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { LedgerModule } from "../ledger/ledger.module";
import { CreditPoolModule } from "../pool/credit-pool.module";
import { PriceBookModule } from "../price/price-book.module";
import { BillingAccountModule } from "../account/billing-account.module";
import { PaymentService } from "./payment.service";

@Module({
  imports: [
    PrismaModule,
    LedgerModule,
    CreditPoolModule,
    PriceBookModule,
    BillingAccountModule,
  ],
  providers: [PaymentService],
  exports: [PaymentService],
})
export class PaymentModule {}
