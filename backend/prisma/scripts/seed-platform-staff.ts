import { PrismaClient } from '@prisma/client';
import { PlatformStaffRole } from '@cd-recruit/shared-types';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const keylen = 64;
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`scrypt$${salt.toString('hex')}$${derivedKey.toString('hex')}`);
    });
  });
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed platform staff: execution is strictly prohibited in production (NODE_ENV=production).');
  }

  console.log('🌱 Seeding Platform Staff accounts for local development...');

  const ownerPassword = process.env.SEED_PLATFORM_OWNER_PASSWORD || 'ProctoraOwner#2026';
  const financePassword = process.env.SEED_PLATFORM_FINANCE_PASSWORD || 'ProctoraFinance#2026';
  const supportPassword = process.env.SEED_PLATFORM_SUPPORT_PASSWORD || 'ProctoraSupport#2026';

  const staffUsers = [
    {
      email: 'owner@proctora.local',
      name: 'Ragul Arumugam (Platform Owner)',
      role: PlatformStaffRole.OWNER,
      isActive: true,
      password: ownerPassword,
    },
    {
      email: 'finance@proctora.local',
      name: 'Platform Finance Lead',
      role: PlatformStaffRole.FINANCE,
      isActive: true,
      password: financePassword,
    },
    {
      email: 'support@proctora.local',
      name: 'Platform Support Specialist',
      role: PlatformStaffRole.SUPPORT,
      isActive: true,
      password: supportPassword,
    },
  ];

  for (const user of staffUsers) {
    const passwordHash = await hashPassword(user.password);
    const staff = await prisma.platformStaff.upsert({
      where: { email: user.email },
      update: {
        name: user.name,
        role: user.role,
        isActive: user.isActive,
        passwordHash,
      },
      create: {
        email: user.email,
        name: user.name,
        role: user.role,
        isActive: user.isActive,
        mfaEnabled: false,
        passwordHash,
      },
    });

    console.log(`✅ Platform Staff: ${staff.email} (${staff.role}) -> Ready`);
  }

  console.log('🎉 Platform Staff seeding complete!');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding platform staff:', e.message || e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
