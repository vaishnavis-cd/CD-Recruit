import { Module, Global } from "@nestjs/common";
import { MinioService } from "./minio.service";
import { ObjectStoragePort } from "../storage/object-storage.port";
import { LocalFakeObjectStorageProvider } from "../storage/local-fake-object-storage.provider";

const infraMode = process.env.INFRA_MODE ?? "local";
const isFull = infraMode === "full";

@Global()
@Module({
  providers: [
    ...(isFull ? [MinioService] : [LocalFakeObjectStorageProvider]),
    {
      provide: ObjectStoragePort,
      useExisting: isFull ? MinioService : LocalFakeObjectStorageProvider,
    },
  ],
  exports: [ObjectStoragePort],
})
export class MinioModule {}
