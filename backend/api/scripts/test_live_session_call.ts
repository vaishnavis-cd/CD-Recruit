import axios from "axios";
import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "../../../.env") });
dotenv.config({ path: path.join(__dirname, "../../.env") });

async function testLiveSessionCall() {
  console.log("=== TESTING LIVE API CALL TO /sessions/start ===");
  const prisma = new PrismaClient();
  await prisma.$connect();

  // Find a pending invite
  const invite = await prisma.invite.findFirst({
    where: { token: { not: "" } },
    orderBy: { createdAt: "desc" },
    include: { drive: true },
  });

  if (!invite) {
    console.log("No invite found in DB!");
    return;
  }

  console.log(`Found invite ID ${invite.id}, token: "${invite.token}", drive: "${invite.drive?.name}"`);

  const url = "http://127.0.0.1:3001/api/v1/sessions/start";
  console.log(`Making POST request to ${url}...`);

  try {
    const res = await axios.post(url, { inviteToken: invite.token });
    console.log("✅ SUCCESS! Status:", res.status);
    console.log("Response data:", JSON.stringify(res.data, null, 2));
  } catch (err: any) {
    console.error("❌ FAILED! Status:", err.response?.status);
    console.error("Error Response Data:", err.response?.data);
    console.error("Error Message:", err.message);
  } finally {
    await prisma.$disconnect();
  }
}

testLiveSessionCall();
