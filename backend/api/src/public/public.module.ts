import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "../prisma/prisma.module";
import { BillingAccountModule } from "../billing/account/billing-account.module";
import { TrialGrantModule } from "../billing/trial/trial-grant.module";
import { PriceBookModule } from "../billing/price/price-book.module";
import { PublicPricingService } from "./public-pricing.service";
import { PublicOnboardingService } from "./public-onboarding.service";
import { PublicController } from "./public.controller";

@Module({
  imports: [
    PrismaModule,
    BillingAccountModule,
    TrialGrantModule,
    PriceBookModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>("app.jwtSecret") || process.env.JWT_SECRET || "cd-recruit-secret",
        signOptions: { expiresIn: "24h" },
      }),
    }),
  ],
  controllers: [PublicController],
  providers: [PublicPricingService, PublicOnboardingService],
  exports: [PublicPricingService, PublicOnboardingService],
})
export class PublicModule {}
