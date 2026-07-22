const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const invites = await prisma.invite.findMany({
    take: 10,
    include: { drive: true },
  });
  console.log('--- INVITES IN DATABASE ---');
  for (const inv of invites) {
    console.log(`Token: ${inv.token} | Status: ${inv.status} | Drive: ${inv.drive?.name || 'N/A'}`);
  }
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
