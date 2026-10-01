import { Client } from 'pg';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const adminClient = new Client({
    connectionString: 'postgresql://cdrecruit:cdrecruit123@127.0.0.1:5434/cdrecruit?schema=public'
  });
  await adminClient.connect();

  console.log('Recreating database cdrecruit_test...');
  await adminClient.query('DROP DATABASE IF EXISTS cdrecruit_test WITH (FORCE);');
  await adminClient.query('CREATE DATABASE cdrecruit_test;');
  console.log('Database cdrecruit_test created freshly.');
  await adminClient.end();

  // Run migrations on cdrecruit_test
  const testDbUrl = 'postgresql://cdrecruit:cdrecruit123@127.0.0.1:5434/cdrecruit_test';
  console.log('Applying prisma migrations to cdrecruit_test...');
  execSync(`npx prisma migrate deploy --schema=backend/prisma/schema.prisma`, {
    env: { ...process.env, DATABASE_URL: testDbUrl },
    stdio: 'inherit',
  });

  console.log('Seeding cdrecruit_test...');
  execSync(`npx ts-node --project backend/api/tsconfig.json backend/prisma/seed.ts`, {
    env: { ...process.env, DATABASE_URL: testDbUrl },
    stdio: 'inherit',
  });

  console.log('cdrecruit_test is fully initialized and seeded!');
}

main().catch(err => {
  console.error('Setup failed:', err);
  process.exit(1);
});
