import { Module } from "@nestjs/common";
import { PassportModule } from "@nestjs/passport";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { PrismaModule } from "../../prisma/prisma.module";
import { PlatformAuthService } from "./platform-auth.service";
import { PlatformAuthController } from "./platform-auth.controller";
import { PlatformJwtStrategy } from "./strategies/platform-jwt.strategy";
import { PlatformJwtAuthGuard } from "./guards/platform-jwt-auth.guard";
import { PlatformRolesGuard } from "./guards/platform-roles.guard";

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret:
          configService.get<string>("app.platformJwtSecret") ||
          process.env.PLATFORM_JWT_SECRET ||
          (process.env.JWT_SECRET ? `${process.env.JWT_SECRET}:platform` : "proctora-platform-secret"),
        signOptions: { expiresIn: "15m", issuer: "proctora-platform" },
      }),
    }),
  ],
  controllers: [PlatformAuthController],
  providers: [
    PlatformAuthService,
    PlatformJwtStrategy,
    PlatformJwtAuthGuard,
    PlatformRolesGuard,
  ],
  exports: [
    PlatformAuthService,
    PlatformJwtAuthGuard,
    PlatformRolesGuard,
    PlatformJwtStrategy,
  ],
})
export class PlatformAuthModule {}
