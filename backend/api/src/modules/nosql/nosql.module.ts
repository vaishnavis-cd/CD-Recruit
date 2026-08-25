import { Module } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { NosqlController } from "./nosql.controller";
import { NosqlValidatorService } from "./nosql-validator.service";
import { NosqlSandboxService } from "./nosql-sandbox.service";
import { NosqlExecutionService } from "./nosql-execution.service";
import { PrismaModule } from "../../prisma/prisma.module";
import { MinioModule } from "../../integrations/minio/minio.module";
import { SqlModule } from "../../sql/sql.module";

@Module({
  imports: [PrismaModule, MinioModule, SqlModule],
  controllers: [NosqlController],
  providers: [
    Reflector,
    NosqlValidatorService,
    NosqlSandboxService,
    NosqlExecutionService,
  ],
  exports: [NosqlSandboxService],
})
export class NosqlModule {}
