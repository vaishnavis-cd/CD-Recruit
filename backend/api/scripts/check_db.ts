import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../../.env') });
dotenv.config({ path: path.join(__dirname, '../../.env') });
dotenv.config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();

async function main() {
  const count = await prisma.question.count();
  console.log(`Current DB Question Count: ${count}`);

  const distribution = await prisma.question.groupBy({
    by: ['role', 'moduleType'],
    _count: { id: true },
  });

  console.log('Current DB Distribution by Role & ModuleType:');
  console.table(distribution.map(d => ({ role: d.role, moduleType: d.moduleType, count: d._count.id })));

  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
