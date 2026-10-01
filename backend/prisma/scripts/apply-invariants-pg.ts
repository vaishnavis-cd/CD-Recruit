import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://cdrecruit:cdrecruit123@127.0.0.1:5434/cdrecruit?schema=public'
  });
  await client.connect();

  const migrationFile = path.join(__dirname, '../migrations/20260928183000_billing_database_invariants/migration.sql');
  const sql = fs.readFileSync(migrationFile, 'utf8');

  console.log('Executing multi-statement migration SQL via pg Client...');
  await client.query(sql);
  console.log('Successfully executed 20260928183000_billing_database_invariants SQL!');

  await client.end();
}

main().catch(err => {
  console.error('Failed to apply invariants:', err);
  process.exit(1);
});
