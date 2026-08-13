import * as Minio from "minio";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "../../../.env") });
dotenv.config({ path: path.join(__dirname, "../../.env") });

async function testMinio() {
  console.log("==================================================");
  console.log("     TESTING MINIO CONNECTION & BUCKET STATUS");
  console.log("==================================================");

  const endPoint = process.env.MINIO_ENDPOINT || "localhost";
  const port = parseInt(process.env.MINIO_PORT || "9000", 10);
  const useSSL = process.env.MINIO_USE_SSL === "true";
  const accessKey = process.env.MINIO_ACCESS_KEY || "minioadmin";
  const secretKey = process.env.MINIO_SECRET_KEY || "minioadmin";

  console.log(`Endpoint: ${endPoint}:${port} (SSL: ${useSSL})`);
  console.log(`Access Key: ${accessKey}`);

  const minioClient = new Minio.Client({
    endPoint,
    port,
    useSSL,
    accessKey,
    secretKey,
    region: "us-east-1",
  });

  try {
    const buckets = await minioClient.listBuckets();
    console.log("✅ Successfully connected to MinIO!");
    console.log(`Buckets count: ${buckets.length}`);
    for (const b of buckets) {
      console.log(` - Bucket: "${b.name}" | CreationDate: ${b.creationDate}`);
    }
  } catch (err: any) {
    console.error("❌ Failed to connect to MinIO:", err.message || err);
    console.error("  Error Code:", err.code);
    console.error("  Error Stack:", err.stack);
  }
}

testMinio().catch(console.error);
