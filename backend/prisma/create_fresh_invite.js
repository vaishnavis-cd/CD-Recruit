const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const prisma = new PrismaClient();

async function main() {
  // Get existing staff, role, and drive (all required)
  const staff = await prisma.staff.findFirst();
  if (!staff) throw new Error('No staff found');

  const role = await prisma.roleTemplate.findFirst();
  if (!role) throw new Error('No role template found');

  const drive = await prisma.drive.findFirst({ where: { status: 'ACTIVE' }, orderBy: { createdAt: 'desc' } });
  if (!drive) throw new Error('No active drive found');

  const token = 'inv_fresh_' + crypto.randomBytes(8).toString('hex');
  // Use a unique email per invite so a previous submitted session doesn't block access
  const uniqueEmail = `tester.${crypto.randomBytes(4).toString('hex')}@example.com`;

  const invite = await prisma.invite.create({
    data: {
      token,
      driveId: drive.id,
      roleTemplateId: role.id,
      createdById: staff.id,
      candidateEmail: uniqueEmail,
      candidateName: 'Karthik Srinivasan',
      scheduledTime: new Date(Date.now() - 5 * 60 * 1000), // 5 min ago = active now
      expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000), // expires in 6 hours
      status: 'PENDING',
      bufferMinutes: 60,
      graceMinutes: 180,
    },
  });

  console.log('');
  console.log('✅ Fresh invite created!');
  console.log('');
  console.log('👉 LINK: http://localhost:3000/invite/' + token);
  console.log('');
  console.log('Token     :', token);
  console.log('Expires   :', new Date(Date.now() + 6 * 60 * 60 * 1000).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }), 'IST');
  console.log('');
}

main()
  .catch(e => { console.error('Error:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
