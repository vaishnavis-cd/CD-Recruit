import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://cdrecruit:cdrecruit123@127.0.0.1:5434/cdrecruit_test?schema=public'
  });
  await client.connect();

  const migrationFile = path.resolve(process.cwd(), 'prisma/migrations/20260928183000_billing_database_invariants/migration.sql');
  const sql = fs.readFileSync(migrationFile, 'utf8');

  const startIdx = sql.indexOf('CREATE OR REPLACE FUNCTION billing.billing_begin(');
  if (startIdx === -1) {
    throw new Error('billing_begin function not found in migration.sql');
  }
  const fnSql = sql.substring(startIdx);

  console.log('Updating billing_begin function definitions...');
  await client.query(fnSql);
  console.log('Successfully updated billing_begin in database!');

  await client.end();
  process.exit(0);
}

main().catch(err => {
  console.error('Failed to update billing_begin:', err);
  process.exit(1);
});
