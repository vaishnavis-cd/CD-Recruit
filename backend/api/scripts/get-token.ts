import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const invite = await prisma.invite.findFirst({
    orderBy: { createdAt: "desc" },
  });
  console.log("TOKEN_START");
  console.log(invite ? invite.token : "NO_TOKEN");
  console.log("TOKEN_END");
}

main().finally(() => prisma.$disconnect());
