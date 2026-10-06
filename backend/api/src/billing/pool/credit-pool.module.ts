import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { LedgerModule } from "../ledger/ledger.module";
import { CreditPoolService } from "./credit-pool.service";

@Module({
  imports: [PrismaModule, LedgerModule],
  providers: [CreditPoolService],
  exports: [CreditPoolService],
})
export class CreditPoolModule {}
