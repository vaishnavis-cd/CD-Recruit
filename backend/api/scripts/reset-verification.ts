import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const updatedSessions = await prisma.session.updateMany({
    data: {
      identityVerificationResult: null,
      idVerifiedAt: null,
    },
  });

  const updatedCandidates = await prisma.candidate.updateMany({
    data: {
      identityVerificationResult: null,
      idVerifiedAt: null,
    },
  });

  console.log(`Reset ${updatedSessions.count} sessions and ${updatedCandidates.count} candidates to unverified (Pending) state.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
