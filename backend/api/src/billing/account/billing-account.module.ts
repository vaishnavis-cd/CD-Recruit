import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { BillingAccountService } from "./billing-account.service";

@Module({
  imports: [PrismaModule],
  providers: [BillingAccountService],
  exports: [BillingAccountService],
})
export class BillingAccountModule {}
