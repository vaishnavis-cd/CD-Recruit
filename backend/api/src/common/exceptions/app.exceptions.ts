import { HttpException, HttpStatus } from "@nestjs/common";

/**
 * Thrown when a resource is gone and cannot be recovered.
 * Maps to HTTP 410 Gone.
 *
 * Used for:
 *   - INVITE_TOKEN_EXPIRED — token past its TTL
 *   - RESUME_WINDOW_EXPIRED — grace window lapsed
 *   - MAX_DISCONNECTS_REACHED — session auto-submitted
 */
export class GoneException extends HttpException {
  constructor(body: { code: string; message: string }) {
    super(body, HttpStatus.GONE);
  }
}
