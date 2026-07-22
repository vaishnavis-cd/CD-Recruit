export abstract class ObjectStoragePort {
  abstract getSignedUrl(
    bucket: string,
    key: string,
    ttlSeconds?: number,
  ): Promise<string | null>;

  abstract putObject(
    bucketName: string,
    objectKey: string,
    buffer: Buffer,
    metaData?: any,
  ): Promise<boolean>;

  abstract deleteObject(bucketName: string, objectKey: string): Promise<boolean>;
}
