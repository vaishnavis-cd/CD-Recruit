import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'postgresql://cdrecruit:cdrecruit123@localhost:5432/cdrecruit',
    },
  },
});

async function main() {
  const staff = await prisma.staff.findFirst({ where: { role: 'ADMIN' } }) || await prisma.staff.findFirst();
  if (!staff) {
    console.error('No staff user found');
    return;
  }

  const roleTemplate = await prisma.roleTemplate.findFirst({
    where: { department: 'SECOPS', level: 'FRESHER', isActive: true },
  });

  if (!roleTemplate) {
    console.error('No SECOPS FRESHER active role template found');
    return;
  }

  // Create SECOPS drive
  const secopsDrive = await prisma.drive.create({
    data: {
      name: 'SecOps Verification Drive',
      roleTemplateId: roleTemplate.id,
      moduleConfig: {
        MCQ: { enabled: true, durationMinutes: 15, weight: 0.2 },
        SQL: { enabled: true, durationMinutes: 20, weight: 0.2 },
        CODING: { enabled: true, durationMinutes: 30, weight: 0.3 },
      },
      status: 'ACTIVE',
      scheduleStart: new Date(),
      scheduleEnd: new Date(Date.now() + 24 * 60 * 60 * 1000),
      createdById: staff.id,
    },
  });

  // Create candidate & session
  const candidate = await prisma.candidate.create({
    data: {
      email: `secops_candidate_${Date.now()}@example.com`,
      name: 'SecOps Test Candidate',
    },
  });

  const session = await prisma.session.create({
    data: {
      candidateId: candidate.id,
      roleTemplateId: roleTemplate.id,
      driveId: secopsDrive.id,
      status: 'IN_PROGRESS',
      cvMode: 'FULL',
    },
  });

  console.log('Created SECOPS Drive ID:', secopsDrive.id);
  console.log('Created SECOPS Session ID:', session.id);

  // Now test buildQuestionList logic
  const driveQuestions = await prisma.driveQuestion.findMany({
    where: { driveId: secopsDrive.id },
    include: { question: true },
  });

  console.log('DriveQuestions count for SECOPS drive:', driveQuestions.length);

  const drive = await prisma.drive.findUnique({
    where: { id: secopsDrive.id },
    include: {
      roleTemplate: {
        include: {
          questions: {
            include: { question: true },
          },
        },
      },
    },
  });

  console.log('RoleTemplate attached questions for SECOPS:', drive?.roleTemplate?.questions.length);
  const qRoles = drive?.roleTemplate?.questions.map(q => q.question?.role);
  console.log('Question roles returned for SECOPS session:', qRoles);

  // Test SYSOPS session
  let sysopsDrive: any;
  let sysopsTemplate = await prisma.roleTemplate.findFirst({
    where: { roleName: 'sysops' }
  });
  if (!sysopsTemplate) {
    sysopsTemplate = await prisma.roleTemplate.create({
      data: {
        roleName: 'SYSOPS',
        weightingPreset: { MCQ: 0.2, SQL: 0.2, CODING: 0.3 },
        durationMinutes: 90,
        department: 'SYSOPS',
        level: 'FRESHER',
      }
    });
  }

  sysopsDrive = await prisma.drive.create({
    data: {
      name: 'SysOps Verification Drive',
      roleTemplateId: sysopsTemplate.id,
      moduleConfig: {
        MCQ: { enabled: true, durationMinutes: 15, weight: 0.2 },
      },
      status: 'ACTIVE',
      scheduleStart: new Date(),
      scheduleEnd: new Date(Date.now() + 24 * 60 * 60 * 1000),
      createdById: staff.id,
    },
  });

  const sysopsCandidate = await prisma.candidate.create({
    data: {
      email: `sysops_candidate_${Date.now()}@example.com`,
      name: 'SysOps Test Candidate',
    },
  });

  const sysopsSession = await prisma.session.create({
    data: {
      candidateId: sysopsCandidate.id,
      roleTemplateId: sysopsTemplate.id,
      driveId: sysopsDrive.id,
      status: 'IN_PROGRESS',
      cvMode: 'FULL',
    },
  });

  console.log('Created SYSOPS Session ID:', sysopsSession.id);

  const sysopsDriveData = await prisma.drive.findUnique({
    where: { id: sysopsDrive.id },
    include: {
      roleTemplate: {
        include: {
          questions: {
            include: { question: true },
          },
        },
      },
    },
  });

  const sysopsDeptName = sysopsDriveData?.roleTemplate?.department || sysopsDriveData?.roleTemplate?.roleName || "UNSPECIFIED";
  console.log('SYSOPS resolved department name:', sysopsDeptName);
  const sysopsDeptQuestions = await prisma.question.findMany({
    where: {
      status: "PUBLISHED",
      OR: [
        { role: { equals: sysopsDeptName, mode: "insensitive" } },
        { content: { path: ["department"], equals: sysopsDeptName } },
      ],
    },
  });
  console.log('SYSOPS department-scoped questions count:', sysopsDeptQuestions.length);
}

main().finally(() => prisma.$disconnect());
