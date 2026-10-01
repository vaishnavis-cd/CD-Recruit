import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { LedgerModule } from "../ledger/ledger.module";
import { CreditPoolModule } from "../pool/credit-pool.module";
import { BillingAccountModule } from "../account/billing-account.module";
import { ManualBillingRequestService } from "./manual-billing-request.service";

@Module({
  imports: [PrismaModule, LedgerModule, CreditPoolModule, BillingAccountModule],
  providers: [ManualBillingRequestService],
  exports: [ManualBillingRequestService],
})
export class ManualBillingRequestModule {}
