import { Injectable, Logger } from "@nestjs/common";
import { ObjectStoragePort } from "./object-storage.port";

@Injectable()
export class LocalFakeObjectStorageProvider extends ObjectStoragePort {
  private readonly logger = new Logger(LocalFakeObjectStorageProvider.name);

  async getSignedUrl(
    bucket: string,
    key: string,
    _ttlSeconds?: number,
  ): Promise<string | null> {
    const fakeUrl = process.env.FAKE_EVIDENCE_URL || null;
    this.logger.debug(
      `[local-fake-storage] getSignedUrl(${bucket}, ${key}) -> ${fakeUrl ?? "null"}`,
    );
    return fakeUrl;
  }

  async putObject(
    bucketName: string,
    objectKey: string,
    buffer: Buffer,
    _metaData?: any,
  ): Promise<boolean> {
    this.logger.warn(
      `[local-fake-storage] Evidence clip DISCARDED (${bucketName}/${objectKey}, size ${buffer.length}B) — set INFRA_MODE=full and configure MinIO to persist evidence.`,
    );
    return true;
  }
}
