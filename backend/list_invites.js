const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

async function main() {
  // Just list the 5 most recent invites with their tokens and status
  const invites = await db.invite.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      token: true,
      status: true,
      scheduledTime: true,
      createdAt: true,
      candidateEmail: true,
      candidateName: true,
    },
  });

  console.log('\n=== Recent Invites ===');
  invites.forEach(inv => {
    console.log('');
    console.log('Token     :', inv.token);
    console.log('Status    :', inv.status);
    console.log('Candidate :', inv.candidateName, '|', inv.candidateEmail);
    console.log('Scheduled :', inv.scheduledTime);
    console.log('Created   :', inv.createdAt);
    console.log('Link      : http://localhost:3000/invite/' + inv.token);
  });
  console.log('');
}

main()
  .catch(e => { console.error('Error:', e.message); process.exit(1); })
  .finally(() => db.$disconnect());
