const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const alters = [
    `ALTER TABLE invite ADD COLUMN IF NOT EXISTS id_proof_embedding JSONB;`,
    `ALTER TABLE invite ADD COLUMN IF NOT EXISTS baseline_selfie_embedding JSONB;`,
    `ALTER TABLE candidate ADD COLUMN IF NOT EXISTS baseline_selfie_embedding JSONB;`,
    `ALTER TABLE session ADD COLUMN IF NOT EXISTS id_proof_extracted_name TEXT;`,
    `ALTER TABLE session ADD COLUMN IF NOT EXISTS id_verified_at TIMESTAMP;`,
  ];
  for (const sql of alters) {
    try {
      await prisma.$executeRawUnsafe(sql);
    } catch {}
  }

  const staff = await prisma.staff.findFirst();
  const drives = await prisma.drive.findMany({ where: { status: 'ACTIVE' }, take: 1 });
  let drive = drives[0];
  if (!drive) {
    const role = await prisma.roleTemplate.findFirst();
    drive = await prisma.drive.create({
      data: {
        name: 'SDE Live Assessment - Active',
        status: 'ACTIVE',
        roleTemplate: { connect: { id: role.id } },
        createdBy: { connect: { id: staff.id } },
        scheduleStart: new Date(Date.now() - 10 * 60 * 1000),
        scheduleEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        bufferMinutes: 15,
        graceMinutes: 120,
      },
    });
  }

  // Create an active invite
  const token = 'inv_live_' + Date.now().toString(36);
  const invite = await prisma.invite.create({
    data: {
      token: token,
      drive: { connect: { id: drive.id } },
      roleTemplate: { connect: { id: drive.roleTemplateId } },
      createdBy: { connect: { id: drive.createdById || staff.id } },
      candidateEmail: 'candidate@test.com',
      candidateName: 'Karthik Candidate',
      scheduledTime: new Date(Date.now() - 5 * 60 * 1000), // active right now
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      status: 'PENDING',
      bufferMinutes: 15,
      graceMinutes: 180, // 3 hours grace window
    },
  });

  console.log('\n======================================================');
  console.log('🎉 ACTIVE CANDIDATE INVITE CREATED (STATUS: PENDING):');
  console.log('Token:       ' + invite.token);
  console.log('Drive:       ' + drive.name);
  console.log('Invite Link: http://localhost:3000/invite/' + invite.token);
  console.log('======================================================\n');
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
