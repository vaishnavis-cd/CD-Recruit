import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";

async function bootstrap(): Promise<void> {
  const logger = new Logger("Bootstrap");

  const app = await NestFactory.create(AppModule, {
    // Structured JSON logs — easier to parse in prod; readable in dev
    logger: ["error", "warn", "log", "debug"],
  });

  // ── Global prefix ──────────────────────────────────────────────────────
  // Every route is served under /api/v1 — matches API_CONTRACT.md base URL.
  app.setGlobalPrefix("api/v1");

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

  const configService = app.get(ConfigService);
  const port = configService.get<number>("app.port") || 3001;

  if (process.env.INFRA_MODE === "local" && process.env.NODE_ENV === "production") {
    throw new Error("INFRA_MODE=local must never run with NODE_ENV=production");
  }

  await app.listen(port);
  logger.log(`CD-Recruit API listening on http://localhost:${port}/api/v1`);
  logger.log(`Health check: http://localhost:${port}/api/v1/health`);
}

bootstrap().catch((err) => {
  console.error("Fatal error during bootstrap:", err);
  process.exit(1);
});

