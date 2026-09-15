const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const drives = await prisma.drive.findMany();
  console.log('DRIVES:', JSON.stringify(drives, null, 2));

  const invites = await prisma.invite.findMany({ take: 3, orderBy: { createdAt: 'desc' } });
  console.log('LATEST INVITES:', JSON.stringify(invites, null, 2));
}

main().catch(console.error).finally(async () => {
  await prisma.$disconnect();
});
