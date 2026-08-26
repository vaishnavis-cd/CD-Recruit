import { PrismaClient } from "@prisma/client";
import * as Minio from "minio";

const prisma = new PrismaClient();

const minioClient = new Minio.Client({
  endPoint: "localhost",
  port: 9000,
  useSSL: false,
  accessKey: "minioadmin",
  secretKey: "minioadmin",
});

async function main() {
  const sessionId = "7eb79be3-d12b-4af4-9118-a8fd417f05df";
  console.log(`=== CHECKING MINIO OBJECTS FOR SESSION: ${sessionId} ===`);
  
  for (let i = 1; i <= 3; i++) {
    const key = `sessions/${sessionId}/identity-captures/window_${i}.jpg`;
    try {
      const stat = await minioClient.statObject("cd-recruit-biometric", key);
      console.log(`✓ MinIO Object Found! Key: cd-recruit-biometric/${key} | Size: ${stat.size} bytes | LastModified: ${stat.lastModified}`);
    } catch (e: any) {
      console.error(`✗ Key cd-recruit-biometric/${key} failed: ${e.message}`);
    }
  }
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
