// seed/cleanup_load_test_invites.js
// Deletes all candidates/invitations/sessions created by the seed script,
// identified by the loadtest_%@test.local email pattern. Run this after
// every staging load test - don't let synthetic data pile up in a shared
// staging DB, it will skew future test results (bigger tables, more rows
// to scan/index) and clutter recruiter-facing views if staging is shared.
//
// ADJUST table/relation names to your real schema. If cascading deletes
// aren't set up in Prisma, delete child records (sessions, submissions,
// evidence records) before the candidate/invitation rows.

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const candidates = await prisma.candidate.findMany({
    where: { email: { contains: '@test.local' } },
    select: { id: true },
  });
  const ids = candidates.map((c) => c.id);
  console.log(`Found ${ids.length} load-test candidates to remove.`);

  if (ids.length === 0) return;

  // Delete in dependency order - adjust to your real FK graph.
  await prisma.invitation.deleteMany({ where: { candidateId: { in: ids } } });
  // await prisma.session.deleteMany({ where: { candidateId: { in: ids } } });
  // await prisma.submission.deleteMany({ where: { candidateId: { in: ids } } });
  await prisma.candidate.deleteMany({ where: { id: { in: ids } } });

  console.log('Cleanup complete.');
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
