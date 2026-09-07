import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  Logger,
} from "@nestjs/common";
import { Observable, of, from } from "rxjs";
import { switchMap, tap } from "rxjs/operators";
import { RedisService } from "../redis/redis.service";

const DEFAULT_IDEMPOTENCY_TTL_SECONDS = 86400; // 24 hours

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(private readonly redisService: RedisService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();

    // Read Idempotency-Key header (case-insensitive)
    const idempotencyKey =
      (request.headers["idempotency-key"] as string) ||
      (request.headers["Idempotency-Key"] as string);

    if (!idempotencyKey || !idempotencyKey.trim()) {
      return next.handle();
    }

    const trimmedKey = idempotencyKey.trim();
    const partnerId = request.partner?.id;
    const userId = request.user?.id;
    const sessionId = request.params?.sessionId || request.params?.id || request.body?.sessionId;

    let scopePrefix = "global";
    if (partnerId) {
      scopePrefix = `partner:${partnerId}`;
    } else if (userId) {
      scopePrefix = `user:${userId}`;
    } else if (sessionId) {
      scopePrefix = `session:${sessionId}`;
    } else {
      const clientIp =
        (request.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
        request.ip ||
        "anon";
      const sanitizedIp = clientIp.replace(/[^a-zA-Z0-9.:]/g, "").slice(0, 45) || "anon";
      scopePrefix = `ip:${sanitizedIp}`;
    }

    const cacheKey = `idempotency:${scopePrefix}:${trimmedKey}`;

    return from(this.redisService.get(cacheKey)).pipe(
      switchMap((cachedResponse: string | null) => {
        if (cachedResponse) {
          this.logger.debug(`Idempotency cache hit for key: ${cacheKey}`);
          try {
            const parsed = JSON.parse(cachedResponse);
            return of(parsed);
          } catch (err) {
            this.logger.warn(`Failed to parse cached response for key ${cacheKey}`);
          }
        }

        return next.handle().pipe(
          tap(async (responseBody: any) => {
            if (responseBody !== undefined) {
              try {
                await this.redisService.set(
                  cacheKey,
                  JSON.stringify(responseBody),
                  DEFAULT_IDEMPOTENCY_TTL_SECONDS,
                );
                this.logger.debug(`Cached idempotent response for key: ${cacheKey}`);
              } catch (err: any) {
                this.logger.warn(`Failed to cache idempotent response: ${err.message}`);
              }
            }
          }),
        );
      }),
    ) as any;
  }
}
