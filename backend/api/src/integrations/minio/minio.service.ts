import { Injectable, OnModuleInit, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as Minio from "minio";

@Injectable()
export class MinioService implements OnModuleInit {
  private readonly logger = new Logger(MinioService.name);
  private minioClient: Minio.Client | null = null;
  private bucketBiometric: string;
  private bucketGeneral: string;
  public storageHealthy = false;

  constructor(private readonly configService: ConfigService) {
    this.bucketBiometric =
      this.configService.get<string>("minio.bucketBiometric") ??
      this.configService.get<string>("app.minio.bucketBiometric") ??
      "cd-recruit-biometric";
    this.bucketGeneral =
      this.configService.get<string>("minio.bucketGeneral") ??
      this.configService.get<string>("app.minio.bucketGeneral") ??
      "cd-recruit-general";
  }

  async onModuleInit() {
    try {
      const endPoint =
        this.configService.get<string>("minio.endpoint") ??
        this.configService.get<string>("app.minio.endpoint") ??
        "localhost";
      const port =
        this.configService.get<number>("minio.port") ??
        this.configService.get<number>("app.minio.port") ??
        9000;
      const useSSL =
        this.configService.get<boolean>("minio.useSsl") ??
        this.configService.get<boolean>("app.minio.useSsl") ??
        false;
      const accessKey =
        (this.configService.get<string>("minio.accessKey") ||
        this.configService.get<string>("app.minio.accessKey") ||
        "minioadmin").trim() || "minioadmin";
      const secretKey =
        (this.configService.get<string>("minio.secretKey") ||
        this.configService.get<string>("app.minio.secretKey") ||
        "minioadmin").trim() || "minioadmin";

      this.minioClient = new Minio.Client({
        endPoint,
        port,
        useSSL,
        accessKey,
        secretKey,
        region: "us-east-1",
      });

      this.logger.log(
        `MinIO Client configured for endpoint: ${endPoint}:${port}`,
      );
      await this.ensureBucketsExist();
      this.storageHealthy = true;
    } catch (error: any) {
      this.storageHealthy = false;
      this.logger.warn(
        `MinIO Initialization Warning (${error.message}). Storage running in fallback mode.`,
      );
    }
  }

  private async ensureBucketsExist() {
    if (!this.minioClient) {
      this.storageHealthy = false;
      return;
    }

    const buckets = [this.bucketBiometric, this.bucketGeneral];
    for (const bucket of buckets) {
      if (!bucket) continue;
      try {
        const exists = await this.minioClient.bucketExists(bucket);
        if (!exists) {
          await this.minioClient.makeBucket(bucket, "us-east-1");
          this.logger.log(`Created MinIO bucket: ${bucket}`);
        } else {
          this.logger.log(`MinIO bucket exists: ${bucket}`);
        }
      } catch (error: any) {
        const msg = error.message || "";
        const code = error.code || "";
        if (
          msg.includes("already own it") ||
          code === "BucketAlreadyOwnedByYou" ||
          code === "BucketAlreadyExists"
        ) {
          this.logger.log(`MinIO bucket already exists and owned: ${bucket}`);
          continue;
        }
        this.storageHealthy = false;
        this.logger.warn(
          `Could not ensure MinIO bucket "${bucket}" exists (${error.message}). Falling back to local disk storage.`,
        );
        break;
      }
    }
  }

  /**
   * Health ping for readiness check and startup assertion.
   */
  async checkHealth(): Promise<boolean> {
    if (!this.minioClient || !this.storageHealthy) {
      return false;
    }
    try {
      if (this.bucketBiometric) {
        await this.minioClient.bucketExists(this.bucketBiometric);
      }
      return true;
    } catch (error: any) {
      this.storageHealthy = false;
      this.logger.error(`MinIO health check failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Generates a time-limited presigned GET URL for a biometric evidence clip.
   */
  async getSignedUrl(
    bucketName: string,
    objectKey: string,
    ttlSeconds?: number,
  ): Promise<string | null> {
    if (!this.minioClient || !this.storageHealthy) {
      this.logger.warn("MinIO client is not initialized or storage is unhealthy. Returning null url.");
      return null;
    }

    try {
      const ttl =
        ttlSeconds ??
        this.configService.get<number>("evidenceClipUrlTtlSeconds") ??
        this.configService.get<number>("app.minio.evidenceUrlTtl") ??
        3600;
      const url = await this.minioClient.presignedGetObject(
        bucketName,
        objectKey,
        ttl > 0 ? ttl : 3600,
      );
      return url;
    } catch (error: any) {
      this.logger.error(
        `Error generating presigned URL for ${bucketName}/${objectKey}: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Retrieves a readable stream for a biometric evidence clip.
   */
  async getObjectStream(bucketName: string, objectKey: string) {
    if (!this.minioClient || !this.storageHealthy) {
      return null;
    }
    try {
      return await this.minioClient.getObject(bucketName, objectKey);
    } catch (error: any) {
      this.logger.error(`Error getting object stream ${bucketName}/${objectKey}: ${error.message}`);
      return null;
    }
  }

  /**
   * Uploads an object buffer to the specified bucket.
   */
  async putObject(
    bucketName: string,
    objectKey: string,
    buffer: Buffer,
    metaData?: Minio.ItemBucketMetadata,
  ): Promise<boolean> {
    if (!this.minioClient || !this.storageHealthy) {
      this.logger.warn("MinIO client is not initialized or storage is unhealthy. Cannot put object.");
      return false;
    }
    try {
      await this.minioClient.putObject(
        bucketName,
        objectKey,
        buffer,
        buffer.length,
        metaData,
      );
      return true;
    } catch (error: any) {
      this.logger.error(
        `Error putting object to ${bucketName}/${objectKey}: ${error.message}`,
      );
      return false;
    }
  }

  async deleteObject(bucketName: string, objectKey: string): Promise<boolean> {
    if (!this.minioClient || !this.storageHealthy) {
      this.logger.warn("MinIO client is not initialized or storage is unhealthy. Cannot delete object.");
      return false;
    }
    try {
      await this.minioClient.removeObject(bucketName, objectKey);
      return true;
    } catch (error: any) {
      this.logger.error(
        `Error deleting object from ${bucketName}/${objectKey}: ${error.message}`,
      );
      return false;
    }
  }
}
