import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  await prisma.$connect();

  const billingTables: any[] = await prisma.$queryRawUnsafe("SELECT table_name FROM information_schema.tables WHERE table_schema = 'billing' ORDER BY table_name;");
  console.log('BILLING_TABLES:', billingTables.map(t => t.table_name));

  const platformTables: any[] = await prisma.$queryRawUnsafe("SELECT table_name FROM information_schema.tables WHERE table_schema = 'platform' ORDER BY table_name;");
  console.log('PLATFORM_TABLES:', platformTables.map(t => t.table_name));

  const triggers: any[] = await prisma.$queryRawUnsafe("SELECT trigger_schema, event_object_table, trigger_name FROM information_schema.triggers WHERE trigger_schema IN ('billing', 'platform') ORDER BY trigger_schema, event_object_table;");
  console.log('TRIGGERS:', triggers);

  const checkConstraints: any[] = await prisma.$queryRawUnsafe("SELECT table_schema, table_name, constraint_name, constraint_type FROM information_schema.table_constraints WHERE table_schema IN ('billing', 'platform') AND constraint_type = 'CHECK' ORDER BY table_schema, table_name;");
  console.log('CHECK_CONSTRAINTS:', checkConstraints);

  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
