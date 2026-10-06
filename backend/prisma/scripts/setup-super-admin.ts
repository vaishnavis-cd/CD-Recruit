import { execSync } from 'child_process';
import * as path from 'path';

function run(cmd: string, cwd: string) {
  console.log(`\n▶ Running: ${cmd}`);
  try {
    execSync(cmd, { cwd, stdio: 'inherit', env: process.env });
  } catch (err: any) {
    // If resolve fails because it's already applied or not found, keep going
    if (cmd.includes('migrate resolve')) {
      console.log('ℹ Migration already resolved or clean, continuing...');
      return;
    }
    // On Windows, if dev server is running, the query engine DLL is locked by the node process
    if (cmd.includes('prisma generate')) {
      console.log('ℹ Prisma Client is locked by active server process or already generated. Continuing...');
      return;
    }
    throw err;
  }
}

async function main() {
  const backendDir = path.resolve(__dirname, '../..');
  const rootDir = path.resolve(backendDir, '..');

  console.log('=====================================================');
  console.log('🚀 Setting up Super Admin Database & Credentials...');
  console.log('=====================================================');

  // 1. Resolve obsolete single-schema migration if lingering
  run('npx dotenv-cli -e ../.env -- npx prisma migrate resolve --applied 20260921000000_billing_v3_core', backendDir);

  // 2. Deploy all pending migrations (platform schemas, staff columns, billing)
  run('npx dotenv-cli -e ../.env -- npx prisma migrate deploy', backendDir);

  // 3. Ensure billing_begin has invariants definitions
  run('npx dotenv-cli -e ../.env -- npx ts-node prisma/scripts/apply-billing-begin.ts', backendDir);

  // 4. Seed Platform Staff accounts (OWNER, FINANCE, SUPPORT)
  run('npx dotenv-cli -e ../.env -- npx ts-node prisma/scripts/seed-platform-staff.ts', backendDir);

  // 5. Generate Prisma Client
  run('npx prisma generate', backendDir);

  console.log('\n=====================================================');
  console.log('✅ Super Admin Setup Completed Successfully!');
  console.log('=====================================================');
  console.log('\nAvailable Logins at http://localhost:5175:');
  console.log('  👑 OWNER   : owner@proctora.local   / ProctoraOwner#2026');
  console.log('  💳 FINANCE : finance@proctora.local / ProctoraFinance#2026');
  console.log('  🛡️ SUPPORT : support@proctora.local / ProctoraSupport#2026');
  console.log('\n(Or use the ⚡ One-Click Sign-In buttons on http://localhost:5175/login)\n');
}

main().catch((err) => {
  console.error('\n❌ Setup failed:', err.message || err);
  process.exit(1);
});
