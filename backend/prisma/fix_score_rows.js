const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    await prisma.$executeRawUnsafe('UPDATE score SET say_do_consistency_score = 0 WHERE say_do_consistency_score IS NULL;');
    await prisma.$executeRawUnsafe('UPDATE score SET bonus_score = 0 WHERE bonus_score IS NULL;');
    await prisma.$executeRawUnsafe('UPDATE score SET core_score = 0 WHERE core_score IS NULL;');
    await prisma.$executeRawUnsafe('UPDATE score SET total_score = 0 WHERE total_score IS NULL;');
    console.log('Score rows updated to non-null.');
  } catch (err) {
    console.log('Score update notice:', err.message);
  }
}

main().catch(console.error).finally(async () => {
  await prisma.$disconnect();
});
