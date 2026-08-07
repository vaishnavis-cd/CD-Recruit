// seed/generate_load_test_invites.js
//
// Bulk-creates N candidates + invitations directly via Prisma, tagged so
// they're easy to find and delete afterward, and exports the resulting
// tokens to a CSV that k6 reads.
//
// This is a TEMPLATE - your actual Prisma schema field names (Candidate,
// Invitation, token, expiresAt, etc.) will differ. Check
// backend/prisma/schema.prisma and adjust the create() calls below.
//
// Usage:
//   node seed/generate_load_test_invites.js --count 1000 --out k6/data/invites.csv
//
// IMPORTANT: --count should cover TOTAL ITERATIONS for the run you're
// seeding for, not peak VU count - a VU that runs multiple iterations
// consumes a different invite each time (see README "Sizing your invite
// pool"). Under-sizing this causes invite reuse partway through longer
// runs, which shows up as errors that look like a backend problem but
// are actually test-data exhaustion.
//
// Cleanup after the test:
//   node seed/cleanup_load_test_invites.js

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const crypto = require('crypto');

const prisma = new PrismaClient();

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag, def) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : def;
  };
  return {
    count: parseInt(get('--count', '100'), 10),
    out: get('--out', 'k6/data/invites.csv'),
    baseUrl: get('--base-url', 'http://localhost:5173'),
  };
}

async function main() {
  const { count, out, baseUrl } = parseArgs();
  const rows = ['token,invite_url'];

  console.log(`Seeding ${count} load-test candidates + invitations...`);

  for (let i = 0; i < count; i++) {
    const tag = `loadtest_${Date.now()}_${i}`;
    const token = crypto.randomBytes(16).toString('hex');

    // ---- ADJUST to your real schema ----
    const candidate = await prisma.candidate.create({
      data: {
        email: `${tag}@test.local`,
        name: `Load Test Candidate ${i}`,
        // isLoadTest: true,  // <- add a boolean flag column if you don't
        //                        already have one; makes cleanup trivial
        //                        and lets you exclude these from real
        //                        recruiter dashboards/analytics.
      },
    });

    await prisma.invitation.create({
      data: {
        token,
        candidateId: candidate.id,
        expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000), // matches INVITE_TOKEN_TTL_HOURS
      },
    });
    // -------------------------------------

    rows.push(`${token},${baseUrl}/invite/${token}`);
    if ((i + 1) % 100 === 0) console.log(`  ...${i + 1}/${count}`);
  }

  fs.writeFileSync(out, rows.join('\n') + '\n');
  console.log(`Wrote ${count} invites to ${out}`);
  console.log(`Tag used for cleanup: search for email LIKE 'loadtest_%@test.local'`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
