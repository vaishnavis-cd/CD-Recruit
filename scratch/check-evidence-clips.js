const { PrismaClient } = require("@cd-recruit/api/node_modules/@prisma/client");
require("dotenv").config({ path: "backend/api/.env" });
const prisma = new PrismaClient();

async function main() {
  try {
    const events = await prisma.proctoringEvent.findMany();
    console.log("Total proctoring events:", events.length);
    console.log("Events with clipUrl:", events.filter(e => e.clipUrl).length);
    
    const clips = await prisma.evidenceClip.findMany();
    console.log("Total evidence clips in DB:", clips.length);
    
    const flags = await prisma.integrityFlag.findMany();
    console.log("Total integrity flags:", flags.length);
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}
main();
