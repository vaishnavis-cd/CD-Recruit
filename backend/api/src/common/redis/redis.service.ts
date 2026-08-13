import { Injectable, OnModuleDestroy, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private isConnected = false;

  constructor(private readonly configService: ConfigService) {
    const redisUrl =
      this.configService.get<string>("REDIS_URL") ||
      this.configService.get<string>("redisUrl") ||
      "redis://localhost:6379";

    try {
      this.client = new Redis(redisUrl, {
        maxRetriesPerRequest: 2,
        retryStrategy: (times) => {
          if (times > 3) {
            return null; // Stop retrying after 3 attempts
          }
          return Math.min(times * 100, 1000);
        },
        lazyConnect: true,
      });

      this.client.on("connect", () => {
        this.isConnected = true;
      });

      this.client.on("error", (err) => {
        this.isConnected = false;
        this.logger.warn(`Redis connection error: ${err.message}`);
      });

      // Attempt lazy connect
      this.client.connect().catch((err) => {
        this.logger.warn(`Redis initial connect failed: ${err.message}`);
      });
    } catch (err: any) {
      this.logger.warn(`Failed to initialize Redis client: ${err.message}`);
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.client || !this.isConnected) return null;
    try {
      return await this.client.get(key);
    } catch (err: any) {
      this.logger.warn(`Redis GET failed for key ${key}: ${err.message}`);
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds: number = 86400): Promise<void> {
    if (!this.client || !this.isConnected) return;
    try {
      await this.client.set(key, value, "EX", ttlSeconds);
    } catch (err: any) {
      this.logger.warn(`Redis SET failed for key ${key}: ${err.message}`);
    }
  }

  async del(key: string): Promise<void> {
    if (!this.client || !this.isConnected) return;
    try {
      await this.client.del(key);
    } catch (err: any) {
      this.logger.warn(`Redis DEL failed for key ${key}: ${err.message}`);
    }
  }

  onModuleDestroy() {
    if (this.client) {
      this.client.disconnect();
    }
  }
}
