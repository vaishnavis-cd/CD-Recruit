import { Module, Global } from "@nestjs/common";
import { MinioService } from "./minio.service";
import { ObjectStoragePort } from "../storage/object-storage.port";
import { LocalFakeObjectStorageProvider } from "../storage/local-fake-object-storage.provider";

@Global()
@Module({
  providers: [
    MinioService,
    LocalFakeObjectStorageProvider,
    {
      provide: ObjectStoragePort,
      useFactory: (minioService: MinioService, fakeProvider: LocalFakeObjectStorageProvider) => {
        const mode = process.env.INFRA_MODE ?? "local";
        const active = mode === "mock" ? fakeProvider : minioService;
        console.log(`[StorageProvider] ObjectStoragePort = ${active.constructor.name}`);
        return active;
      },
      inject: [MinioService, LocalFakeObjectStorageProvider],
    },
  ],
  exports: [ObjectStoragePort],
})
export class MinioModule {}
