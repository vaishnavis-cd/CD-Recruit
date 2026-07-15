import { Global, Module } from "@nestjs/common";
import { MinioService } from "./minio.service";
import { ConfigModule } from "@nestjs/config";

@Global()
@Module({
  imports: [ConfigModule],
  providers: [MinioService],
  exports: [MinioService],
})
export class MinioModule {}
