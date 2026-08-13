import { PrismaClient } from "@prisma/client";

const passwords = [
  "postgres",
  "admin",
  "root",
  "123456",
  "password",
  "",
  "postgres123",
  "cdrecruit123",
  "shriram",
  "ShriRamMG",
  "shriram123",
  "postgress",
  "dev",
  "dev123",
  "local",
  "local123"
];

const users = ["postgres", "cdrecruit"];
const dbs = ["cdrecruit", "postgres"];

async function main() {
  for (const u of users) {
    for (const p of passwords) {
      for (const db of dbs) {
        const url = `postgresql://${u}:${p}@localhost:5432/${db}`;
        process.env.DATABASE_URL = url;
        const prisma = new PrismaClient({
          datasources: { db: { url } },
        });

        try {
          await prisma.$connect();
          console.log(`FOUND_WORKING_URL: ${url}`);
          await prisma.$disconnect();
          return;
        } catch (e) {
          await prisma.$disconnect();
        }
      }
    }
  }
  console.log("No working URL found.");
}

main();
