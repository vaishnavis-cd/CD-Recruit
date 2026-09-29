import { Module } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { NosqlController } from "./nosql.controller";
import { NosqlValidatorService } from "./nosql-validator.service";
import { NosqlSandboxService } from "./nosql-sandbox.service";
import { NosqlExecutionService } from "./nosql-execution.service";
import { PrismaModule } from "../../prisma/prisma.module";
import { MinioModule } from "../../integrations/minio/minio.module";
import { ResultComparatorService } from "../../sql/result-comparator.service";

@Module({
  imports: [PrismaModule, MinioModule],
  controllers: [NosqlController],
  providers: [
    Reflector,
    NosqlValidatorService,
    NosqlSandboxService,
    NosqlExecutionService,
    ResultComparatorService,
  ],
  exports: [NosqlSandboxService],
})
export class NosqlModule {}
