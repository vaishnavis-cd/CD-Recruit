import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { MinioService } from "./minio.service";
import * as Minio from "minio";

jest.mock("minio");

describe("MinioService", () => {
  let service: MinioService;
  let configService: ConfigService;
  let mockMinioClient: any;

  beforeEach(async () => {
    mockMinioClient = {
      bucketExists: jest.fn().mockResolvedValue(true),
      makeBucket: jest.fn().mockResolvedValue(undefined),
      presignedGetObject: jest.fn().mockResolvedValue("http://127.0.0.1:9000/cd-recruit-biometric/clip.webm?X-Amz-Expires=3600"),
      putObject: jest.fn().mockResolvedValue({ etag: "mock-etag" }),
      removeObject: jest.fn().mockResolvedValue(undefined),
    };

    (Minio.Client as unknown as jest.Mock).mockImplementation(() => mockMinioClient);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MinioService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === "evidenceClipUrlTtlSeconds") return 3600;
              if (key === "minio.endpoint") return "localhost";
              if (key === "minio.port") return 9000;
              if (key === "minio.useSsl") return false;
              if (key === "minio.accessKey") return "minioadmin";
              if (key === "minio.secretKey") return "minioadmin";
              if (key === "minio.bucketBiometric") return "cd-recruit-biometric";
              if (key === "minio.bucketGeneral") return "cd-recruit-general";
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<MinioService>(MinioService);
    configService = module.get<ConfigService>(ConfigService);
    await service.onModuleInit();
  });

  it("should be defined and healthy", () => {
    expect(service).toBeDefined();
    expect(service.storageHealthy).toBe(true);
  });

  it("should call presignedGetObject with TTL read from evidenceClipUrlTtlSeconds config", async () => {
    const url = await service.getSignedUrl("cd-recruit-biometric", "clip.webm");
    expect(configService.get).toHaveBeenCalledWith("evidenceClipUrlTtlSeconds");
    expect(mockMinioClient.presignedGetObject).toHaveBeenCalledWith(
      "cd-recruit-biometric",
      "clip.webm",
      3600,
    );
    expect(url).toContain("X-Amz-Expires=3600");
  });

  it("should use fallback TTL 3600 if config returns undefined or <= 0", async () => {
    (configService.get as jest.Mock).mockReturnValue(undefined);
    await service.getSignedUrl("cd-recruit-biometric", "clip.webm");
    expect(mockMinioClient.presignedGetObject).toHaveBeenCalledWith(
      "cd-recruit-biometric",
      "clip.webm",
      3600,
    );
  });
});
