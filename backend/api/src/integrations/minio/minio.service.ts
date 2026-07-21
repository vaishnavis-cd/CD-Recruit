import { Injectable, OnModuleInit, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as Minio from "minio";
import { ObjectStoragePort } from "../storage/object-storage.port";
import { AppConfig } from "../../config/configuration";

@Injectable()
export class MinioService extends ObjectStoragePort implements OnModuleInit {
  private readonly logger = new Logger(MinioService.name);
  private minioClient: Minio.Client | null = null;
  private bucketBiometric: string;
  /** Primary bucket for biometric & proctoring clips. */
  private bucketGeneral: string;

  constructor(private readonly configService: ConfigService<AppConfig, true>) {
    super();
    this.bucketBiometric = this.configService.get("minio.bucketBiometric", { infer: true });
    /** bucketGeneral is dedicated for non-biometric general platform storage (resumes, exports, attachments). */
    this.bucketGeneral = this.configService.get("minio.bucketGeneral", { infer: true });
  }

  async onModuleInit() {
    try {
      const endPoint = this.configService.get("minio.endpoint", { infer: true });
      const port = this.configService.get("minio.port", { infer: true });
      const useSSL = this.configService.get("minio.useSsl", { infer: true });
      const accessKey = this.configService.get("minio.accessKey", { infer: true });
      const secretKey = this.configService.get("minio.secretKey", { infer: true });

      this.minioClient = new Minio.Client({
        endPoint,
        port,
        useSSL,
        accessKey,
        secretKey,
      });

      this.logger.log(
        `MinIO Client configured for endpoint: ${endPoint}:${port}`,
      );
      await this.ensureBucketsExist();
    } catch (error) {
      this.logger.error(
        "Failed to initialize MinIO Client. Presigned URLs will return null.",
        error,
      );
      this.minioClient = null;
    }
  }

  private async ensureBucketsExist() {
    if (!this.minioClient) return;

    try {
      const buckets = [this.bucketBiometric, this.bucketGeneral];
      for (const bucket of buckets) {
        const exists = await this.minioClient.bucketExists(bucket);
        if (!exists) {
          await this.minioClient.makeBucket(bucket);
          this.logger.log(`Created MinIO bucket: ${bucket}`);
        }
      }
    } catch (error) {
      this.logger.warn(
        `Could not ensure buckets exist. Make sure MinIO is online. Error: ${error.message}`,
      );
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
    if (!this.minioClient) {
      this.logger.warn("MinIO client is not initialized. Returning null url.");
      return null;
    }

    try {
      const ttl =
        ttlSeconds ??
        this.configService.get("evidenceClipUrlTtlSeconds", { infer: true });
      const url = await this.minioClient.presignedGetObject(
        bucketName,
        objectKey,
        ttl,
      );
      return url;
    } catch (error) {
      this.logger.error(
        `Error generating presigned URL for ${bucketName}/${objectKey}: ${error.message}`,
      );
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
    if (!this.minioClient) {
      this.logger.warn("MinIO client is not initialized. Cannot put object.");
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
    } catch (error) {
      this.logger.error(
        `Error putting object to ${bucketName}/${objectKey}: ${error.message}`,
      );
      return false;
    }
  }
}
