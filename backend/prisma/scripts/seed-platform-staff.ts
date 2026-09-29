import { PrismaClient, PlatformStaffRole, PlatformStaffStatus } from '@prisma/client';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto
    .pbkdf2Sync(password, salt, 100000, 64, 'sha512')
    .toString('hex');
  return `${salt}:${hash}`;
}

async function main() {
  console.log('🌱 Seeding Platform Staff accounts...');

  const staffUsers = [
    {
      email: 'owner@proctora.local',
      fullName: 'Ragul Arumugam (Platform Owner)',
      role: PlatformStaffRole.OWNER,
      status: PlatformStaffStatus.ACTIVE,
      password: 'ProctoraOwner#2026',
    },
    {
      email: 'finance@proctora.local',
      fullName: 'Platform Finance Lead',
      role: PlatformStaffRole.FINANCE,
      status: PlatformStaffStatus.ACTIVE,
      password: 'ProctoraFinance#2026',
    },
    {
      email: 'support@proctora.local',
      fullName: 'Platform Support Specialist',
      role: PlatformStaffRole.SUPPORT,
      status: PlatformStaffStatus.ACTIVE,
      password: 'ProctoraSupport#2026',
    },
  ];

  for (const user of staffUsers) {
    const passwordHash = hashPassword(user.password);
    const staff = await prisma.platformStaff.upsert({
      where: { email: user.email },
      update: {
        fullName: user.fullName,
        role: user.role,
        status: user.status,
        passwordHash,
      },
      create: {
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        status: user.status,
        passwordHash,
      },
    });

    console.log(`✅ Platform Staff: ${staff.email} (${staff.role}) -> Ready`);
  }

  console.log('🎉 Platform Staff seeding complete!');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding platform staff:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
