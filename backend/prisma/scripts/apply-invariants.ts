import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function main() {
  await prisma.$connect();

  const migrationFile = path.join(__dirname, '../migrations/20260928183000_billing_database_invariants/migration.sql');
  const sql = fs.readFileSync(migrationFile, 'utf8');

  console.log('Applying invariants migration SQL directly...');
  await prisma.$executeRawUnsafe(sql);
  console.log('Successfully executed 20260928183000_billing_database_invariants SQL!');

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('Failed to apply invariants:', err);
  process.exit(1);
});
