import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";
import { AppConfig } from "../../config/configuration";

export function generateJudge0WebhookSignature(
  executionId: string,
  totalTests: number,
  secret: string,
): string {
  return crypto
    .createHmac("sha256", secret)
    .update(`${executionId}:${totalTests}`)
    .digest("hex");
}

export function verifyJudge0WebhookSignature(
  executionId: string,
  totalTests: number,
  providedSignature: string,
  secret: string,
): boolean {
  if (!providedSignature || !executionId || !totalTests || !secret) {
    return false;
  }
  const expectedSignature = generateJudge0WebhookSignature(executionId, totalTests, secret);
  try {
    const providedBuffer = Buffer.from(providedSignature, "hex");
    const expectedBuffer = Buffer.from(expectedSignature, "hex");
    if (providedBuffer.length !== expectedBuffer.length) {
      return false;
    }
    return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

@Injectable()
export class Judge0WebhookGuard implements CanActivate {
  constructor(private readonly configService: ConfigService<AppConfig, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const executionId = request.query.executionId as string;
    const totalTests = parseInt(request.query.totalTests as string, 10);
    const signature = (request.query.sig || request.headers["x-judge0-signature"]) as string;
    const secret =
      this.configService.get<string>("judge0WebhookSecret", { infer: true }) ||
      "cdrecruit-judge0-secret-key";

    if (!verifyJudge0WebhookSignature(executionId, totalTests, signature, secret)) {
      throw new UnauthorizedException("Invalid or missing Judge0 webhook signature");
    }
    return true;
  }
}
