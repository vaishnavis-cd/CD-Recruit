import axios from "axios";
import { PrismaClient } from "@prisma/client";
import { JwtService } from "@nestjs/jwt";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "../../../.env") });
dotenv.config({ path: path.join(__dirname, "../../.env") });

async function testDriveCreateUuid() {
  console.log("=== TESTING DRIVE CREATION WITH UUID ROLE TEMPLATE ID ===");

  const prisma = new PrismaClient();
  await prisma.$connect();

  const roleTemplate = await prisma.roleTemplate.findFirst({
    where: { isActive: true },
  });

  if (!roleTemplate) {
    throw new Error("No active RoleTemplate found in DB.");
  }

  const staff = await prisma.staff.findFirst();
  if (!staff) {
    throw new Error("No staff found in DB.");
  }

  console.log(`Testing drive creation with RoleTemplate UUID: "${roleTemplate.id}" (${roleTemplate.roleName})`);

  const jwtService = new JwtService({ secret: process.env.JWT_SECRET || "super-secret-default-key-for-cd-recruit-development-only" });
  const staffToken = jwtService.sign({ sub: staff.id, email: staff.email, role: staff.role });

  const url = "http://127.0.0.1:3001/api/v1/admin/drives";

  try {
    const res = await axios.post(
      url,
      {
        name: `UUID Verification Drive ${Date.now()}`,
        roleTemplateId: roleTemplate.id,
      },
      {
        headers: {
          Authorization: `Bearer ${staffToken}`,
        },
      }
    );

    console.log("✅ DRIVE CREATED SUCCESSFULLY via HTTP!");
    console.log("Response Data:", JSON.stringify(res.data, null, 2));
  } catch (err: any) {
    console.error("❌ DRIVE CREATION FAILED:", err.response?.data || err.message);
  } finally {
    await prisma.$disconnect();
  }
}

testDriveCreateUuid();
