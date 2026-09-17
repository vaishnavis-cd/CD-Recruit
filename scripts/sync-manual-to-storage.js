/**
 * Syncs the Proctora Enterprise User Manual to MinIO Object Storage.
 *
 * Usage: node scripts/sync-manual-to-storage.js
 */
const Minio = require('minio');
const fs = require('fs');
const path = require('path');

async function syncManual() {
  const endPoint = process.env.MINIO_ENDPOINT || 'localhost';
  const port = parseInt(process.env.MINIO_PORT || '9000', 10);
  const useSSL = process.env.MINIO_USE_SSL === 'true';
  const accessKey = (process.env.MINIO_ACCESS_KEY || 'minioadmin').trim();
  const secretKey = (process.env.MINIO_SECRET_KEY || 'minioadmin').trim();
  const bucket = process.env.MINIO_BUCKET_GENERAL || 'cd-recruit-general';

  const mc = new Minio.Client({
    endPoint,
    port,
    useSSL,
    accessKey,
    secretKey,
    region: 'us-east-1'
  });

  const manualPath = path.resolve(__dirname, '../docs/PROCTORA_ENTERPRISE_USER_MANUAL.md');
  if (!fs.existsSync(manualPath)) {
    console.error(`Manual not found at: ${manualPath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(manualPath);
  const objectKey = 'manuals/v1.0.0/PROCTORA_ENTERPRISE_USER_MANUAL.md';
  const latestKey = 'manuals/latest/PROCTORA_ENTERPRISE_USER_MANUAL.md';

  const exists = await mc.bucketExists(bucket);
  if (!exists) {
    await mc.makeBucket(bucket, 'us-east-1');
    console.log(`Created bucket: ${bucket}`);
  }

  const metaData = {
    'Content-Type': 'text/markdown; charset=utf-8',
    'x-amz-meta-version': '1.0.0',
    'x-amz-meta-title': 'Proctora Enterprise User Manual',
    'x-amz-meta-updated-at': new Date().toISOString()
  };

  // Upload versioned and latest copy
  await mc.putObject(bucket, objectKey, content, metaData);
  await mc.putObject(bucket, latestKey, content, metaData);

  console.log(`Successfully synced to MinIO:`);
  console.log(`- Versioned: s3://${bucket}/${objectKey}`);
  console.log(`- Latest:    s3://${bucket}/${latestKey}`);
  console.log(`- Size:      ${content.length} bytes`);

  const presignedUrl = await mc.presignedGetObject(bucket, latestKey, 7 * 24 * 3600);
  console.log(`\nTemporary Download URL (7 days):`);
  console.log(presignedUrl);
}

syncManual().catch((err) => {
  console.error('Error syncing manual to MinIO:', err);
  process.exit(1);
});
