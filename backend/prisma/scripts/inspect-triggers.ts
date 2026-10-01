import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  await prisma.$connect();

  const triggers: any[] = await prisma.$queryRawUnsafe(`
    SELECT trigger_schema, event_object_table, trigger_name 
    FROM information_schema.triggers 
    WHERE trigger_schema IN ('billing', 'platform', 'public')
    ORDER BY trigger_schema, event_object_table;
  `);
  console.log('ALL_TRIGGERS:', JSON.stringify(triggers, null, 2));

  const functions: any[] = await prisma.$queryRawUnsafe(`
    SELECT routine_schema, routine_name 
    FROM information_schema.routines 
    WHERE routine_schema IN ('billing', 'platform')
    ORDER BY routine_schema, routine_name;
  `);
  console.log('ROUTINES:', JSON.stringify(functions, null, 2));

  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
