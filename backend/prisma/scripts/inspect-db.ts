import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  await prisma.$connect();

  console.log('=== 1. TABLES IN BILLING SCHEMA ===');
  const billingTables = await prisma.$queryRawUnsafe("SELECT table_name FROM information_schema.tables WHERE table_schema = 'billing' ORDER BY table_name;");
  console.table(billingTables);

  console.log('=== 2. TABLES IN PLATFORM SCHEMA ===');
  const platformTables = await prisma.$queryRawUnsafe("SELECT table_name FROM information_schema.tables WHERE table_schema = 'platform' ORDER BY table_name;");
  console.table(platformTables);

  console.log('=== 3. TRIGGERS IN BILLING & PLATFORM SCHEMAS ===');
  const triggers = await prisma.$queryRawUnsafe("SELECT trigger_schema, event_object_table, trigger_name FROM information_schema.triggers WHERE trigger_schema IN ('billing', 'platform') ORDER BY trigger_schema, event_object_table;");
  console.table(triggers);

  console.log('=== 4. CONSTRAINTS IN BILLING & PLATFORM SCHEMAS ===');
  const constraints = await prisma.$queryRawUnsafe("SELECT table_schema, table_name, constraint_name, constraint_type FROM information_schema.table_constraints WHERE table_schema IN ('billing', 'platform') ORDER BY table_schema, table_name;");
  console.table(constraints);

  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
