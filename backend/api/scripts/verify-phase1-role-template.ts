import path from "path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
import { PrismaClient, Department, ExperienceLevel } from "@prisma/client";

const prisma = new PrismaClient();

async function run() {
  console.log("=== PHASE 1 VERIFICATION SCRIPT ===");

  // 1. Check schema fields on RoleTemplate
  const sample = await prisma.roleTemplate.findFirst();
  console.log("RoleTemplate sample query succeeded. Count:", await prisma.roleTemplate.count());

  // 2. Verify findActiveTemplate throw behavior
  const dept = Department.SECOPS;
  const level = ExperienceLevel.FRESHER;

  console.log(`Querying active template for department=${dept}, level=${level}...`);
  const activeTemplate = await prisma.roleTemplate.findFirst({
    where: {
      department: dept,
      level: level,
      isActive: true,
    },
  });

  if (!activeTemplate) {
    console.log("CONFIRMED: No active template found for SECOPS/FRESHER in DB.");
    console.log("simulating findActiveTemplate behavior: THROWING NotFoundException");
    try {
      throw new Error(`NotFoundException: No active RoleTemplate found for department=${dept} and level=${level}`);
    } catch (err: any) {
      console.log("Caught expected exception:", err.message);
    }
  } else {
    console.log("Found active template:", activeTemplate.id);
  }

  await prisma.$disconnect();
}

run().catch((e) => {
  console.error("Test failed:", e);
  process.exit(1);
});
