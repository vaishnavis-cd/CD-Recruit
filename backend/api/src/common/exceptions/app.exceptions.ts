import { HttpException, HttpStatus } from "@nestjs/common";

/**
 * Base Application Exception with error code and status.
 */
export class AppException extends HttpException {
  constructor(
    public readonly code: string,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
  ) {
    super({ code, message }, status);
  }
}

/**
 * Thrown when a resource is gone and cannot be recovered.
 * Maps to HTTP 410 Gone.
 *
 * Used for:
 *   - INVITE_TOKEN_EXPIRED — token past its TTL
 *   - RESUME_WINDOW_EXPIRED — grace window lapsed
 *   - MAX_DISCONNECTS_REACHED — session auto-submitted
 */
export class GoneException extends AppException {
  constructor(body: { code: string; message: string } | string) {
    if (typeof body === "string") {
      super("RESOURCE_GONE", body, HttpStatus.GONE);
    } else {
      super(body.code || "RESOURCE_GONE", body.message, HttpStatus.GONE);
    }
  }
}
