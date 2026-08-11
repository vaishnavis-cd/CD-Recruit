import { PrismaClient } from "@prisma/client";
import * as crypto from "crypto";
import { hashApiKey } from "../src/common/utils/api-key.util";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

async function main() {
  const prisma = new PrismaClient();
  const rawKey = "pk_live_" + crypto.randomBytes(24).toString("hex");
  const hashed = hashApiKey(rawKey);

  const partner = await prisma.partner.create({
    data: {
      name: "Test ATS Partner",
      hashedApiKey: hashed,
      rateLimit: 100,
    },
  });

  console.log("=========================================");
  console.log("TEST PARTNER CREATED SUCCESSFULLY");
  console.log("Partner ID:", partner.id);
  console.log("Partner Name:", partner.name);
  console.log("RAW API KEY (X-API-Key):", rawKey);
  console.log("=========================================");
  await prisma.$disconnect();
}

main().catch(console.error);
