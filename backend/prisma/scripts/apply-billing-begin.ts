import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://cdrecruit:cdrecruit123@127.0.0.1:5434/cdrecruit_test?schema=public'
  });
  await client.connect();

  const migrationFile = path.join(__dirname, '../migrations/20260928183000_billing_database_invariants/migration.sql');
  const sql = fs.readFileSync(migrationFile, 'utf8');

  const startIdx = sql.indexOf('CREATE OR REPLACE FUNCTION billing.billing_begin(');
  const endIdx = sql.indexOf('CREATE OR REPLACE FUNCTION billing.guard_billing_account_mutation()');
  const fnSql = sql.substring(startIdx, endIdx);

  console.log('Updating billing_begin function definitions...');
  await client.query(fnSql);
  console.log('Successfully updated billing_begin in database!');

  await client.end();
}

main().catch(err => {
  console.error('Failed to update billing_begin:', err);
  process.exit(1);
});
