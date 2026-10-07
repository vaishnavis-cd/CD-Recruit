#!/usr/bin/env ts-node
/**
 * Emergency Recovery Script: Reset Platform OWNER MFA
 *
 * Use case:
 * When an OWNER staff member has lost access to their MFA authenticator application,
 * and no other active OWNER exists to reset it via the Super Admin Console.
 *
 * Safety requirements:
 * 1. Environment variable CONFIRM_RESET_OWNER_MFA=yes must be set.
 * 2. Operates ONLY on PlatformStaff with role='OWNER'.
 * 3. Never prints secrets or tokens to stdout/stderr.
 * 4. Increments token_version to immediately invalidate all existing sessions.
 * 5. Writes an immutable platform_audit_event with actorId 'system:recovery-script'.
 *
 * Usage:
 * CONFIRM_RESET_OWNER_MFA=yes npx ts-node --project backend/api/tsconfig.json backend/prisma/scripts/reset-owner-mfa.ts <owner_email>
 */

import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

export async function resetOwnerMfa(email: string, customPrisma?: PrismaClient) {
  if (process.env.CONFIRM_RESET_OWNER_MFA !== 'yes') {
    throw new Error('Safety confirmation required. Please re-run with environment variable CONFIRM_RESET_OWNER_MFA=yes');
  }

  const normalizedEmail = email.trim().toLowerCase();
  const prisma = customPrisma || new PrismaClient();

  try {
    const staff = await prisma.platformStaff.findUnique({
      where: { email: normalizedEmail },
    });

    if (!staff) {
      throw new Error(`Platform staff with email "${normalizedEmail}" not found.`);
    }

    if (staff.role !== 'OWNER') {
      throw new Error(`Target staff member has role "${staff.role}". This recovery script only operates on OWNER accounts.`);
    }

    const eventId = crypto.randomUUID();
    const now = new Date();

    await prisma.$transaction(async (tx) => {
      // Clear TOTP secret, disable MFA, and bump tokenVersion
      await tx.platformStaff.update({
        where: { id: staff.id },
        data: {
          totpSecretEncrypted: null,
          mfaEnabled: false,
          tokenVersion: { increment: 1 },
        },
      });

      // Write immutable audit log
      await tx.systemAuditEvent.create({
        data: {
          id: eventId,
          timestamp: now,
          actorId: 'system:recovery-script',
          actorRole: 'SYSTEM',
          subjectType: 'STAFF',
          subjectId: staff.id,
          action: 'STAFF_MFA_RESET',
          reason: 'Emergency OWNER MFA reset via CLI recovery script',
          executionResult: 'SUCCESS',
        },
      });
    });

    return { success: true, staffId: staff.id };
  } finally {
    if (!customPrisma) {
      await prisma.$disconnect();
    }
  }
}

async function main() {
  const emailArg = process.argv[2];

  if (!emailArg || typeof emailArg !== 'string' || !emailArg.includes('@')) {
    console.error('Error: Please provide a valid target OWNER email address as an argument.');
    console.error('Usage: CONFIRM_RESET_OWNER_MFA=yes npx ts-node backend/prisma/scripts/reset-owner-mfa.ts <email>');
    process.exit(1);
  }

  try {
    const result = await resetOwnerMfa(emailArg);
    console.log(`✅ Successfully reset MFA for OWNER staff ID: ${result.staffId}`);
    console.log(`ℹ️ At next login, the user will be prompted to set up a new MFA authenticator.`);
    console.log(`ℹ️ All previous active sessions have been invalidated (token_version incremented).`);
  } catch (error: any) {
    console.error('Error executing MFA recovery script:', error.message || error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { main as resetOwnerMfaScript };

