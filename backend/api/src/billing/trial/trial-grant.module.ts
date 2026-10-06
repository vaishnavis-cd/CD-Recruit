import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { CreditPoolModule } from "../pool/credit-pool.module";
import { TrialGrantService } from "./trial-grant.service";

@Module({
  imports: [PrismaModule, CreditPoolModule],
  providers: [TrialGrantService],
  exports: [TrialGrantService],
})
export class TrialGrantModule {}
