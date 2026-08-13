import { NestFactory } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { Module } from "@nestjs/common";
import { MinioModule } from "../src/integrations/minio/minio.module";
import { MinioService } from "../src/integrations/minio/minio.service";
import { configuration } from "../src/config/configuration";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    MinioModule,
  ],
})
class TestModule {}

async function testNestMinio() {
  const app = await NestFactory.createApplicationContext(TestModule);
  const minioService = app.get(MinioService);

  console.log(`minioService.storageHealthy BEFORE = ${minioService.storageHealthy}`);
  try {
    const res = await (minioService as any).minioClient.bucketExists("cd-recruit-biometric");
    console.log(`bucketExists result: ${res}`);
  } catch (err: any) {
    console.error("EXACT ERROR FROM BUCKET EXISTS:", err);
  }

  await app.close();
}

testNestMinio().catch(console.error);
