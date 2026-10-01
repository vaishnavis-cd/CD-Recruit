import { Client } from 'pg';

async function checkDb(dbName: string) {
  const client = new Client({
    connectionString: `postgresql://cdrecruit:cdrecruit123@127.0.0.1:5434/${dbName}`
  });
  await client.connect();
  console.log(`\n================== DB: ${dbName} ==================`);

  // Tables in platform and billing schemas
  const tables = await client.query(`
    SELECT table_schema, table_name 
    FROM information_schema.tables 
    WHERE table_schema IN ('billing', 'platform')
    ORDER BY table_schema, table_name;
  `);
  console.log('\n--- Tables in billing & platform schemas ---');
  tables.rows.forEach(r => console.log(`  [${r.table_schema}] ${r.table_name}`));

  // Triggers
  const triggers = await client.query(`
    SELECT trigger_schema, event_object_table, trigger_name 
    FROM information_schema.triggers 
    WHERE trigger_schema IN ('billing', 'platform', 'public')
    ORDER BY trigger_schema, event_object_table, trigger_name;
  `);
  console.log('\n--- Triggers ---');
  triggers.rows.forEach(r => console.log(`  [${r.trigger_schema}.${r.event_object_table}] ${r.trigger_name}`));

  // Check constraints
  const constraints = await client.query(`
    SELECT nspname AS schema_name, relname AS table_name, conname AS constraint_name, pg_get_constraintdef(c.oid) AS def
    FROM pg_constraint c
    JOIN pg_class cl ON cl.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = cl.relnamespace
    WHERE nspname IN ('billing', 'platform')
    ORDER BY nspname, relname, conname;
  `);
  console.log('\n--- Constraints ---');
  constraints.rows.forEach(r => console.log(`  [${r.schema_name}.${r.table_name}] ${r.constraint_name}: ${r.def}`));

  await client.end();
}

async function main() {
  await checkDb('cdrecruit');
  await checkDb('cdrecruit_test');
}

main().catch(console.error);
