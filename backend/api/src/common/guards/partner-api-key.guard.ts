import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { hashApiKey } from "../utils/api-key.util";

@Injectable()
export class PartnerApiKeyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    const rawApiKey =
      (request.headers["x-api-key"] as string) ||
      (request.headers["X-API-Key"] as string);

    if (!rawApiKey || !rawApiKey.trim()) {
      throw new UnauthorizedException("Missing required X-API-Key header");
    }

    const hashedApiKey = hashApiKey(rawApiKey);

    const partner = await this.prisma.partner.findFirst({
      where: {
        hashedApiKey,
        isRevoked: false,
      },
    });

    if (!partner) {
      throw new UnauthorizedException("Invalid or revoked X-API-Key");
    }

    // Attach resolved partner entity to request context
    request.partner = partner;
    return true;
  }
}
