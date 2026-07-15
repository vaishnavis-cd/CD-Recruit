import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { AuthService } from "./auth.service";
import { AppConfig } from "@app/config/configuration";

/**
 * AuthModule — owns JwtModule and exposes JwtService + AuthService for
 * other modules (primarily SessionModule) to import.
 *
 * JwtModule is configured async so it reads JWT_SECRET from ConfigService
 * rather than hard-coding a value.
 *
 * What's exported:
 *   JwtService  — SessionModule uses this to verify invite tokens
 *   AuthService — thin wrapper; provides helper methods once implemented
 */
@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        secret: config.get("jwtSecret", { infer: true }),
        signOptions: {
          expiresIn: `${config.get("inviteTokenTtlHours", { infer: true })}h`,
        },
      }),
    }),
  ],
  providers: [AuthService],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
