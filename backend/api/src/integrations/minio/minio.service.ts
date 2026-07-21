import { Injectable, OnModuleInit, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as Minio from "minio";
import { ObjectStoragePort } from "../storage/object-storage.port";

@Injectable()
export class MinioService extends ObjectStoragePort implements OnModuleInit {
  private readonly logger = new Logger(MinioService.name);
  private minioClient: Minio.Client | null = null;
  private bucketBiometric: string;
  private bucketGeneral: string;

  constructor(private readonly configService: ConfigService) {
    super();
    this.bucketBiometric = this.configService.get<string>(
      "app.minio.bucketBiometric",
    ) ?? "";
    this.bucketGeneral = this.configService.get<string>(
      "app.minio.bucketGeneral",
    ) ?? "";
  }

  async onModuleInit() {
    try {
      const endPoint = this.configService.get<string>("app.minio.endpoint") ?? "";
      const port = this.configService.get<number>("app.minio.port");
      const useSSL = this.configService.get<boolean>("app.minio.useSsl");
      const accessKey = this.configService.get<string>("app.minio.accessKey") ?? "";
      const secretKey = this.configService.get<string>("app.minio.secretKey") ?? "";

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
        this.configService.get<number>("app.minio.evidenceUrlTtl");
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

  async deleteObject(bucketName: string, objectKey: string): Promise<boolean> {
    if (!this.minioClient) {
      this.logger.warn("MinIO client is not initialized. Cannot delete object.");
      return false;
    }
    try {
      await this.minioClient.removeObject(bucketName, objectKey);
      return true;
    } catch (error) {
      this.logger.error(
        `Error deleting object from ${bucketName}/${objectKey}: ${error.message}`,
      );
      return false;
    }
  }
}
