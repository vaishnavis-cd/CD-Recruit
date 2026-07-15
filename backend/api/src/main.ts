import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS for our candidate-web and admin-web frontends
  app.enableCors({
    origin: "*",
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
    credentials: true,
  });

  // Set global API routing prefix to match VITE_API_BASE_URL config
  app.setGlobalPrefix("api/v1");

  // Enable validation pipe for DTO validation decorators
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  const configService = app.get(ConfigService);
  const port = configService.get<number>("API_PORT") || 3001;

  console.log(`🚀 CD Recruit backend API starting on port ${port}...`);
  await app.listen(port);
  console.log(`🚀 API is running at http://localhost:${port}/api/v1`);
}

bootstrap();
