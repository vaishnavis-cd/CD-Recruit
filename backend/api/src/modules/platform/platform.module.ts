import { Module, Global } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';

import { PlatformAuthService } from './auth/platform-auth.service';
import { PlatformAuthController } from './auth/platform-auth.controller';
import { PlatformAuthGuard } from './auth/guards/platform-auth.guard';
import { PlatformRolesGuard } from './auth/guards/platform-roles.guard';

import { AuditService } from './audit/audit.service';
import { AuditController } from './audit/audit.controller';

import { MockBillingAccountService } from './mocks/mock-billing-account.service';
import { MockTrialGrantService } from './mocks/mock-trial-grant.service';

@Global()
@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret:
          configService.get<string>('PLATFORM_JWT_SECRET') ||
          configService.get<string>('JWT_SECRET') ||
          'cd-recruit-platform-super-secret-key-2026',
        signOptions: { expiresIn: '8h' },
      }),
    }),
  ],
  controllers: [
    PlatformAuthController,
    AuditController,
  ],
  providers: [
    PlatformAuthService,
    PlatformAuthGuard,
    PlatformRolesGuard,
    AuditService,
    MockBillingAccountService,
    MockTrialGrantService,
  ],
  exports: [
    PlatformAuthService,
    PlatformAuthGuard,
    PlatformRolesGuard,
    AuditService,
    MockBillingAccountService,
    MockTrialGrantService,
    JwtModule,
  ],
})
export class PlatformModule {}
