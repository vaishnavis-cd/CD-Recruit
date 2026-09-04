import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const sessions = await prisma.session.findMany({
    select: {
      id: true,
      status: true,
      identityVerificationResult: true,
      candidate: {
        select: {
          id: true,
          name: true,
          email: true,
          identityVerificationResult: true,
        },
      },
    },
  });
  console.log("Sessions count:", sessions.length);
  for (const s of sessions) {
    console.log(`Session ${s.id} (${s.candidate?.name}): session.idVerifyResult = ${JSON.stringify(s.identityVerificationResult)}, candidate.idVerifyResult = ${JSON.stringify(s.candidate?.identityVerificationResult)}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
