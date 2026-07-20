import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

async function main() {
  const result = await p.session.updateMany({
    where: { status: { in: ["IN_PROGRESS", "DISCONNECTED"] } },
    data: { status: "SUBMITTED" },
  });
  console.log("Closed sessions:", result);
}

main().finally(() => p.$disconnect());
