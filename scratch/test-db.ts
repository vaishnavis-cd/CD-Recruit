import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

async function main() {
  console.log('--- DB Connection Test ---');
  console.log('DATABASE_URL:', process.env.DATABASE_URL || 'Not set in env!');
  try {
    await prisma.$connect();
    console.log('Successfully connected to database!');
    const usersCount = await prisma.user.count();
    console.log('User count:', usersCount);
    const sessionsCount = await prisma.session.count();
    console.log('Session count:', sessionsCount);
  } catch (error) {
    console.error('Database connection failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
