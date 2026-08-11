import "reflect-metadata";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

import { NestFactory } from "@nestjs/core";
import { ValidationPipe, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { MinioService } from "./integrations/minio/minio.service";

async function bootstrap(): Promise<void> {
  const logger = new Logger("Bootstrap");

  const app = await NestFactory.create(AppModule, {
    // Structured JSON logs — easier to parse in prod; readable in dev
    logger: ["error", "warn", "log", "debug"],
  });

  // ── Global prefix ──────────────────────────────────────────────────────
  // Every route is served under /api/v1 — matches API_CONTRACT.md base URL.
  // Exclude api-docs so Swagger UI assets load cleanly at /api-docs and /api/v1/api-docs.
  app.setGlobalPrefix("api/v1", {
    exclude: ["api-docs", "api-docs/(.*)", "api/v1/api-docs", "api/v1/api-docs/(.*)"],
  });

  // ── CORS ──────────────────────────────────────────────────────────────
  // Allows the candidate-web (localhost:3000) and admin-web to reach the API.
  app.enableCors({
    origin: true, // reflect request origin in dev; lock to specific origins in prod
    credentials: true,
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
  });

  // ── Global validation pipe ────────────────────────────────────────────
  // whitelist:             strips properties not declared in DTOs
  // forbidNonWhitelisted:  throws 400 if unknown properties are sent
  // transform:             auto-transforms payloads to DTO class instances
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());

  // ── Swagger Configuration (Must be registered BEFORE app.init()) ─────────────
  const swaggerConfig = new DocumentBuilder()
    .setTitle("CD-Recruit Platform API")
    .setDescription("Interactive OpenAPI documentation for testing candidate, admin, simulation, and proctoring endpoints")
    .setVersion("1.0")
    .addBearerAuth(
      {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        name: "Authorization",
        description: "Enter Candidate / Staff JWT token",
        in: "header",
      },
      "bearer",
    )
    .addTag("auth", "Authentication & token resolution")
    .addTag("candidate", "Candidate session management & submissions")
    .addTag("admin", "Recruiter drives, candidates & reviewer decisions")
    .addTag("simulation", "Contextual simulation workspace & 4-part evaluation")
    .addTag("proctoring", "Proctoring integrity & evidence upload")
    .addTag("mcq", "MCQ assessment module")
    .addTag("sql", "SQL assessment & sandbox execution")
    .addTag("coding", "Coding assessment & test execution")
    .build();

  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);

  const swaggerOptions = {
    useGlobalPrefix: false,
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      filter: true,
    },
  };

  SwaggerModule.setup("api-docs", app, swaggerDocument, swaggerOptions);
  SwaggerModule.setup("api/v1/api-docs", app, swaggerDocument, swaggerOptions);

  await app.init();

  const configService = app.get(ConfigService);
  const port = configService.get<number>("port") || 3001;

  const infraMode = process.env.INFRA_MODE ?? "local";
  if (infraMode === "local" && process.env.NODE_ENV === "production") {
    throw new Error("INFRA_MODE=local must never run with NODE_ENV=production");
  }

  if (infraMode === "full") {
    try {
      const storage = app.get(MinioService, { strict: false });
      if (storage instanceof MinioService) {
        let healthy = false;
        const delays = [1000, 2000, 4000];
        for (let i = 0; i < delays.length; i++) {
          healthy = await storage.checkHealth();
          if (healthy) break;
          logger.warn(`MinIO startup health check failed (attempt ${i + 1}/3). Retrying in ${delays[i]}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delays[i]));
        }
        if (!healthy) {
          const errMsg = "FATAL: MinIO object storage is unreachable in INFRA_MODE=full after 3 retries. Refusing to boot process.";
          logger.error(errMsg);
          throw new Error(errMsg);
        }
        logger.log("✅ MinIO object storage startup health check passed.");
      }
    } catch (err: any) {
      if (err.message?.includes("FATAL:")) throw err;
      logger.error(`Error during MinIO startup assertion: ${err.message}`);
    }
  }

  await app.listen(port, "0.0.0.0");
  logger.log(`CD-Recruit API listening on http://localhost:${port}/api/v1`);
  logger.log(`Health check: http://localhost:${port}/api/v1/health`);
  logger.log(`Swagger UI: http://localhost:${port}/api-docs`);
  logger.log(`Swagger UI (v1): http://localhost:${port}/api/v1/api-docs`);
}

bootstrap().catch((err) => {
  console.error("Fatal error during bootstrap:", err);
  process.exit(1);
});
